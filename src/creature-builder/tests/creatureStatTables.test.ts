import { describe, it, expect } from 'vitest';
import {
  calculateCreatureStats,
  analyzeStatsForBenchmarks,
  calculateStrikeStats,
  PERSISTENT_EXPECTED_ROUNDS,
  interpolateStat,
  statToScalar,
  statToScalar4,
  interpolateSkill,
  skillToScalar,
  interpolateHP,
  hpToScalar,
  getHPRange,
  getHPBenchmarkLabel,
  getResistanceWeaknessRange,
  scaleResistanceWeakness,
  resistanceWeaknessToScalar,
  scalarToResistanceWeakness,
  spellStatToScalar,
  getStrikeDamageForScalar,
  scaleStrikeDamage,
  adjustDamageFormulaToAverage,
  getStrikeDamageBenchmarkLabel,
  averageToDiceFormula,
  parseDiceFormulaAverage,
  calculateTroopThresholds,
  getStatRangesForLevel
} from '@/creature-builder/logic/creatureStatTables';
import { getDefaultBenchmarks, BENCHMARK_VALUES, BENCHMARK_VALUES_4, TROOP_SQUARES } from '@/creature-builder/logic/models';
import type { CreatureBenchmarks } from '@/creature-builder/logic/models';

describe('calculateCreatureStats', () => {
  it('produces positive AC/HP and numeric saves at level 1', () => {
    const s = calculateCreatureStats(1, getDefaultBenchmarks());
    expect(s.ac).toBeGreaterThan(0);
    expect(s.hp).toBeGreaterThan(0);
    expect(typeof s.fortitude).toBe('number');
    expect(typeof s.perception).toBe('number');
  });

  it('scales HP and AC up with level for fixed benchmarks', () => {
    const b = getDefaultBenchmarks();
    const low = calculateCreatureStats(1, b);
    const high = calculateCreatureStats(15, b);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.ac).toBeGreaterThan(low.ac);
  });
});

describe('analyzeStatsForBenchmarks ∘ calculateCreatureStats round-trip', () => {
  it('recovered benchmarks reproduce the same observable stats (import back-solve)', () => {
    const level = 8;
    const original = getDefaultBenchmarks();
    const stats = calculateCreatureStats(level, original);

    const recovered = analyzeStatsForBenchmarks(level, stats);
    const merged = {
      ...original,
      ...recovered,
      abilities: { ...original.abilities, ...(recovered.abilities || {}) },
      saves: { ...original.saves, ...(recovered.saves || {}) }
    };

    const stats2 = calculateCreatureStats(level, merged);
    expect(stats2.ac).toBe(stats.ac);
    expect(stats2.hp).toBe(stats.hp);
    expect(stats2.fortitude).toBe(stats.fortitude);
    expect(stats2.perception).toBe(stats.perception);
  });
});

