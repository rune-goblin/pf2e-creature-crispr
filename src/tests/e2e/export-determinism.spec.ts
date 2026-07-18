import { test, expect, MODULE_ID } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

// exportActorSource must emit `items` in a canonical order, because consumers commit the export as
// source-of-truth JSON. The instability it guards is real and narrow: the troop build embeds its
// glossary kit through one `createEmbeddedDocuments` fed by concurrent `fromUuid` fetches, so
// Troop Defenses / Troop Movement land in either order run to run. Verified 2026-07-18 by bypassing
// the sort — the pair swapped between two otherwise identical builds.
const DIRE_WOLF = 'Compendium.pf2e.pathfinder-monster-core.Actor.AFWmiIBJ7ypgydQD';

/** Everything but the random ids Foundry mints per build — what a consumer's JSON must hold steady. */
const identity = (items: any[]) =>
  items.map((i) => ({
    name: i.name,
    type: i.type,
    sort: i.sort,
    actionType: i.system?.actionType?.value ?? null
  }));

test.describe('exportActorSource determinism', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('two independent troop builds export the same item sequence', async ({ gmPage }) => {
    const build = () =>
      gmPage.evaluate(
        async ({ uuid, mod }) => {
          const api = (window as any).game.modules.get(mod).api;
          const id = await api.importCreatureFromCompendium(uuid);
          await api.convertActorToTroop(id, {});
          return { id, items: (await api.exportActorSource(id)).items as any[] };
        },
        { uuid: DIRE_WOLF, mod: MODULE_ID }
      );

    const a = await build();
    trash.push(a.id);
    const b = await build();
    trash.push(b.id);

    expect(identity(a.items)).toEqual(identity(b.items));

    // Pin the bucket order too, so a regression that shuffles buckets can't pass by shuffling both
    // builds the same way: active actions (by cost, then name) → passives → the standard troop kit.
    expect(a.items.map((i: any) => i.name)).toEqual([
      'Buck', // reaction sorts ahead of the 1-3 action costs
      'Grab',
      'Jaws Flurry',
      'Knockdown',
      'Worry',
      'Pack Attack',
      'Troop Defenses',
      'Troop Movement'
    ]);
  });

  test('exporting one actor twice is byte-identical apart from the reminted troop id', async ({ gmPage }) => {
    const result = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;
        const id = await api.importCreatureFromCompendium(uuid);
        await api.convertActorToTroop(id, {});

        // A converted troop gets a fresh top-level `_id` on every export (it would otherwise collide
        // with the still-present source doc on keepId import), so that one field is expected to differ.
        const strip = (src: any) => JSON.stringify({ ...src, _id: undefined });
        return { id, first: strip(await api.exportActorSource(id)), second: strip(await api.exportActorSource(id)) };
      },
      { uuid: DIRE_WOLF, mod: MODULE_ID }
    );
    trash.push(result.id);

    expect(result.first).toBe(result.second);
  });
});
