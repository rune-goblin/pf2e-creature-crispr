import { test, expect, MODULE_ID } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

const DIRE_WOLF = 'Compendium.pf2e.pathfinder-monster-core.Actor.AFWmiIBJ7ypgydQD';

// The contract consumers actually depend on: a creature saved through CRISPR and the same creature
// exported → recreated elsewhere (ReignMaker packaging it into a compendium, say) must BE the same
// creature. Not byte-equality — `exportActorSource` deliberately remints the troop's top-level `_id`
// and canonicalizes item order — but equality of everything that defines the creature.
test.describe('export round-trip fidelity', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('a troop saved through CRISPR and one recreated from its export are the same creature', async ({ gmPage }) => {
    const { savedSnap, recreatedSnap, ids } = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;

        const snapshot = (actor: any) => ({
          name: actor.name,
          level: actor.system?.details?.level?.value,
          size: actor.system?.traits?.size?.value,
          traits: [...(actor.system?.traits?.value ?? [])].sort(),
          weaknesses: (actor.system?.attributes?.weaknesses ?? []).map((w: any) => `${w.type}:${w.value}`).sort(),
          immunities: (actor.system?.attributes?.immunities ?? []).map((i: any) => i.type).sort(),
          resistances: (actor.system?.attributes?.resistances ?? []).map((r: any) => `${r.type}:${r.value}`).sort(),
          ac: actor.system?.attributes?.ac?.value,
          hp: actor.system?.attributes?.hp?.max,
          // Sorted, so this compares composition rather than re-testing the ordering that
          // export-determinism already covers.
          items: (actor.items.contents as any[])
            .map((i) => `${i.type}|${i.name}|${i.system?.actionType?.value ?? ''}`)
            .sort(),
          hasCrisprFlag: !!actor.getFlag(mod, 'creatureData')
        });

        const id = await api.importCreatureFromCompendium(uuid);
        await api.convertActorToTroop(id, {});
        const saved = (window as any).game.actors.get(id);
        const savedSnap = snapshot(saved);

        const recreated = await (window as any).Actor.create(await api.exportActorSource(id));
        return { savedSnap, recreatedSnap: snapshot(recreated), ids: [id, recreated.id as string] };
      },
      { uuid: DIRE_WOLF, mod: MODULE_ID }
    );
    trash.push(...ids);

    expect(recreatedSnap).toEqual(savedSnap);

    // Guard the snapshot itself: if troop-ness ever stopped landing, both sides would lose it
    // together and the equality above would still pass.
    expect(savedSnap.traits).toContain('troop');
    expect(savedSnap.weaknesses).toEqual(['area-damage:8', 'splash-damage:8']);
  });

  // Cornerstone invariant, end-to-end through the headless API (D8): getEditableCreature →
  // zero-edit saveEditableCreature must change nothing observable — the exported source before and
  // after is identical modulo the flag's `updatedAt` and every doc/item `_stats` (Foundry's own
  // modification bookkeeping, exempt by construction).
  test('a headless get → zero-edit save leaves exportActorSource unchanged (cornerstone)', async ({ gmPage }) => {
    const { before, after, id } = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;

        // Drop Foundry's own modification bookkeeping so a save's timestamp bump isn't a false diff.
        const strip = (v: any): any => {
          if (Array.isArray(v)) return v.map(strip);
          if (v && typeof v === 'object') {
            const out: Record<string, any> = {};
            for (const [k, val] of Object.entries(v)) {
              if (k === '_stats') continue;
              out[k] = strip(val);
            }
            return out;
          }
          return v;
        };
        const normalize = (src: any) => {
          const s = strip(src);
          if (s?.flags?.[mod]?.creatureData) delete s.flags[mod].creatureData.updatedAt;
          return s;
        };

        const id = await api.importCreatureFromCompendium(uuid);
        const before = normalize(await api.exportActorSource(id));

        const creature = api.getEditableCreature(id); // detached; NO edits
        await api.saveEditableCreature(creature);

        const after = normalize(await api.exportActorSource(id));
        return { before, after, id };
      },
      { uuid: DIRE_WOLF, mod: MODULE_ID }
    );
    trash.push(id);

    expect(after).toEqual(before);
  });
});