describe('calculateStrikeStats — persistent rider (the formula is the source of truth)', () => {
  it('never invents persistent damage from a bare benchmark', () => {
    const enabledNoFormula = calculateStrikeStats(9, BENCHMARK_VALUES_4.high, BENCHMARK_VALUES_4.moderate, undefined, 0.5);
    expect(enabledNoFormula.persistentDamage).toBeUndefined();
    expect(enabledNoFormula.persistentAverage).toBeUndefined();
    expect(enabledNoFormula.effectiveDamageAverage).toBe(enabledNoFormula.damageAverage);
  });

  it('writes the user persistent formula verbatim', () => {
    const s = calculateStrikeStats(9, BENCHMARK_VALUES_4.high, BENCHMARK_VALUES_4.moderate, undefined, 0.5, '1d6');
    expect(s.persistentDamage).toBe('1d6');
    expect(s.persistentAverage).toBe(3.5);
  });

  it('accepts a flat persistent value (no dice format required)', () => {
    const s = calculateStrikeStats(9, BENCHMARK_VALUES_4.high, BENCHMARK_VALUES_4.moderate, undefined, 0.5, '6');
    expect(s.persistentDamage).toBe('6');
    expect(s.persistentAverage).toBe(6);
  });

  it('reports effective = direct + persistent × expected rounds (moderate L9 + 1d6 ≈ above Extreme)', () => {
    const s = calculateStrikeStats(9, BENCHMARK_VALUES_4.high, BENCHMARK_VALUES_4.moderate, undefined, 0.5, '1d6');
    expect(s.damageAverage).toBe(20); // L9 moderate strike
    expect(s.effectiveDamageAverage).toBeCloseTo(20 + 3.5 * PERSISTENT_EXPECTED_ROUNDS, 5);
    expect(s.effectiveDamageAverage).toBeCloseTo(30, 0); // L9 extreme strike = 30
  });

  it('does not trim direct or persistent when the strike lands above its tier', () => {
    const s = calculateStrikeStats(9, BENCHMARK_VALUES_4.high, BENCHMARK_VALUES_4.extreme, '4d12+30', 0.5, '3d8');
    expect(s.damage).toBe('4d12+30');
    expect(s.persistentDamage).toBe('3d8');
  });

  it('falls back to benchmark-scaled damage when the custom formula is unparseable', () => {
    // L5 low strike damage (damageBenchmark scalar 0 -> low tier, exact match, no adjustment)
    const s = calculateStrikeStats(5, BENCHMARK_VALUES_4.high, 0, 'not-a-formula');
    expect(s.damage).toBe('2d4+6');
    expect(s.damageAverage).toBe(11);
  });

  it('ignores an unparseable persistent formula even when the rider is enabled', () => {
    const s = calculateStrikeStats(9, BENCHMARK_VALUES_4.high, BENCHMARK_VALUES_4.moderate, undefined, 0.5, 'not-a-formula');
    expect(s.persistentDamage).toBeUndefined();
    expect(s.persistentAverage).toBeUndefined();
  });
});

describe('interpolateStat / statToScalar edge branches (level 5 saves table row)', () => {
  const range = getStatRangesForLevel(5).saves; // { terrible: 7, low: 9, moderate: 12, high: 15, extreme: 17 }

  it('returns each table value at its benchmark scalar', () => {
    expect(interpolateStat(0, range)).toBe(range.terrible);
    expect(interpolateStat(0.25, range)).toBe(range.low);
    expect(interpolateStat(0.5, range)).toBe(range.moderate);
    expect(interpolateStat(0.75, range)).toBe(range.high);
    expect(interpolateStat(1, range)).toBe(range.extreme);
  });

  it('interpolates within the high-to-extreme segment (scalar > 0.75)', () => {
    const expected = range.high + ((0.9 - 0.75) / 0.25) * (range.extreme - range.high);
    expect(interpolateStat(0.9, range)).toBeCloseTo(expected, 10);
  });

  it('clamps scalars outside 0-1', () => {
    expect(interpolateStat(-1, range)).toBe(range.terrible);
    expect(interpolateStat(2, range)).toBe(range.extreme);
  });

  it('recovers scalar 0 and 1 at the terrible and extreme endpoints', () => {
    expect(statToScalar(range.terrible, range)).toBe(0);
    expect(statToScalar(range.extreme, range)).toBe(1);
  });

  it('recovers a scalar in the high-to-extreme segment', () => {
    const value = range.high + 0.5 * (range.extreme - range.high);
    expect(statToScalar(value, range)).toBeCloseTo(0.875, 10);
  });

  it('clamps values outside the table to scalar 0 or 1', () => {
    expect(statToScalar(range.terrible - 100, range)).toBe(0);
    expect(statToScalar(range.extreme + 100, range)).toBe(1);
  });
});

describe('statToScalar4 edge branches (level 5 ability-modifier table row)', () => {
  const range = getStatRangesForLevel(5).abilityMod; // { low: 2, moderate: 4, high: 5, extreme: 6 }

  it('returns 0 at or below low, 1 at or above extreme', () => {
    expect(statToScalar4(range.low, range)).toBe(0);
    expect(statToScalar4(range.low - 10, range)).toBe(0);
    expect(statToScalar4(range.extreme, range)).toBe(1);
    expect(statToScalar4(range.extreme + 10, range)).toBe(1);
  });

  it('recovers a scalar in the moderate-to-high segment', () => {
    const value = range.moderate + 0.5 * (range.high - range.moderate);
    expect(statToScalar4(value, range)).toBeCloseTo(0.5, 10);
  });

  it('recovers a scalar in the high-to-extreme segment', () => {
    const value = range.high + 0.5 * (range.extreme - range.high);
    expect(statToScalar4(value, range)).toBeCloseTo(5 / 6, 10);
  });
});

