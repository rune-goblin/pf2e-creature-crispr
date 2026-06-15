import { describe, it, expect } from 'vitest';
import { calculateCreatureStats, analyzeStatsForBenchmarks } from '@/creature-builder/config/creatureStatTables';
import { getDefaultBenchmarks } from '@/creature-builder/models';

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
