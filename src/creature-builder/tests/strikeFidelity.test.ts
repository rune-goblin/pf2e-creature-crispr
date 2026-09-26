import { describe, it, expect, vi, afterEach } from 'vitest';
import { updateMeleeItems } from '@/creature-builder/services/strikes';
import { meleeItemToStrike, type MeleeItemView } from '@/creature-builder/services/actorQueries';
import { getStatRangesForLevel, statToScalar4 } from '@/creature-builder/logic/creatureStatTables';
import { damageToBenchmark, parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import { CREATURE_FLAG, ITEM_BENCHMARK_KEY } from '@/creature-builder/services/constants';
import type { ItemBenchmarkData } from '@/creature-builder/services/types';

const ACTOR_ID = 'actor1';
const LEVEL = 5;

type Rolls = Record<string, { damage?: string; damageType?: string; category?: string | null }>;

interface MeleeMockOptions {
  id?: string;
  name?: string;
  bonus?: number;
  rolls?: Rolls;
  traits?: string[];
  benchmarks?: ItemBenchmarkData;
}

// A fresh-import flag: exactly what addBenchmarkFlagsToMeleeItems stamps, so the loaded benchmark
// equals the recompute at the same level.
function importFlag(bonus: number, primaryDamage: string, level: number): ItemBenchmarkData {
  const ranges = getStatRangesForLevel(level);
  return {
    attackBenchmark: statToScalar4(bonus, ranges.strikeAttack),
    damageBenchmark: damageToBenchmark(parseDiceFormulaAverage(primaryDamage), level)
  };
}

function meleeItem(opts: MeleeMockOptions = {}): MeleeItemView & { id: string } {
  const bonus = opts.bonus ?? 15;
  const rolls = opts.rolls ?? { r0: { damage: '2d8+9', damageType: 'slashing' } };
  return {
    id: opts.id ?? 'melee1',
    type: 'melee',
    name: opts.name ?? 'Claw',
    system: {
      bonus: { value: bonus },
      damageRolls: rolls,
      traits: { value: opts.traits ?? [] }
    },
    getFlag: (scope: string, key: string) =>
      scope === CREATURE_FLAG && key === ITEM_BENCHMARK_KEY ? opts.benchmarks : undefined
  };
}

function makeActor(items: Array<MeleeItemView & { id: string }>) {
  return {
    id: ACTOR_ID,
    name: 'Test',
    items: {
      contents: items,
      get: (id: string) => items.find((i) => i.id === id)
    },
    updateEmbeddedDocuments: vi.fn((_type?: string, _updates?: unknown[]) => Promise.resolve()),
    createEmbeddedDocuments: vi.fn((_type?: string, _items?: unknown[]) => Promise.resolve()),
    deleteEmbeddedDocuments: vi.fn((_type?: string, _ids?: unknown[]) => Promise.resolve())
  };
}

function install(actor: ReturnType<typeof makeActor>): void {
  (globalThis as unknown as { game: unknown }).game = {
    actors: { get: (id: string) => (id === ACTOR_ID ? actor : undefined) }
  };
  // ForcedReplacement proxies its value, so tests read the replaced object directly.
  (globalThis as unknown as { foundry: unknown }).foundry = {
    data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } }
  };
}

afterEach(() => {
  delete (globalThis as unknown as { game?: unknown }).game;
  delete (globalThis as unknown as { foundry?: unknown }).foundry;
});

const firstUpdate = (actor: ReturnType<typeof makeActor>) =>
  actor.updateEmbeddedDocuments.mock.calls[0][1]![0] as Record<string, any>;