describe('interpolateSkill boundaries (level 5 skills table row)', () => {
  const range = getStatRangesForLevel(5).skills; // { lowMin: 8, lowMax: 10, moderate: 12, high: 13, extreme: 16 }

  it('returns lowMin at scalar 0', () => {
    expect(interpolateSkill(0, range)).toBe(range.lowMin);
  });

  it('returns lowMax at the low-segment midpoint (1/6)', () => {
    expect(interpolateSkill(1 / 6, range)).toBe(range.lowMax);
  });

  it('returns moderate at scalar 1/3', () => {
    expect(interpolateSkill(1 / 3, range)).toBe(range.moderate);
  });

  it('returns high at scalar 2/3', () => {
    expect(interpolateSkill(2 / 3, range)).toBe(range.high);
  });

  it('returns extreme at scalar 1', () => {
    expect(interpolateSkill(1, range)).toBe(range.extreme);
  });

  it('interpolates midway within the lowMin-to-lowMax segment', () => {
    expect(interpolateSkill(1 / 12, range)).toBeCloseTo((range.lowMin + range.lowMax) / 2, 10);
  });

  it('clamps scalars outside 0-1', () => {
    expect(interpolateSkill(-5, range)).toBe(range.lowMin);
    expect(interpolateSkill(5, range)).toBe(range.extreme);
  });
});

describe('skillToScalar ∘ interpolateSkill (level 5 skills table row)', () => {
  const range = getStatRangesForLevel(5).skills;

  it('recovers scalar 0 at lowMin and 1 at extreme', () => {
    expect(skillToScalar(range.lowMin, range)).toBe(0);
    expect(skillToScalar(range.extreme, range)).toBe(1);
  });

  it('recovers the benchmark scalars at each table value', () => {
    expect(skillToScalar(range.lowMax, range)).toBeCloseTo(1 / 6, 10);
    expect(skillToScalar(range.moderate, range)).toBeCloseTo(1 / 3, 10);
    expect(skillToScalar(range.high, range)).toBeCloseTo(2 / 3, 10);
  });

  it('round-trips an interior scalar through interpolateSkill', () => {
    const s = 0.9;
    expect(skillToScalar(interpolateSkill(s, range), range)).toBeCloseTo(s, 10);
  });

  it('clamps values at or below lowMin to scalar 0', () => {
    expect(skillToScalar(range.lowMin - 10, range)).toBe(0);
  });
});

describe('interpolateHP low/high segments (level 5 HP table row)', () => {
  const range = getStatRangesForLevel(5).hp; // low 53-59, moderate 72-78, high 91-97

  it('interpolates within the low segment (scalar <= 1/3)', () => {
    expect(interpolateHP(0, range)).toBe(range.low.min);
    expect(interpolateHP(1 / 3, range)).toBe(range.low.max);
    expect(interpolateHP(1 / 6, range)).toBe(56); // midpoint of 53-59
  });

  it('interpolates within the high segment (scalar > 2/3)', () => {
    expect(interpolateHP(5 / 6, range)).toBe(94); // midpoint of 91-97
    expect(interpolateHP(1, range)).toBe(range.high.max);
  });
});

