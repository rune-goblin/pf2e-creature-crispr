import { describe, it, expect } from 'vitest';
import {
  calculateCreatureStats,
  analyzeStatsForBenchmarks,
  calculateStrikeStats,
  PERSISTENT_EXPECTED_ROUNDS
} from '@/creature-builder/logic/creatureStatTables';
import { getDefaultBenchmarks, BENCHMARK_VALUES_4 } from '@/creature-builder/logic/models';

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
});