describe('updateMeleeItems — D5 preserve unedited attack/damage', () => {
  it('a strike loaded as an off-table 2d8+9 survives a no-edit save untouched', () => {
    // The secondary + persistent riders ride through untouched, and the off-table 2d8+9 main (avg 18)
    // at level 5 is not reshaped to a table formula on a no-edit save.
    const rolls: Rolls = {
      rSecondary: { damage: '1d6', damageType: 'fire' },
      rPrimary: { damage: '2d8+9', damageType: 'slashing' },
      rPersist: { damage: '2d6', damageType: 'bleed', category: 'persistent' }
    };
    const item = meleeItem({ bonus: 15, rolls, benchmarks: undefined });
    const strike = meleeItemToStrike(item, LEVEL);
    expect(strike.damage).toBe('2d8+9');
    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL, { levelChanged: false }).then(() => {
      const update = firstUpdate(actor);
      // Both attack and damage omitted — the item keeps its actual 2d8+9 + secondary/persistent rolls.
      expect(update['system.damageRolls']).toBeUndefined();
      expect(update['system.bonus.value']).toBeUndefined();
      // Equal writes stay (Foundry diff makes them inert).
      expect(update.name).toBe('Claw');
      expect(update['system.traits.value']).toEqual([]);
      // The item's stored rolls are never touched.
      expect(item.system.damageRolls).toBe(rolls);
    });
  });

  it('moving the damage benchmark rewrites the primary roll only', () => {
    const rolls: Rolls = {
      r0: { damage: '2d8+9', damageType: 'slashing' },
      r1: { damage: '2d6', damageType: 'bleed', category: 'persistent' }
    };
    const item = meleeItem({ bonus: 15, rolls, benchmarks: importFlag(15, '2d8+9', LEVEL) });
    const strike = meleeItemToStrike(item, LEVEL);
    // The store moves the slider: benchmark changes, the loaded formula does not.
    strike.damageBenchmark = 1;
    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL, { levelChanged: false }).then(() => {
      const update = firstUpdate(actor);
      expect(update['system.bonus.value']).toBeUndefined(); // attack untouched
      const written = update['system.damageRolls'] as Rolls;
      expect(written.r0.damage).not.toBe('2d8+9'); // primary rescaled to the new benchmark
      expect(written.r1).toEqual(rolls.r1); // persistent roll unchanged
    });
  });

  it('a persistent-only edit updates the rider but leaves the off-table primary formula verbatim', () => {
    const rolls: Rolls = {
      r0: { damage: '2d8+9', damageType: 'slashing' },
      rP: { damage: '2d6', damageType: 'bleed', category: 'persistent' }
    };
    const item = meleeItem({ bonus: 15, rolls, benchmarks: importFlag(15, '2d8+9', LEVEL) });
    const strike = meleeItemToStrike(item, LEVEL);
    strike.extraDamage![0].formula = '3d6'; // the only edit

    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL, { levelChanged: false }).then(() => {
      const update = firstUpdate(actor);
      expect(update['system.bonus.value']).toBeUndefined(); // attack untouched
      const written = update['system.damageRolls'] as Rolls;
      expect(written).toBeDefined();
      expect(written.r0.damage).toBe('2d8+9'); // primary formula preserved byte-for-byte
      expect(written.rP.damage).toBe('3d6'); // persistent rider updated
    });
  });

  it('a damageType-only edit updates the primary type but preserves its off-table formula', () => {
    const item = meleeItem({
      bonus: 15,
      rolls: { r0: { damage: '2d8+9', damageType: 'slashing' } },
      benchmarks: undefined
    });
    const strike = meleeItemToStrike(item, LEVEL);
    strike.damageType = 'fire'; // the only edit

    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL, { levelChanged: false }).then(() => {
      const update = firstUpdate(actor);
      expect(update['system.bonus.value']).toBeUndefined(); // attack untouched
      const written = update['system.damageRolls'] as Rolls;
      expect(written.r0.damage).toBe('2d8+9'); // formula preserved, not reshaped to 2d12+5
      expect(written.r0.damageType).toBe('fire');
    });
  });

  it('a level change recomputes attack and damage as today', () => {
    const item = meleeItem({ bonus: 15, benchmarks: importFlag(15, '2d8+9', LEVEL) });
    const strike = meleeItemToStrike(item, LEVEL);
    const actor = makeActor([item]);
    install(actor);

    // Save at a higher level — the same benchmark must re-derive at the new level.
    return updateMeleeItems(ACTOR_ID, [strike], LEVEL + 3, { levelChanged: true }).then(() => {
      const update = firstUpdate(actor);
      expect(update['system.bonus.value']).toBeDefined();
      expect(update['system.damageRolls']).toBeDefined();
    });
  });

  it('recomputes the attack when the levelChanged opt is absent, but writes only rolls that differ', () => {
    const item = meleeItem({ bonus: 15, benchmarks: importFlag(15, '2d8+9', LEVEL) });
    const strike = meleeItemToStrike(item, LEVEL);
    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL).then(() => {
      const update = firstUpdate(actor);
      expect(update['system.bonus.value']).toBeDefined();
      expect(update['system.damageRolls']).toBeUndefined();
    });
  });

  it('an out-of-range attack bonus (clamped scalar at load) survives a no-edit save', () => {
    // Level 5 strike-attack extreme is 17; a bonus of 30 back-solves to a clamped 1.0 scalar.
    const item = meleeItem({ bonus: 30, benchmarks: undefined });
    const strike = meleeItemToStrike(item, LEVEL);
    expect(strike.attackBenchmark).toBe(1); // clamped
    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL, { levelChanged: false }).then(() => {
      const update = firstUpdate(actor);
      // bonus.value omitted → the item keeps 30, not the extreme-clamped 17.
      expect(update['system.bonus.value']).toBeUndefined();
    });
  });

  it('an unflagged (foreign) melee item survives a no-edit save', () => {
    const rolls: Rolls = {
      r0: { damage: '3d10+2', damageType: 'piercing' },
      r1: { damage: '1d4', damageType: 'poison', category: 'persistent' }
    };
    const item = meleeItem({ bonus: 12, rolls, traits: ['reach-10'], benchmarks: undefined });
    const strike = meleeItemToStrike(item, LEVEL);
    const actor = makeActor([item]);
    install(actor);

    return updateMeleeItems(ACTOR_ID, [strike], LEVEL, { levelChanged: false }).then(() => {
      const update = firstUpdate(actor);
      expect(update['system.damageRolls']).toBeUndefined();
      expect(update['system.bonus.value']).toBeUndefined();
      expect(update['system.traits.value']).toEqual(['reach-10']);
      expect(item.system.damageRolls).toBe(rolls);
    });
  });
});