describe('hpToScalar (level 5 HP table row)', () => {
  const range = getStatRangesForLevel(5).hp; // low 53-59, moderate 72-78, high 91-97

  it('returns 0 at or below low.min, 1 at or above high.max', () => {
    expect(hpToScalar(range.low.min, range)).toBe(0);
    expect(hpToScalar(range.low.min - 100, range)).toBe(0);
    expect(hpToScalar(range.high.max, range)).toBe(1);
    expect(hpToScalar(range.high.max + 100, range)).toBe(1);
  });

  it('interpolates position within the low segment', () => {
    const mid = (range.low.min + range.low.max) / 2;
    expect(hpToScalar(mid, range)).toBeCloseTo(1 / 6, 5);
  });

  it('treats a gap between low.max and moderate.min as the start of moderate (scalar 1/3)', () => {
    const gapValue = range.low.max + 1;
    expect(gapValue).toBeLessThan(range.moderate.min);
    expect(hpToScalar(gapValue, range)).toBeCloseTo(1 / 3, 10);
  });

  it('interpolates position within the moderate segment', () => {
    const mid = (range.moderate.min + range.moderate.max) / 2;
    expect(hpToScalar(mid, range)).toBeCloseTo(0.5, 5);
  });

  it('treats a gap between moderate.max and high.min as the start of high (scalar 2/3)', () => {
    const gapValue = range.moderate.max + 1;
    expect(gapValue).toBeLessThan(range.high.min);
    expect(hpToScalar(gapValue, range)).toBeCloseTo(2 / 3, 10);
  });

  it('interpolates position within the high segment', () => {
    const mid = (range.high.min + range.high.max) / 2;
    expect(hpToScalar(mid, range)).toBeCloseTo(5 / 6, 5);
  });
});

describe('getHPRange / getHPBenchmarkLabel boundaries (level 5 HP table row)', () => {
  const range = getStatRangesForLevel(5).hp; // low 53-59, moderate 72-78, high 91-97

  it('selects low at and below the 1/3 boundary', () => {
    expect(getHPRange(0, range)).toEqual(range.low);
    expect(getHPRange(1 / 3, range)).toEqual(range.low);
    expect(getHPBenchmarkLabel(0)).toBe('low');
    expect(getHPBenchmarkLabel(1 / 3)).toBe('low');
  });

  it('selects moderate between the 1/3 and 2/3 boundaries (inclusive)', () => {
    expect(getHPRange(0.5, range)).toEqual(range.moderate);
    expect(getHPRange(2 / 3, range)).toEqual(range.moderate);
    expect(getHPBenchmarkLabel(0.5)).toBe('moderate');
    expect(getHPBenchmarkLabel(2 / 3)).toBe('moderate');
  });

  it('selects high above the 2/3 boundary', () => {
    expect(getHPRange(0.9, range)).toEqual(range.high);
    expect(getHPRange(1, range)).toEqual(range.high);
    expect(getHPBenchmarkLabel(0.9)).toBe('high');
    expect(getHPBenchmarkLabel(1)).toBe('high');
  });

  it('clamps scalars outside 0-1', () => {
    expect(getHPRange(-2, range)).toEqual(range.low);
    expect(getHPRange(2, range)).toEqual(range.high);
    expect(getHPBenchmarkLabel(-2)).toBe('low');
    expect(getHPBenchmarkLabel(2)).toBe('high');
  });
});

describe('getResistanceWeaknessRange', () => {
  it('returns the exact table row for in-range levels', () => {
    expect(getResistanceWeaknessRange(-1)).toEqual({ min: 1, max: 1 });
    expect(getResistanceWeaknessRange(5)).toEqual({ min: 4, max: 8 });
    expect(getResistanceWeaknessRange(24)).toEqual({ min: 13, max: 26 });
  });

  it('clamps levels below -1 and above 24', () => {
    expect(getResistanceWeaknessRange(-10)).toEqual({ min: 1, max: 1 });
    expect(getResistanceWeaknessRange(99)).toEqual({ min: 13, max: 26 });
  });

  it('rounds a fractional level to the nearest table row', () => {
    expect(getResistanceWeaknessRange(5.6)).toEqual({ min: 5, max: 9 }); // rounds to level 6
  });
});

describe('scaleResistanceWeakness', () => {
  it('preserves relative position within the range across levels', () => {
    // L5 range {min:4,max:8}: value 6 sits at scalar 0.5
    // L10 range {min:7,max:13}: scalar 0.5 -> round(7 + 0.5*6) = 10
    expect(scaleResistanceWeakness(6, 5, 10)).toBe(10);
  });

  it('maps the min and max of the source range to the min and max of the target range', () => {
    expect(scaleResistanceWeakness(4, 5, 10)).toBe(7);
    expect(scaleResistanceWeakness(8, 5, 10)).toBe(13);
  });

  it('treats a zero-width source range (level -1) as scalar 0.5', () => {
    // L-1 range {min:1,max:1}; L0 range {min:1,max:3} -> round(1 + 0.5*2) = 2
    expect(scaleResistanceWeakness(1, -1, 0)).toBe(2);
  });
});

