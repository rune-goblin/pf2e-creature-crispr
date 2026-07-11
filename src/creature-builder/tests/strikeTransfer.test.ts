import { describe, it, expect } from 'vitest';
import { meleeItemToStrike, type MeleeItemView } from '@/creature-builder/services/actorQueries';
import { getStatRangesForLevel, statToScalar4 } from '@/creature-builder/logic/creatureStatTables';
import { damageToBenchmark, parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import { BENCHMARK_VALUES_3 } from '@/creature-builder/logic/models';
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
  it('honours stored benchmark flags over derivation', () => {
    const strike = meleeItemToStrike(
      meleeItem(
        { bonus: { value: 10 }, damageRolls: { r0: { damage: '2d8+4', damageType: 'piercing' } } },
        { benchmarks: { attackBenchmark: 0.75, damageBenchmark: 0.5, customDamageFormula: '3d6+2' } }
      ),
      5
    );
    expect(strike.attackBenchmark).toBe(0.75);
    expect(strike.damageBenchmark).toBe(0.5);
    expect(strike.customDamageFormula).toBe('3d6+2');
    expect(strike.id).toBe('m1');
    expect(strike.attackBonus).toBe(10);
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

  it('takes damage from the non-persistent roll and drops an unflagged persistent rider by default', () => {
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
    expect(strike.customPersistentFormula).toBeUndefined();
    expect(strike.persistentBenchmark).toBeUndefined();
  });

  it('recovers an unflagged persistent rider when asked (drop path)', () => {
    const strike = meleeItemToStrike(
      meleeItem({
        bonus: { value: 12 },
        damageRolls: {
          r0: { damage: '2d6+5', damageType: 'piercing' },
          r1: { damage: '1d6', damageType: 'poison', category: 'persistent' }
        }
      }),
      4,
      { recoverUnflaggedPersistent: true }
    );
    expect(strike.customPersistentFormula).toBe('1d6');
    expect(strike.persistentDamageType).toBe('poison');
    expect(strike.persistentBenchmark).toBe(BENCHMARK_VALUES_3.moderate);
  });

  it('recovers a legacy scalar-only persistent flag from the saved roll', () => {
    const strike = meleeItemToStrike(
      meleeItem(
        {
          bonus: { value: 12 },
          damageRolls: {
            r0: { damage: '2d6+5', damageType: 'piercing' },
            r1: { damage: '2d4', damageType: 'fire', category: 'persistent' }
          }
        },
        { benchmarks: { attackBenchmark: 0.5, damageBenchmark: 0.5, persistentBenchmark: 0.5 } }
      ),
      4
    );
    expect(strike.customPersistentFormula).toBe('2d4');
    expect(strike.persistentDamageType).toBe('fire');
    expect(strike.persistentBenchmark).toBe(0.5);
  });

  it('prefers the flagged persistent formula and type when stored', () => {
    const strike = meleeItemToStrike(
      meleeItem(
        { bonus: { value: 12 }, damageRolls: { r0: { damage: '2d6+5', damageType: 'piercing' } } },
        { benchmarks: { attackBenchmark: 0.5, damageBenchmark: 0.5, persistentBenchmark: 0.5, customPersistentFormula: '3d4', persistentDamageType: 'acid' } }
      ),
      4
    );
    expect(strike.customPersistentFormula).toBe('3d4');
    expect(strike.persistentDamageType).toBe('acid');
  });

  it('maps the ranged trait and copies traits; defaults name and damage when absent', () => {
    const ranged = meleeItemToStrike(
      meleeItem({ bonus: { value: 8 }, traits: { value: ['ranged', 'magical'] } }),
      2
    );
    expect(ranged.isRanged).toBe(true);
    expect(ranged.traits).toEqual(['ranged', 'magical']);

    const bare = meleeItemToStrike(meleeItem({}, { id: null, name: null }), 2);
    expect(bare.isRanged).toBe(false);
    expect(bare.name).toBe('Strike');
    expect(bare.id).toBeUndefined();
    expect(bare.damage).toBe('1d4');
    expect(bare.damageType).toBe('slashing');
    expect(bare.attackBonus).toBe(0);
  });
});
