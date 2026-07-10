import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_VALUES,
  BENCHMARK_VALUES_3,
  SPELL_BENCHMARK_VALUES,
  getNearestBenchmarkLabel,
  getNearestBenchmarkLabel3,
  getNearestSpellBenchmarkLabel
} from '@/creature-builder/logic/models/benchmarks';

describe('getNearestBenchmarkLabel (5-benchmark system)', () => {
  it('returns each label for its own exact benchmark value', () => {
    for (const [label, value] of Object.entries(BENCHMARK_VALUES)) {
      expect(getNearestBenchmarkLabel(value)).toBe(label);
    }
  });

  it('resolves a tie at a bucket boundary to the lower label (<=, not <)', () => {
    expect(getNearestBenchmarkLabel(0.125)).toBe('terrible'); // midpoint of terrible/low
    expect(getNearestBenchmarkLabel(0.625)).toBe('moderate'); // midpoint of moderate/high
  });

  it('clamps a scalar below the lowest benchmark to the lowest label', () => {
    expect(getNearestBenchmarkLabel(-1)).toBe('terrible');
  });

  it('clamps a scalar above the highest benchmark to the highest label', () => {
    expect(getNearestBenchmarkLabel(2)).toBe('extreme');
  });

  it('falls back to the top label when the scalar never compares true to any bucket (NaN)', () => {
    expect(getNearestBenchmarkLabel(NaN)).toBe('extreme');
  });
});

describe('getNearestBenchmarkLabel3 (3-benchmark system)', () => {
  it('returns each label for its own exact benchmark value', () => {
    for (const [label, value] of Object.entries(BENCHMARK_VALUES_3)) {
      expect(getNearestBenchmarkLabel3(value)).toBe(label);
    }
  });

  it('resolves a tie at a bucket boundary to the lower label', () => {
    expect(getNearestBenchmarkLabel3(1 / 3)).toBe('low'); // midpoint of low/moderate
    expect(getNearestBenchmarkLabel3(2 / 3)).toBe('moderate'); // midpoint of moderate/high
  });

  it('clamps a scalar below the lowest benchmark to the lowest label', () => {
    expect(getNearestBenchmarkLabel3(-1)).toBe('low');
  });

  it('clamps a scalar above the highest benchmark to the highest label', () => {
    expect(getNearestBenchmarkLabel3(2)).toBe('high');
  });
});

describe('getNearestSpellBenchmarkLabel (spell DC/attack 3-benchmark system)', () => {
  it('returns each label for its own exact benchmark value', () => {
    for (const [label, value] of Object.entries(SPELL_BENCHMARK_VALUES)) {
      expect(getNearestSpellBenchmarkLabel(value)).toBe(label);
    }
  });

  it('resolves a tie at a bucket boundary to the lower label', () => {
    expect(getNearestSpellBenchmarkLabel(0.25)).toBe('moderate'); // midpoint of moderate/high
    expect(getNearestSpellBenchmarkLabel(0.75)).toBe('high'); // midpoint of high/extreme
  });

  it('clamps a scalar below the lowest benchmark to the lowest label', () => {
    expect(getNearestSpellBenchmarkLabel(-1)).toBe('moderate');
  });

  it('clamps a scalar above the highest benchmark to the highest label', () => {
    expect(getNearestSpellBenchmarkLabel(2)).toBe('extreme');
  });
});