describe('resistanceWeaknessToScalar ∘ scalarToResistanceWeakness round-trip (level 8 table row, min 6 max 11)', () => {
  it('maps range endpoints to scalar 0 and 1', () => {
    expect(resistanceWeaknessToScalar(6, 8)).toBe(0);
    expect(resistanceWeaknessToScalar(11, 8)).toBe(1);
  });

  it('clamps out-of-range values to scalar 0 or 1', () => {
    expect(resistanceWeaknessToScalar(0, 8)).toBe(0);
    expect(resistanceWeaknessToScalar(99, 8)).toBe(1);
  });

  it('treats a zero-width range (level -1) as scalar 0.5 regardless of value', () => {
    expect(resistanceWeaknessToScalar(1, -1)).toBe(0.5);
    expect(resistanceWeaknessToScalar(50, -1)).toBe(0.5);
  });

  it('scalarToResistanceWeakness rounds to the nearest whole value', () => {
    expect(scalarToResistanceWeakness(0.5, 8)).toBe(9); // round(6 + 0.5*5) = round(8.5) = 9
  });

  it('round-trips scalar -> value -> scalar at grid points that round without loss', () => {
    for (const s of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const value = scalarToResistanceWeakness(s, 8);
      expect(resistanceWeaknessToScalar(value, 8)).toBeCloseTo(s, 5);
    }
  });
});

describe('calculateCreatureStats — spell DC/Attack interpolation (level 5 table rows)', () => {
  it('interpolates spellDC between moderate and high (L5 moderate=19, high=22)', () => {
    const b = { ...getDefaultBenchmarks(), spellDC: 0.25 };
    const s = calculateCreatureStats(5, b);
    expect(s.spellDC).toBe(21); // 19 + 0.5*(22-19) = 20.5 -> rounds to 21
  });

  it('interpolates spellAttack between high and extreme (L5 high=14, extreme=18)', () => {
    const b = { ...getDefaultBenchmarks(), spellAttack: 0.75 };
    const s = calculateCreatureStats(5, b);
    expect(s.spellAttack).toBe(16); // 14 + 0.5*(18-14) = 16
  });

  it('leaves spellDC/spellAttack undefined when benchmarks omit them', () => {
    const s = calculateCreatureStats(5, getDefaultBenchmarks());
    expect(s.spellDC).toBeUndefined();
    expect(s.spellAttack).toBeUndefined();
  });
});

describe('spellStatToScalar boundaries (level 5 spellDC table row)', () => {
  const range = getStatRangesForLevel(5).spellDC; // { moderate: 19, high: 22, extreme: 26 }

  it('returns 0 at or below moderate', () => {
    expect(spellStatToScalar(range.moderate, range)).toBe(0);
    expect(spellStatToScalar(range.moderate - 5, range)).toBe(0);
  });

  it('returns 0.5 at high', () => {
    expect(spellStatToScalar(range.high, range)).toBe(0.5);
  });

  it('returns 1 at or above extreme', () => {
    expect(spellStatToScalar(range.extreme, range)).toBe(1);
    expect(spellStatToScalar(range.extreme + 5, range)).toBe(1);
  });

  it('interpolates linearly within the moderate-to-high segment', () => {
    const mid = (range.moderate + range.high) / 2;
    expect(spellStatToScalar(mid, range)).toBeCloseTo(0.25, 10);
  });

  it('interpolates linearly within the high-to-extreme segment', () => {
    const mid = (range.high + range.extreme) / 2;
    expect(spellStatToScalar(mid, range)).toBeCloseTo(0.75, 10);
  });
});

