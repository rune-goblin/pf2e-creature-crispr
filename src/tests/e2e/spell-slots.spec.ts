import { test, expect, openBuilder, BUILDER_ID } from './fixtures/foundry-clients';
import {
  createSpellcasterNpc,
  readSpellSlots,
  deleteActors,
  type SpellcasterNpc,
} from './fixtures/creature-ui';

/**
 * A published NPC caster lists far fewer spells than a full caster's allotment, and scaling used to
 * rewrite slot counts without touching the `prepared` array that binds spell items to slots — so the
 * listed spells were left behind. These drive the real editor and assert the persisted entry.
 */
test.describe('Spell slots → scaling preserves listed spells', () => {
  const trash: string[] = [];
  let caster: SpellcasterNpc;
  let name: string;

  test.beforeEach(async ({ gmPage }) => {
    name = `__e2e_caster_${Date.now()}`;
    caster = await createSpellcasterNpc(gmPage, name, { level: 5, rank: 2, spells: 2 });
    trash.push(caster.actorId);
    await importIntoBuilder(gmPage, name, caster.actorId);
  });

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('scaling up keeps the listed spells bound and leaves the added slots blank', async ({ gmPage }) => {
    await editAndStepLevel(gmPage, name, 4);

    const slots = await readSpellSlots(gmPage, caster.actorId);
    const rank2 = slots![2];

    // Both listed spells still occupy their slots...
    for (const id of caster.spellIds) expect(rank2.prepared).toContain(id);
    // ...and nothing was auto-assigned to the slots the level bump added.
    expect(rank2.max).toBeGreaterThanOrEqual(caster.spellIds.length);
    expect(rank2.prepared.length).toBe(rank2.max);
    expect(rank2.prepared.filter((id) => id === null).length).toBe(rank2.max - caster.spellIds.length);
  });

  test('scaling down never drops an assigned spell, even below its rank', async ({ gmPage }) => {
    await editAndStepLevel(gmPage, name, -4);

    const slots = await readSpellSlots(gmPage, caster.actorId);
    const rank2 = slots![2];

    for (const id of caster.spellIds) expect(rank2.prepared).toContain(id);
    // The rank stays wide enough to hold them rather than truncating to the computed count.
    expect(rank2.max).toBeGreaterThanOrEqual(caster.spellIds.length);
  });
});

async function importIntoBuilder(page: Parameters<typeof openBuilder>[0], name: string, id: string): Promise<void> {
  await openBuilder(page);
  const win = page.locator(`#${BUILDER_ID}`);
  await win.locator('.list-header .btn-import').click();

  // Same World Actors dance as import.spec.ts: the dialog re-runs its init effect once bestiary
  // availability resolves, which can revert an early tab switch.
  const dialog = win.locator('.picker-dialog');
  await expect(dialog).toBeVisible();
  const worldTab = dialog.locator('.source-tab', { hasText: 'World Actors' });
  await expect(async () => {
    await worldTab.click();
    await expect(worldTab).toHaveClass(/active/, { timeout: 1000 });
    await expect(dialog.locator('.search-input')).toHaveAttribute('placeholder', 'Search actors...', { timeout: 1000 });
  }).toPass({ timeout: 15000 });

  await dialog.locator('.search-input').fill(name);
  await dialog.locator('.picker-item', { hasText: name }).click();
  await dialog.locator('.btn-primary', { hasText: 'Import' }).click();
  await expect(dialog).toBeHidden();
  await expect(win.locator('.creatures-table tbody tr', { hasText: name })).toBeVisible();
}

async function editAndStepLevel(page: Parameters<typeof openBuilder>[0], name: string, delta: number): Promise<void> {
  await openBuilder(page);
  const win = page.locator(`#${BUILDER_ID}`);

  await win.locator('.creatures-table tbody tr', { hasText: name })
    .locator('[aria-label="Edit creature"]').click();
  await expect(win.locator('.editor-header .header-title')).toHaveText(/Edit/);

  const label = delta > 0 ? 'Increase level' : 'Decrease level';
  for (let i = 0; i < Math.abs(delta); i++) await win.locator(`[aria-label="${label}"]`).first().click();

  await win.locator('.editor-header .btn-primary').click();
  await expect(win.locator('.creatures-table')).toBeVisible();
}
