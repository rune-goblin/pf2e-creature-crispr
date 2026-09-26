import { describe, it, expect } from 'vitest';
import { meleeItemToStrike, type MeleeItemView } from '@/creature-builder/services/actorQueries';
import { getStatRangesForLevel, statToScalar4 } from '@/creature-builder/logic/creatureStatTables';
import { damageToBenchmark, parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import { strikeDamageScalar } from '@/creature-builder/logic/strikeDamage';
import type { ItemBenchmarkData } from '@/creature-builder/services/types';

// Stand-in for a PF2e melee item (embedded or built from a dropped payload by Item.fromDropData),
// so the converter can be exercised without Foundry globals.
function meleeItem(
  system: MeleeItemView['system'],
  opts: { id?: string | null; name?: string | null; benchmarks?: ItemBenchmarkData } = {}
): MeleeItemView {
  return {
    id: opts.id !== undefined ? opts.id : 'm1',
    name: opts.name !== undefined ? opts.name : 'Jaws',
    type: 'melee',
    system,
    getFlag: () => opts.benchmarks
  };
}

describe('meleeItemToStrike', () => {
  it('honours a v2 benchmark flag that still reproduces the item', () => {
    const level = 5;
    const main = getStatRangesForLevel(level).strikeDamage.high.formula;
    const strike = meleeItemToStrike(
      meleeItem(
        { bonus: { value: 10 }, damageRolls: { r0: { damage: main, damageType: 'piercing' } } },
        { benchmarks: { attackBenchmark: 0.75, damageBenchmark: 2 / 3, damageVersion: 2 } }
      ),
      level
    );
    expect(strike.attackBenchmark).toBe(0.75);
    expect(strike.damageBenchmark).toBe(2 / 3);
    expect(strike.id).toBe('m1');
    expect(strike.attackBonus).toBe(10);
  });

  it('re-derives the damage benchmark when the item was edited on the PF2e sheet', () => {
    const strike = meleeItemToStrike(
      meleeItem(
        { bonus: { value: 10 }, damageRolls: { r0: { damage: '2d8+4', damageType: 'piercing' } } },
        { benchmarks: { attackBenchmark: 0.75, damageBenchmark: 1, damageVersion: 2, customDamageFormula: '3d6+2' } }
      ),
      5
    );
    expect(strike.damageBenchmark).toBe(strikeDamageScalar(13, 5));
    expect(strike.customDamageFormula).toBeUndefined();
    expect(strike.damage).toBe('2d8+4');
  });

  it('ignores a legacy single-roll damage benchmark', () => {
    const strike = meleeItemToStrike(
      meleeItem(
        { bonus: { value: 12 }, damageRolls: { r0: { damage: '2d6+5', damageType: 'piercing' }, r1: { damage: '2d6', damageType: 'fire' } } },
        { benchmarks: { attackBenchmark: 0.5, damageBenchmark: 0.5 } }
      ),
      4
    );
    expect(strike.damageBenchmark).toBe(strikeDamageScalar(19, 4));
  });

  it('reverse-derives benchmarks from the item values when unflagged', () => {
    const level = 5;
    const strike = meleeItemToStrike(
      meleeItem({ bonus: { value: 15 }, damageRolls: { r0: { damage: '2d8+7', damageType: 'slashing' } } }),
      level
    );
    const ranges = getStatRangesForLevel(level);
    expect(strike.attackBenchmark).toBe(statToScalar4(15, ranges.strikeAttack));
    expect(strike.damageBenchmark).toBe(damageToBenchmark(parseDiceFormulaAverage('2d8+7'), level));
    expect(strike.damage).toBe('2d8+7');
    expect(strike.damageType).toBe('slashing');
  });

  it('loads an unflagged persistent rider as an extra part', () => {
    const strike = meleeItemToStrike(
      meleeItem({
        bonus: { value: 12 },
        damageRolls: {
          r0: { damage: '2d6+5', damageType: 'piercing' },
          r1: { damage: '1d6', damageType: 'poison', category: 'persistent' }
        }
      }),
      4
    );
    expect(strike.damage).toBe('2d6+5');
    expect(strike.damageType).toBe('piercing');
    expect(strike.extraDamage).toEqual([
      { formula: '1d6', damageType: 'poison', category: 'persistent', baseLevel: 4, rollKey: 'r1' }
    ]);
  });

  it("reads the persistent rider from the item, not a stale legacy flag", () => {
    const strike = meleeItemToStrike(
      meleeItem(
        {
          bonus: { value: 12 },
          damageRolls: {
            r0: { damage: '2d6+5', damageType: 'piercing' },
            r1: { damage: '2d4', damageType: 'fire', category: 'persistent' }
          }
        },
        { benchmarks: { attackBenchmark: 0.5, damageBenchmark: 0.5, persistentBenchmark: 0.5, customPersistentFormula: '3d4', persistentDamageType: 'acid' } }
      ),
      4
    );
    expect(strike.extraDamage?.[0]).toMatchObject({ formula: '2d4', damageType: 'fire', category: 'persistent' });
  });

  it('copies traits; defaults name and damage when absent', () => {
    const strike = meleeItemToStrike(
      meleeItem({ bonus: { value: 8 }, traits: { value: ['agile', 'magical'] } }),
      2
    );
    expect(strike.traits).toEqual(['agile', 'magical']);

    const bare = meleeItemToStrike(meleeItem({}, { id: null, name: null }), 2);
    expect(bare.isRanged).toBe(false);
    expect(bare.name).toBe('Strike');
    expect(bare.id).toBeUndefined();
    expect(bare.damage).toBe('');
    expect(bare.extraDamage).toEqual([]);
    expect(bare.damageType).toBe('slashing');
    expect(bare.attackBonus).toBe(0);
  });
});

// PF2e NPC strikes are all item-type `melee` and never carry a literal `ranged` trait; these
// shapes are lifted from real system data (kingmaker-bestiary).
describe('ranged strike detection', () => {
  it('classifies a volley-trait bow with no range data as ranged (Living Bow traits)', () => {
    const strike = meleeItemToStrike(
      meleeItem({ bonus: { value: 32 }, traits: { value: ['deadly-d10', 'propulsive', 'volley-30'] } }),
      17
    );
    expect(strike.isRanged).toBe(true);
  });

  it('classifies by range increment when no trait marks it (Shortbow shape)', () => {
    const strike = meleeItemToStrike(
      meleeItem({
        bonus: { value: 8 },
        traits: { value: ['deadly-d10', 'reload-0'] },
        range: { increment: 60, max: null }
      }),
      2
    );
    expect(strike.isRanged).toBe(true);
    expect(strike.range).toBe(60);
  });

  it('classifies by range max when increment is null (Living Bow shape)', () => {
    const strike = meleeItemToStrike(
      meleeItem({
        bonus: { value: 32 },
        traits: { value: ['deadly-d10', 'magical', 'propulsive', 'volley-30'] },
        range: { increment: null, max: 100 }
      }),
      17
    );
    expect(strike.isRanged).toBe(true);
    expect(strike.range).toBe(100);
  });

  it('classifies thrown weapons as ranged, suffixed or bare', () => {
    expect(meleeItemToStrike(meleeItem({ traits: { value: ['thrown-10'] } }), 2).isRanged).toBe(true);
    expect(meleeItemToStrike(meleeItem({ traits: { value: ['thrown'] } }), 2).isRanged).toBe(true);
  });

  it('still honours the legacy literal ranged trait', () => {
    expect(meleeItemToStrike(meleeItem({ traits: { value: ['ranged', 'magical'] } }), 2).isRanged).toBe(true);
  });

  it('keeps a plain melee strike melee (Horns shape)', () => {
    const strike = meleeItemToStrike(
      meleeItem({ bonus: { value: 30 }, traits: { value: ['agile', 'magical'] }, range: null }),
      17
    );
    expect(strike.isRanged).toBe(false);
    expect(strike.range).toBeUndefined();
  });
});