describe('getStrikeDamageForScalar boundary selection (level 5 strikeDamage table row)', () => {
  const range = getStatRangesForLevel(5).strikeDamage;

  it('selects low below the 1/6 boundary', () => {
    expect(getStrikeDamageForScalar(0, range)).toEqual(range.low);
    expect(getStrikeDamageForScalar(0.1, range)).toEqual(range.low);
  });

  it('selects moderate in the 1/6-1/2 band', () => {
    expect(getStrikeDamageForScalar(1 / 3, range)).toEqual(range.moderate);
  });

  it('selects high in the 1/2-5/6 band', () => {
    expect(getStrikeDamageForScalar(2 / 3, range)).toEqual(range.high);
  });

  it('selects extreme at and above the 5/6 boundary', () => {
    expect(getStrikeDamageForScalar(5 / 6, range)).toEqual(range.extreme);
    expect(getStrikeDamageForScalar(1, range)).toEqual(range.extreme);
  });

  it('clamps scalars outside 0-1', () => {
    expect(getStrikeDamageForScalar(-1, range)).toEqual(range.low);
    expect(getStrikeDamageForScalar(2, range)).toEqual(range.extreme);
  });
});

describe('scaleStrikeDamage (level 5 strikeDamage table row)', () => {
  const range = getStatRangesForLevel(5).strikeDamage;

  it('returns the benchmark entry unchanged when the target average matches it exactly', () => {
    expect(scaleStrikeDamage(0, range)).toEqual(range.low);
    expect(scaleStrikeDamage(1, range)).toEqual(range.extreme);
  });

  it('adjusts the modifier when interpolating within the low-to-moderate segment (scalar 1/6)', () => {
    // target = 11 + 0.5*(13-11) = 12; nearest benchmark is moderate (2d6+6, avg 13) -> adjust to 2d6+5
    const entry = scaleStrikeDamage(1 / 6, range);
    expect(entry.formula).toBe('2d6+5');
    expect(entry.average).toBe(12);
  });

  it('adjusts the modifier when interpolating within the high-to-extreme segment (scalar 5/6)', () => {
    // target = 16 + 0.5*(20-16) = 18; nearest benchmark is extreme (2d12+7, avg 20) -> adjust to 2d12+5
    const entry = scaleStrikeDamage(5 / 6, range);
    expect(entry.formula).toBe('2d12+5');
    expect(entry.average).toBe(18);
  });
});

describe('adjustDamageFormulaToAverage', () => {
  it('returns the base formula unchanged when its average already matches the target', () => {
    expect(adjustDamageFormulaToAverage('2d6+9', 16)).toBe('2d6+9'); // 2*3.5+9 = 16
  });

  it('returns the base formula unchanged when it cannot be parsed as dice', () => {
    expect(adjustDamageFormulaToAverage('not-a-formula', 10)).toBe('not-a-formula');
  });

  it('drops a zero modifier entirely', () => {
    expect(adjustDamageFormulaToAverage('2d6+3', 7)).toBe('2d6'); // dice-only average is already 7
  });

  it('appends a negative modifier when the target is below the dice-only average', () => {
    expect(adjustDamageFormulaToAverage('2d6+3', 3)).toBe('2d6-4'); // round(3 - 7) = -4
  });

  it('appends a positive modifier when the target is above the dice-only average', () => {
    expect(adjustDamageFormulaToAverage('2d6+3', 12)).toBe('2d6+5'); // round(12 - 7) = 5
  });
});

describe('getStrikeDamageBenchmarkLabel', () => {
  it('returns low at and below 1/6', () => {
    expect(getStrikeDamageBenchmarkLabel(0)).toBe('low');
    expect(getStrikeDamageBenchmarkLabel(1 / 6)).toBe('low');
  });

  it('returns moderate between 1/6 and 0.5 inclusive', () => {
    expect(getStrikeDamageBenchmarkLabel(0.3)).toBe('moderate');
    expect(getStrikeDamageBenchmarkLabel(0.5)).toBe('moderate');
  });

  it('returns high between 0.5 and 5/6 inclusive', () => {
    expect(getStrikeDamageBenchmarkLabel(0.6)).toBe('high');
    expect(getStrikeDamageBenchmarkLabel(5 / 6)).toBe('high');
  });

  it('returns extreme above 5/6', () => {
    expect(getStrikeDamageBenchmarkLabel(0.9)).toBe('extreme');
    expect(getStrikeDamageBenchmarkLabel(1)).toBe('extreme');
  });
});

