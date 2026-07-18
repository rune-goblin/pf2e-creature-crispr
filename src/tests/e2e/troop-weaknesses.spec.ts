import { test, expect, MODULE_ID } from './fixtures/foundry-clients';

const DIRE_WOLF = 'Compendium.pf2e.pathfinder-monster-core.Actor.AFWmiIBJ7ypgydQD';

// Troop-ness (the `troop` trait + guideline area/splash weaknesses) used to be applied only by the
// save target, via `troopAdjusted`. `convertActorToTroop` resolves whichever target is registered, so
// a host with its own target silently persisted troops with neither. The conversion now stamps them
// itself; this spec pins that by saving through a target that deliberately never calls troopAdjusted.
// Verified 2026-07-18 by disabling the stamp — the naive target then received traits ["animal"] only.
test.describe('troop weaknesses survive any save target', () => {
  test('a save target that skips troopAdjusted still receives a complete troop', async ({ gmPage }) => {
    const received = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;
        const seen: { traits?: string[]; weaknesses?: { type: string; value: number }[] } = {};

        api.registerSaveTarget({
          id: 'e2e-naive-target',
          label: 'Naive (no troopAdjusted)',
          loadCreatureData: () => undefined,
          createActor: async () => 'noop',
          updateActor: async (_id: string, creature: any) => {
            seen.traits = [...creature.traits];
            seen.weaknesses = creature.weaknesses.map((w: any) => ({ type: w.type, value: w.value }));
          },
          cloneActor: async () => 'noop',
          exportActor: async () => {}
        });

        const id = await api.importCreatureFromCompendium(uuid);
        await api.convertActorToTroop(id, { saveTargetId: 'e2e-naive-target' });
        (window as any).game.actors.get(id)?.delete();
        return seen;
      },
      { uuid: DIRE_WOLF, mod: MODULE_ID }
    );

    expect(received.traits).toContain('troop');
    expect(received.weaknesses).toEqual(
      expect.arrayContaining([
        { type: 'area-damage', value: 8 }, // Dire Wolf L3 → troop L8 guideline values
        { type: 'splash-damage', value: 8 }
      ])
    );
  });
});
