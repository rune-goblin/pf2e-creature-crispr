import { test, expect, MODULE_ID } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

// The gap this API fills: a published troop imports at its printed level, and convertActorToTroop's
// level bump is once-only (skips already-troop actors) — so rescaleActorToLevel is the headless move.
const ORC_RAIDING_PARTY = 'Compendium.pf2e.battlecry-bestiary.Actor.pC7oMxW93OArImq9'; // level 5 troop
// Level 9 troop whose stealth carries a thematic `special` variant ("+20 in forests").
const ARBOREAL_COPSE = 'Compendium.pf2e.battlecry-bestiary.Actor.yHSlSwhlmgTZYNWs';

test.describe('rescaleActorToLevel API', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('an imported published troop rescales headlessly to the target level', async ({ gmPage }) => {
    const result = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;
        const id = await api.importCreatureFromCompendium(uuid);
        const actor = (window as any).game.actors.get(id);
        const snapshot = () => ({
          level: actor.system.details.level.value as number,
          hp: actor.system.attributes.hp.max as number,
          ac: actor.system.attributes.ac.value as number,
          traits: (actor.system.traits?.value ?? []) as string[],
          actionNames: (actor.items.contents as any[])
            .filter((i) => i.type === 'action')
            .map((i) => i.name as string)
            .sort(),
          meleeCount: (actor.items.contents as any[]).filter((i) => i.type === 'melee').length,
          weaknesses: ((actor.system.attributes.weaknesses ?? []) as any[])
            .map((w) => ({ type: w.type as string, value: w.value as number }))
            .sort((a, b) => a.type.localeCompare(b.type)),
          // Native trained skills live in _source, not the prepared statistics.
          skills: Object.fromEntries(
            Object.entries(actor._source.system.skills ?? {}).map(([slug, s]: [string, any]) => [slug, s.base as number])
          ) as Record<string, number>
        });
        const before = snapshot();
        // Already a troop: the conversion engine must not touch the level (once-only bump).
        await api.convertActorToTroop(id, {});
        const afterConvert = actor.system.details.level.value as number;
        await api.rescaleActorToLevel(id, 10);
        return { id, before, afterConvert, after: snapshot() };
      },
      { uuid: ORC_RAIDING_PARTY, mod: MODULE_ID }
    );
    trash.push(result.id);

    expect(result.before.level).toBe(5);
    expect(result.afterConvert).toBe(5);

    expect(result.after.level).toBe(10);
    expect(result.after.hp).toBeGreaterThan(result.before.hp);
    expect(result.after.ac).toBeGreaterThan(result.before.ac);
    expect(result.after.traits).toContain('troop');
    // The published action set survives the rescale — nothing duplicated, nothing dropped, and no
    // phantom strike minted from the editor's placeholder (published troops carry zero melee items).
    expect(result.after.actionNames).toEqual(result.before.actionNames);
    expect(result.after.meleeCount).toBe(0);
    // Authored area/splash 5/5 move up with the level; type set unchanged.
    expect(result.after.weaknesses.map((w) => w.type)).toEqual(['area-damage', 'splash-damage']);
    for (const [i, w] of result.after.weaknesses.entries()) {
      expect(w.value).toBeGreaterThan(result.before.weaknesses[i].value);
    }
    // Native trained skills move with the level, each keeping its benchmark position: athletics is
    // the level's "high" column (13@5 → 22@10), intimidation the "moderate" one (12@5 → 19@10).
    expect(result.before.skills).toEqual({ athletics: 13, intimidation: 12 });
    expect(result.after.skills).toEqual({ athletics: 22, intimidation: 19 });
  });

  test('a native skill special variant rescales with its base', async ({ gmPage }) => {
    const result = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;
        const id = await api.importCreatureFromCompendium(uuid);
        const actor = (window as any).game.actors.get(id);
        const stealth = () => JSON.parse(JSON.stringify(actor._source.system.skills.stealth));
        const before = stealth();
        await api.rescaleActorToLevel(id, 14);
        return { id, before, after: stealth(), level: actor.system.details.level.value as number };
      },
      { uuid: ARBOREAL_COPSE, mod: MODULE_ID }
    );
    trash.push(result.id);

    expect(result.before.base).toBe(16);
    expect(result.before.special).toEqual([{ base: 20, label: 'in forests', predicate: ['in-forests'] }]);

    expect(result.level).toBe(14);
    // 16@9 is lowMax → 23@14; the "in forests" 20@9 is the high column → 28@14. Pre-fix the special
    // stayed at 20 and the "bonus" variant ended up worse than the base.
    expect(result.after.base).toBe(23);
    expect(result.after.special).toEqual([{ base: 28, label: 'in forests', predicate: ['in-forests'] }]);
  });
});
