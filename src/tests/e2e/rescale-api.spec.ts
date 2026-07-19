import { test, expect, MODULE_ID } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

// The gap this API fills: a published troop imports at its printed level, and convertActorToTroop's
// level bump is once-only (skips already-troop actors) — so rescaleActorToLevel is the headless move.
const ORC_RAIDING_PARTY = 'Compendium.pf2e.battlecry-bestiary.Actor.pC7oMxW93OArImq9'; // level 5 troop

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
            .sort((a, b) => a.type.localeCompare(b.type))
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
  });
});
