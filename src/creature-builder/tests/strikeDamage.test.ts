import { describe, it, expect } from 'vitest';
import {
  readDamageRolls,
  resolveStrikeDamage,
  composeDamageRolls,
  damageRollsEqual,
  pickMainRollKey,
  strikeDamageScalar,
  strikeDamageAverageAt,
  scalePart,
  persistentDamageScalar,
  persistentDamageAverageAt,
  type DamageRollSource
} from '@/creature-builder/logic/strikeDamage';
import { getStatRangesForLevel } from '@/creature-builder/logic/creatureStatTables';
import { parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import type { CreatureStrike } from '@/creature-builder/logic/models';

type Rolls = Record<string, DamageRollSource>;

// Marrmora (Monster Core 2, level 15), verbatim from the PF2e system source.
const MARRMORA_CLAW: Rolls = {
  '0': { damage: '3d6+14', damageType: 'slashing' },
  '1': { damage: '3d6', damageType: 'fire' },
  '2': { category: 'persistent', damage: '1d6', damageType: 'fire' }
};
const MARRMORA_FLAME_JET: Rolls = {
  '0': { damage: '6d6', damageType: 'fire' },
  '1': { category: 'persistent', damage: '2d6', damageType: 'fire' }
};
// Wild Hunt Monarch's Glaive lists its main roll last.
const MONARCH_GLAIVE: Rolls = {
  a: { damage: '1d6', damageType: 'sonic' },
  b: { damage: '1d6', damageType: 'bleed' },
  c: { damage: '4d8+20', damageType: 'slashing' }
};

function strikeFrom(rolls: Rolls, level: number): CreatureStrike {
  const read = readDamageRolls(rolls, level);
  return {
    name: 'Strike',
    attackBenchmark: 0.5,
    damageBenchmark: strikeDamageScalar(read.directAverage, level),
    attackBonus: 0,
    damage: read.damage,
    damageType: read.damageType,
    damageBaseLevel: level,
    mainRollKey: read.mainRollKey,
    extraDamage: read.extraDamage
  };
}

describe('strike damage scalar', () => {
  it('matches the table benchmarks inside the band', () => {
    const r = getStatRangesForLevel(15).strikeDamage;
    expect(strikeDamageScalar(r.low.average, 15)).toBe(0);
    expect(strikeDamageScalar(r.moderate.average, 15)).toBeCloseTo(1 / 3);
    expect(strikeDamageScalar(r.extreme.average, 15)).toBe(1);
  });

  it.each([3, 21, 35, 45, 60])('round-trips %d average at level 15, in band or out', (avg) => {
    expect(strikeDamageAverageAt(strikeDamageScalar(avg, 15), 15)).toBeCloseTo(avg);
  });

  it('encodes below-Low as a negative scalar and above-Extreme past 1', () => {
    expect(strikeDamageScalar(21, 15)).toBeLessThan(0);
    expect(strikeDamageScalar(60, 15)).toBeGreaterThan(1);
  });

  it('keeps a far-below-Low strike positive at level -1', () => {
    expect(strikeDamageAverageAt(strikeDamageScalar(2.5, 20), -1)).toBeGreaterThan(0);
  });
});

describe('reading damageRolls', () => {
  it('keeps every Marrmora Claw roll, with the slashing roll as main', () => {
    const read = readDamageRolls(MARRMORA_CLAW, 15);
    expect(read.damage).toBe('3d6+14');
    expect(read.damageType).toBe('slashing');
    expect(read.mainRollKey).toBe('0');
    expect(read.extraDamage).toEqual([
      { formula: '3d6', damageType: 'fire', baseLevel: 15, rollKey: '1' },
      { formula: '1d6', damageType: 'fire', category: 'persistent', baseLevel: 15, rollKey: '2' }
    ]);
    expect(read.directAverage).toBe(35);
  });

  it('picks the largest direct roll as main, wherever it sits', () => {
    expect(pickMainRollKey(MONARCH_GLAIVE)).toBe('c');
  });

  it('reads a roll-less strike as no main roll', () => {
    const read = readDamageRolls({ p: { category: 'persistent', damage: '4d12+13', damageType: 'piercing' } }, 10);
    expect(read.damage).toBe('');
    expect(read.mainRollKey).toBeUndefined();
    expect(read.directAverage).toBe(0);
  });
});

describe('resolving at a level', () => {
  it('reproduces Marrmora verbatim at its own level', () => {
    const claw = resolveStrikeDamage(strikeFrom(MARRMORA_CLAW, 15), 15);
    expect(claw.main).toBe('3d6+14');
    expect(claw.parts.map((p) => p.resolved)).toEqual(['3d6', '1d6']);

    const jet = resolveStrikeDamage(strikeFrom(MARRMORA_FLAME_JET, 15), 15);
    expect(jet.main).toBe('6d6');
    expect(jet.parts.map((p) => p.resolved)).toEqual(['2d6']);
    expect(jet.persistentAverage).toBe(7);
  });

  it('scales every roll, persistent included, on a level change', () => {
    const claw = strikeFrom(MARRMORA_CLAW, 15);
    const at24 = resolveStrikeDamage(claw, 24);
    expect(parseDiceFormulaAverage(at24.main)).toBeGreaterThan(24.5);
    expect(at24.parts[0].average).toBeGreaterThan(10.5);
    expect(at24.parts[1].average).toBeGreaterThan(3.5);

    const at8 = resolveStrikeDamage(claw, 8);
    expect(at8.parts[0].average).toBeLessThan(10.5);
  });

  it('holds the total at the benchmark across levels', () => {
    const claw = strikeFrom(MARRMORA_CLAW, 15);
    for (const level of [5, 10, 20]) {
      const target = strikeDamageAverageAt(claw.damageBenchmark, level);
      expect(Math.abs(resolveStrikeDamage(claw, level).directAverage - target)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a clean-dice main clean', () => {
    expect(resolveStrikeDamage(strikeFrom(MARRMORA_FLAME_JET, 15), 20).main).toMatch(/^\d+d6$/);
  });

  it('keeps a below-Low strike below Low at other levels', () => {
    const jet = strikeFrom(MARRMORA_FLAME_JET, 15);
    const low10 = getStatRangesForLevel(10).strikeDamage.low.average;
    expect(resolveStrikeDamage(jet, 10).directAverage).toBeLessThan(low10);
  });

  it('never gives a roll-less strike a main roll', () => {
    const tendril = strikeFrom({ p: { category: 'persistent', damage: '4d12+13', damageType: 'piercing' } }, 10);
    expect(resolveStrikeDamage(tendril, 10).main).toBe('');
    expect(resolveStrikeDamage(tendril, 18).main).toBe('');
  });

  it('shapes a fresh strike from the table', () => {
    const fresh: CreatureStrike = {
      name: 'New', attackBenchmark: 0.5, damageBenchmark: 1 / 3, attackBonus: 0, damage: '', damageType: 'slashing'
    };
    expect(resolveStrikeDamage(fresh, 15).main).toBe(getStatRangesForLevel(15).strikeDamage.moderate.formula);
  });

  it('passes unparseable part formulas through verbatim', () => {
    expect(scalePart({ formula: '1d6+1d4', damageType: 'fire', baseLevel: 5 }, 12)).toBe('1d6+1d4');
  });
});

describe('tier-driven shares', () => {
  // Skeletal Tiger Lord's Greatsword shape: a strike main with one direct rider.
  const TIGER: Rolls = {
    a: { damage: '1d12+10', damageType: 'slashing' },
    b: { damage: '2d6', damageType: 'void' }
  };

  it('a tier click resizes every direct roll in the authored proportions', () => {
    const tiger = strikeFrom(TIGER, 15);
    const extreme = resolveStrikeDamage({ ...tiger, damageBenchmark: 1 }, 15);
    const target = getStatRangesForLevel(15).strikeDamage.extreme.average;
    expect(Math.abs(extreme.directAverage - target)).toBeLessThanOrEqual(1);
    expect(extreme.parts[0].average).toBeGreaterThan(7);
    expect(extreme.mainAverage / extreme.directAverage).toBeCloseTo(16.5 / 23.5, 1);
  });

  it("keeps the main roll's die and a strike-like bonus", () => {
    const tiger = strikeFrom(TIGER, 15);
    for (const level of [4, 8, 20, 24]) {
      expect(resolveStrikeDamage(tiger, level).main).toMatch(/^\d+d12(\+\d+)?$/);
    }
    expect(resolveStrikeDamage(strikeFrom(MARRMORA_CLAW, 15), 8).main).toBe('2d6+7');
  });

  it('leaves persistent riders on their own table when the tier moves', () => {
    const claw = strikeFrom(MARRMORA_CLAW, 15);
    const extreme = resolveStrikeDamage({ ...claw, damageBenchmark: 1 }, 15);
    expect(extreme.parts[1].resolved).toBe('1d6');
  });

  it("holds a persistent rider's position on the persistent table across levels", () => {
    const claw = strikeFrom(MARRMORA_CLAW, 15);
    const scalar = persistentDamageScalar(3.5, 15);
    for (const level of [5, 20]) {
      const rider = resolveStrikeDamage(claw, level).parts[1];
      expect(Math.abs(rider.average - persistentDamageAverageAt(scalar, level))).toBeLessThanOrEqual(1.75);
    }
  });

  it('drops a rider to a smaller die rather than overshoot at low levels', () => {
    const glaive = resolveStrikeDamage(strikeFrom(MONARCH_GLAIVE, 15), 1);
    expect(glaive.parts.map((p) => p.resolved)).toEqual(['1d4', '1d4']);
  });
});

describe('composing damageRolls', () => {
  it('writes nothing new for an unedited Marrmora Claw', () => {
    const composed = composeDamageRolls(strikeFrom(MARRMORA_CLAW, 15), 15, MARRMORA_CLAW);
    expect(damageRollsEqual(composed, MARRMORA_CLAW)).toBe(true);
  });

  it('keeps the main roll slashing and every key in order after a level change', () => {
    const composed = composeDamageRolls(strikeFrom(MARRMORA_CLAW, 15), 8, MARRMORA_CLAW);
    expect(Object.keys(composed.rolls)).toEqual(['0', '1', '2']);
    expect(composed.rolls['0'].damageType).toBe('slashing');
    expect(composed.rolls['1'].damageType).toBe('fire');
    expect(composed.rolls['2'].category).toBe('persistent');
    expect(composed.removed).toEqual([]);
  });

  it('keeps foreign roll fields', () => {
    const rolls: Rolls = { '0': { damage: '2d8+9', damageType: 'slashing', kinds: ['damage'] } };
    const strike = strikeFrom(rolls, 5);
    strike.damageBenchmark = 1;
    expect(composeDamageRolls(strike, 5, rolls).rolls['0'].kinds).toEqual(['damage']);
  });

  it('reports a removed part and keys a new one clear of existing keys', () => {
    const strike = strikeFrom(MARRMORA_CLAW, 15);
    strike.extraDamage = [
      strike.extraDamage![1],
      { formula: '1d4', damageType: 'cold', category: 'splash', baseLevel: 15 }
    ];
    const composed = composeDamageRolls(strike, 15, MARRMORA_CLAW);
    expect(composed.removed).toEqual(['1']);
    expect(composed.rolls['3']).toEqual({ damage: '1d4', damageType: 'cold', category: 'splash' });
  });

  it('writes the main first on a brand-new strike', () => {
    const fresh: CreatureStrike = {
      name: 'New', attackBenchmark: 0.5, damageBenchmark: 1 / 3, attackBonus: 0, damage: '', damageType: 'piercing',
      extraDamage: [{ formula: '1d6', damageType: 'acid', category: 'persistent', baseLevel: 3 }]
    };
    const composed = composeDamageRolls(fresh, 3);
    expect(Object.keys(composed.rolls)).toEqual(['0', '1']);
    expect(composed.rolls['0'].damageType).toBe('piercing');
    expect(composed.rolls['1'].category).toBe('persistent');
  });
});