describe('multi-part strikes — Marrmora', () => {
  const MARRMORA_LEVEL = 15;
  const clawRolls = (): Rolls => ({
    '0': { damage: '3d6+14', damageType: 'slashing' },
    '1': { damage: '3d6', damageType: 'fire' },
    '2': { damage: '1d6', damageType: 'fire', category: 'persistent' }
  });

  it('loads every Claw roll with the slashing roll as main', () => {
    const strike = meleeItemToStrike(meleeItem({ bonus: 29, rolls: clawRolls() }), MARRMORA_LEVEL);
    expect(strike.damage).toBe('3d6+14');
    expect(strike.damageType).toBe('slashing');
    expect(strike.extraDamage?.map((p) => [p.formula, p.damageType, p.category])).toEqual([
      ['3d6', 'fire', undefined],
      ['1d6', 'fire', 'persistent']
    ]);
  });

  it('writes no damage rolls on a no-edit save', () => {
    const item = meleeItem({ bonus: 29, rolls: clawRolls() });
    const actor = makeActor([item]);
    install(actor);
    const strike = meleeItemToStrike(item, MARRMORA_LEVEL);

    return updateMeleeItems(ACTOR_ID, [strike], MARRMORA_LEVEL, { levelChanged: false }).then(() => {
      expect(firstUpdate(actor)['system.damageRolls']).toBeUndefined();
    });
  });

  it('rescales all three rolls on a level change and keeps the main slashing', () => {
    const item = meleeItem({ bonus: 29, rolls: clawRolls() });
    const actor = makeActor([item]);
    install(actor);
    const strike = meleeItemToStrike(item, MARRMORA_LEVEL);

    return updateMeleeItems(ACTOR_ID, [strike], 8, { levelChanged: true }).then(() => {
      const written = firstUpdate(actor)['system.damageRolls'] as Rolls;
      expect(Object.keys(written)).toEqual(['0', '1', '2']);
      expect(written['0'].damageType).toBe('slashing');
      expect(written['1'].damage).not.toBe('3d6');
      expect(written['2'].category).toBe('persistent');
    });
  });

  it('returns to the published formulas after a round trip through another level', () => {
    const item = meleeItem({ bonus: 29, rolls: clawRolls() });
    const actor = makeActor([item]);
    install(actor);
    const strike = meleeItemToStrike(item, MARRMORA_LEVEL);

    return updateMeleeItems(ACTOR_ID, [strike], 3, { levelChanged: true }).then(() => {
      const update = firstUpdate(actor);
      const atThree = meleeItem({
        bonus: update['system.bonus.value'],
        rolls: update['system.damageRolls'],
        benchmarks: update[`flags.${CREATURE_FLAG}.${ITEM_BENCHMARK_KEY}`]
      });
      const reloaded = meleeItemToStrike(atThree, 3);
      const back = makeActor([atThree]);
      install(back);
      return updateMeleeItems(ACTOR_ID, [reloaded], MARRMORA_LEVEL, { levelChanged: true }).then(() => {
        expect(firstUpdate(back)['system.damageRolls']).toEqual({
          '0': { damage: '3d6+14', damageType: 'slashing', category: null },
          '1': { damage: '3d6', damageType: 'fire', category: null },
          '2': { damage: '1d6', damageType: 'fire', category: 'persistent' }
        });
      });
    });
  });

  it('removes a deleted part from the item', () => {
    const item = meleeItem({ bonus: 29, rolls: clawRolls() });
    const actor = makeActor([item]);
    install(actor);
    const strike = meleeItemToStrike(item, MARRMORA_LEVEL);
    strike.extraDamage = strike.extraDamage!.filter((p) => p.category !== 'persistent');

    return updateMeleeItems(ACTOR_ID, [strike], MARRMORA_LEVEL, { levelChanged: false }).then(() => {
      expect(Object.keys(firstUpdate(actor)['system.damageRolls'])).toEqual(['0', '1']);
    });
  });
});