describe('averageToDiceFormula', () => {
  it('picks the exact-average progression with no modifier', () => {
    const formula = averageToDiceFormula(7);
    expect(formula).toBe('2d6');
    expect(parseDiceFormulaAverage(formula)).toBe(7);
  });

  it('picks the closest progression and its formula average stays close to the target', () => {
    const formula = averageToDiceFormula(9.2);
    expect(formula).toBe('2d8');
    expect(parseDiceFormulaAverage(formula)).toBeCloseTo(9.2, 0);
  });

  it('produces a formula whose average exactly matches a large target', () => {
    const formula = averageToDiceFormula(50);
    expect(formula).toBe('6d12+11');
    expect(parseDiceFormulaAverage(formula)).toBe(50);
  });

  it('pins behavior for a zero average (smallest die, 1d4, with a negative modifier)', () => {
    expect(averageToDiceFormula(0)).toBe('1d4-2');
  });

  it('pins behavior for a small average (1)', () => {
    expect(averageToDiceFormula(1)).toBe('1d4-1');
  });
});

describe('applySpellSlotOverrides (via calculateCreatureStats spellSlots, level 5 fullPrepared)', () => {
  it('replaces the computed count for an existing rank', () => {
    const b: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      spellProgression: 'fullPrepared',
      spellSlotOverrides: { 1: 10 }
    };
    const s = calculateCreatureStats(5, b);
    expect(s.spellSlots).toEqual({ 0: 5, 1: 10, 2: 3, 3: 2 });
  });

  it('adds a rank the level curve never produced (level 5 tops out at rank 3)', () => {
    const b: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      spellProgression: 'fullPrepared',
      spellSlotOverrides: { 8: 2 }
    };
    const s = calculateCreatureStats(5, b);
    expect(s.spellSlots).toEqual({ 0: 5, 1: 3, 2: 3, 3: 2, 8: 2 });
  });

  it('zeroes a computed rank when overridden to 0 — the editor\'s "removed" state', () => {
    const b: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      spellProgression: 'fullPrepared',
      spellSlotOverrides: { 2: 0, 3: 0 }
    };
    const s = calculateCreatureStats(5, b);
    expect(s.spellSlots).toEqual({ 0: 5, 1: 3, 2: 0, 3: 0 });
  });

  it('ignores ranks outside 0-10 and clamps negative counts', () => {
    const b: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      spellProgression: 'fullPrepared',
      spellSlotOverrides: { [-1]: 4, 11: 4, 1.5: 4, 1: -3 }
    };
    const s = calculateCreatureStats(5, b);
    expect(s.spellSlots).toEqual({ 0: 5, 1: 0, 2: 3, 3: 2 });
  });

  it('leaves the computed layout untouched when no overrides are given', () => {
    const b: CreatureBenchmarks = { ...getDefaultBenchmarks(), spellProgression: 'fullPrepared' };
    const s = calculateCreatureStats(5, b);
    expect(s.spellSlots).toEqual({ 0: 5, 1: 3, 2: 3, 3: 2 });
  });

  it('produces no spellSlots when progression is unset, "none", or "innate"', () => {
    expect(calculateCreatureStats(5, getDefaultBenchmarks()).spellSlots).toBeUndefined();
    const none: CreatureBenchmarks = { ...getDefaultBenchmarks(), spellProgression: 'none' };
    const innate: CreatureBenchmarks = { ...getDefaultBenchmarks(), spellProgression: 'innate' };
    expect(calculateCreatureStats(5, none).spellSlots).toBeUndefined();
    expect(calculateCreatureStats(5, innate).spellSlots).toBeUndefined();
  });
});

