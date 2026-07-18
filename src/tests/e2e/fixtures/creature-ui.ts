import { type Page, expect } from '@playwright/test';
import { MODULE_ID, BUILDER_ID, openBuilder } from './foundry-clients';

const WIN = `#${BUILDER_ID}`;

export type SavedCreature = { id: string; name: string; level: number; ac: number; hp: number };

/**
 * Drive the builder UI to create and save one creature, returning the persisted NPC's id/stats.
 * Assumes a GM page with the module ready. Leaves the builder on the list view.
 *
 * On Create New the editor seeds level 1 with Basic Info collapsed, so we expand it to reach the
 * name field, then step the level control to the target. The default benchmarks match the
 * 'baseline' preset, so selecting another template applies immediately (no overwrite confirm).
 */
export async function createCreatureViaUi(
  page: Page,
  opts: { name: string; level?: number; template?: string },
): Promise<SavedCreature> {
  await openBuilder(page);
  const win = page.locator(WIN);

  await win.locator('.list-header .btn-create').click();
  await expect(win.locator('.editor-header .header-title')).toHaveText(/New Creature/);

  await win.getByRole('button', { name: 'Basic Info' }).click();
  await win.locator('#basic-info-name').fill(opts.name);

  await stepLevelTo(win, 1, opts.level ?? 1);

  if (opts.template) await win.locator('#basic-info-template').selectOption(opts.template);

  await win.locator('.editor-header .btn-primary').click();
  await expect(win.locator('.creatures-table .name-link', { hasText: opts.name })).toBeVisible();

  const saved = await readCreature(page, opts.name);
  if (!saved) throw new Error(`Saved creature "${opts.name}" not found in the Creature CRISPR folder`);
  return saved;
}

/** Step the +/- level control from a known current value to the target. */
export async function stepLevelTo(win: ReturnType<Page['locator']>, from: number, to: number): Promise<void> {
  const inc = win.locator('[aria-label="Increase level"]').first();
  const dec = win.locator('[aria-label="Decrease level"]').first();
  for (let l = from; l < to; l++) await inc.click();
  for (let l = from; l > to; l--) await dec.click();
}

/** Read the persisted NPC (by name, in the Creature CRISPR folder) via the Foundry API. */
export async function readCreature(page: Page, name: string): Promise<SavedCreature | null> {
  return page.evaluate((n) => {
    const g = (window as any).game;
    const folder = g.folders.find((f: any) => f.type === 'Actor' && f.name === 'Creature CRISPR' && !f.folder);
    const actor = g.actors.find((a: any) => a.name === n && a.folder?.id === folder?.id);
    if (!actor) return null;
    return {
      id: actor.id,
      name: actor.name,
      level: actor.system?.details?.level?.value,
      ac: actor.system?.attributes?.ac?.value,
      hp: actor.system?.attributes?.hp?.max,
    };
  }, name);
}

/** Read an NPC's NPC-ness + module flag in one call, for assertions. */
export async function readCreatureMeta(page: Page, id: string): Promise<{ type: string; hasFlag: boolean } | null> {
  return page.evaluate(({ actorId, mod }) => {
    const actor = (window as any).game.actors.get(actorId);
    if (!actor) return null;
    return { type: actor.type, hasFlag: !!actor.getFlag(mod, 'creatureData') };
  }, { actorId: id, mod: MODULE_ID });
}

export async function deleteActors(page: Page, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await page.evaluate(async (list) => {
    for (const id of list) await (window as any).game.actors.get(id)?.delete();
  }, ids);
}

/** Create a plain world NPC (not in the Creature CRISPR folder) to import from. Returns its id. */
export async function createSourceNpc(page: Page, name: string, opts: { level?: number } = {}): Promise<string> {
  return page.evaluate(
    async ({ n, lvl }) => {
      const actor = await (window as any).Actor.create({
        name: n,
        type: 'npc',
        system: {
          details: { level: { value: lvl } },
          attributes: { ac: { value: 16 }, hp: { value: 30, max: 30 } },
        },
      });
      return actor.id as string;
    },
    { n: name, lvl: opts.level ?? 2 },
  );
}

export type SpellcasterNpc = { actorId: string; entryId: string; spellIds: string[] };

/**
 * Create a world NPC carrying a prepared spellcasting entry with `spells` spell items bound into
 * `rank`'s slots — the shape a published NPC caster imports as, and the one scaling has to preserve.
 */
export async function createSpellcasterNpc(
  page: Page,
  name: string,
  opts: { level?: number; rank?: number; spells?: number } = {},
): Promise<SpellcasterNpc> {
  return page.evaluate(
    async ({ n, lvl, rank, count }) => {
      const w = window as any;
      const actor = await w.Actor.create({
        name: n,
        type: 'npc',
        system: {
          details: { level: { value: lvl } },
          attributes: { ac: { value: 16 }, hp: { value: 30, max: 30 } },
        },
      });
      const [entry] = await actor.createEmbeddedDocuments('Item', [
        {
          name: 'Prepared Spells',
          type: 'spellcastingEntry',
          system: {
            prepared: { value: 'prepared' },
            tradition: { value: 'arcane' },
            spelldc: { dc: 20, value: 10 },
          },
        },
      ]);
      const spells = await actor.createEmbeddedDocuments(
        'Item',
        Array.from({ length: count }, (_, i) => ({
          name: `${n}_spell_${i}`,
          type: 'spell',
          system: { level: { value: rank }, location: { value: entry.id } },
        })),
      );
      const spellIds = spells.map((s: any) => s.id as string);
      await entry.update({
        [`system.slots.slot${rank}.max`]: count,
        [`system.slots.slot${rank}.value`]: count,
        [`system.slots.slot${rank}.prepared`]: spellIds.map((id: string) => ({ id, expended: false })),
      });
      return { actorId: actor.id as string, entryId: entry.id as string, spellIds };
    },
    { n: name, lvl: opts.level ?? 5, rank: opts.rank ?? 2, count: opts.spells ?? 2 },
  );
}

/** Per-rank `{ max, prepared }` off the actor's first spellcasting entry; `prepared` holds spell ids or null. */
export async function readSpellSlots(
  page: Page,
  actorId: string,
): Promise<Record<number, { max: number; prepared: (string | null)[] }> | null> {
  return page.evaluate((id) => {
    const actor = (window as any).game.actors.get(id);
    const entry = actor?.items?.find((i: any) => i.type === 'spellcastingEntry');
    if (!entry) return null;
    const out: Record<number, { max: number; prepared: (string | null)[] }> = {};
    for (let rank = 0; rank <= 10; rank++) {
      const slot = entry.system?.slots?.[`slot${rank}`];
      out[rank] = {
        max: slot?.max ?? 0,
        prepared: (slot?.prepared ?? []).map((p: any) => p?.id ?? null),
      };
    }
    return out;
  }, actorId);
}

/** Is this actor (by id) now in the Creature CRISPR folder with the module's data flag? */
export async function isImportedCreature(page: Page, id: string): Promise<boolean> {
  return page.evaluate(({ actorId, mod }) => {
    const g = (window as any).game;
    const a = g.actors.get(actorId);
    const folder = g.folders.find((f: any) => f.type === 'Actor' && f.name === 'Creature CRISPR' && !f.folder);
    // Require the folder to exist — `a.folder?.id === folder?.id` passed vacuously
    // (undefined === undefined) in a fresh world, masking a missing move-to-folder.
    return !!a && !!folder && a.folder?.id === folder.id && !!a.getFlag(mod, 'creatureData');
  }, { actorId: id, mod: MODULE_ID });
}