describe('analyzeStatsForBenchmarks — spellDC/spellAttack/skills round-trip', () => {
  it('recovered spellDC, spellAttack, and skill benchmarks reproduce the same computed stats', () => {
    const level = 5;
    const original: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      spellDC: 0.25,
      spellAttack: 0.75,
      skills: [{ skill: 'stealth', benchmark: 0.6 }]
    };
    const stats = calculateCreatureStats(level, original);
    const recovered = analyzeStatsForBenchmarks(level, stats);

    expect(recovered.skills).toHaveLength(1);
    expect(recovered.skills?.[0].skill).toBe('stealth');

    const merged: CreatureBenchmarks = {
      ...original,
      ...recovered,
      abilities: { ...original.abilities, ...(recovered.abilities || {}) },
      saves: { ...original.saves, ...(recovered.saves || {}) }
    };
    const stats2 = calculateCreatureStats(level, merged);
    expect(stats2.spellDC).toBe(stats.spellDC);
    expect(stats2.spellAttack).toBe(stats.spellAttack);
    expect(stats2.skills.stealth).toBe(stats.skills.stealth);
  });
});

describe('analyzeStatsForBenchmarks — partial saves fall back to moderate (importing a partial actor)', () => {
  it('defaults reflex and will to BENCHMARK_VALUES.moderate when only fortitude is present', () => {
    // L5 saves extreme=17; fortitude=20 is at/above it, so it resolves to scalar 1 (not moderate)
    const recovered = analyzeStatsForBenchmarks(5, { fortitude: 20 });
    expect(recovered.saves?.fortitude).toBe(1);
    expect(recovered.saves?.reflex).toBe(BENCHMARK_VALUES.moderate);
    expect(recovered.saves?.will).toBe(BENCHMARK_VALUES.moderate);
  });

  it('defaults fortitude to moderate when only reflex is present', () => {
    const recovered = analyzeStatsForBenchmarks(5, { reflex: 20 });
    expect(recovered.saves?.fortitude).toBe(BENCHMARK_VALUES.moderate);
    expect(recovered.saves?.reflex).toBe(1);
    expect(recovered.saves?.will).toBe(BENCHMARK_VALUES.moderate);
  });

  it('defaults fortitude and reflex to moderate when only will is present', () => {
    const recovered = analyzeStatsForBenchmarks(5, { will: 20 });
    expect(recovered.saves?.fortitude).toBe(BENCHMARK_VALUES.moderate);
    expect(recovered.saves?.reflex).toBe(BENCHMARK_VALUES.moderate);
    expect(recovered.saves?.will).toBe(1);
  });

  it('produces no saves benchmark at all when none of the three are present', () => {
    const recovered = analyzeStatsForBenchmarks(5, {});
    expect(recovered.saves).toBeUndefined();
  });
});

describe('calculateTroopThresholds', () => {
  it('computes 2/3 and 1/3 HP thresholds and carries the gargantuan (default) square counts', () => {
    const t = calculateTroopThresholds(100);
    expect(t.maxHP).toBe(100);
    expect(t.threshold1).toBe(66); // floor(100 * 2/3)
    expect(t.threshold2).toBe(33); // floor(100 / 3)
    expect(t.squares).toEqual({
      full: TROOP_SQUARES.gargantuan.full,
      atThreshold1: TROOP_SQUARES.gargantuan.threshold1,
      atThreshold2: TROOP_SQUARES.gargantuan.threshold2
    });
  });

  it('floors fractional thresholds for a smaller troop', () => {
    const t = calculateTroopThresholds(50, 'large');
    expect(t.threshold1).toBe(33); // floor(50 * 2/3) = floor(33.33)
    expect(t.threshold2).toBe(16); // floor(50 / 3) = floor(16.67)
    expect(t.squares).toEqual({
      full: TROOP_SQUARES.large.full,
      atThreshold1: TROOP_SQUARES.large.threshold1,
      atThreshold2: TROOP_SQUARES.large.threshold2
    });
  });

  it('maps the huge troop size to its own square counts', () => {
    const t = calculateTroopThresholds(90, 'huge');
    expect(t.squares).toEqual({
      full: TROOP_SQUARES.huge.full,
      atThreshold1: TROOP_SQUARES.huge.threshold1,
      atThreshold2: TROOP_SQUARES.huge.threshold2
    });
  });
});
