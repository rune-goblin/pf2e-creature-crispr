/**
 * Creature benchmark tables and label-resolver functions.
 *
 * Scalar benchmark values (0.0-1.0) map onto discrete labels for the
 * 5/4/3-benchmark systems plus the spell-only 3-benchmark system.
 */

// Scalar benchmark values map to these discrete labels (5-benchmark system)
// 0.00 = Terrible, 0.25 = Low, 0.50 = Moderate, 0.75 = High, 1.00 = Extreme
export const BENCHMARK_VALUES = {
  terrible: 0.00,
  low: 0.25,
  moderate: 0.50,
  high: 0.75,
  extreme: 1.00
} as const;

export type BenchmarkLabel = keyof typeof BENCHMARK_VALUES;

/**
 * Generic "which bucket does this scalar fall into?" helper. Each bucket is
 * `{ upTo, label }`; the first bucket whose `upTo` covers `scalar` wins. The
 * last bucket's `upTo` is conventionally Infinity (or any value ≥ 1).
 */
function nearestLabel<T>(scalar: number, buckets: ReadonlyArray<{ upTo: number; label: T }>): T {
  for (const { upTo, label } of buckets) {
    if (scalar <= upTo) return label;
  }
  return buckets[buckets.length - 1].label;
}

const BENCHMARK_BUCKETS_5: ReadonlyArray<{ upTo: number; label: BenchmarkLabel }> = [
  { upTo: 0.125, label: 'terrible' },
  { upTo: 0.375, label: 'low' },
  { upTo: 0.625, label: 'moderate' },
  { upTo: 0.875, label: 'high' },
  { upTo: Infinity, label: 'extreme' },
];

/**
 * Get the nearest benchmark label for a scalar value (5-benchmark system)
 */
export function getNearestBenchmarkLabel(scalar: number): BenchmarkLabel {
  return nearestLabel(scalar, BENCHMARK_BUCKETS_5);
}

// 4-benchmark system for ability modifiers (no "terrible" benchmark in PF2e GMG)
// 0.00 = Low, 0.33 = Moderate, 0.67 = High, 1.00 = Extreme
export const BENCHMARK_VALUES_4 = {
  low: 0.00,
  moderate: 1 / 3,
  high: 2 / 3,
  extreme: 1.00
} as const;

export type BenchmarkLabel4 = keyof typeof BENCHMARK_VALUES_4;

const BENCHMARK_BUCKETS_4: ReadonlyArray<{ upTo: number; label: BenchmarkLabel4 }> = [
  { upTo: 1 / 6, label: 'low' },
  { upTo: 0.5, label: 'moderate' },
  { upTo: 5 / 6, label: 'high' },
  { upTo: Infinity, label: 'extreme' },
];

/**
 * Get the nearest benchmark label for a scalar value (4-benchmark system)
 */
export function getNearestBenchmarkLabel4(scalar: number): BenchmarkLabel4 {
  return nearestLabel(scalar, BENCHMARK_BUCKETS_4);
}

// 3-benchmark system for HP (low, moderate, high only in PF2e GMG)
// Segments: 0-1/3 (low), 1/3-2/3 (moderate), 2/3-1 (high)
// Benchmark values at segment midpoints for centered selection
export const BENCHMARK_VALUES_3 = {
  low: 1 / 6,       // 0.167 - midpoint of low segment
  moderate: 0.50,   // midpoint of moderate segment
  high: 5 / 6       // 0.833 - midpoint of high segment
} as const;

export type BenchmarkLabel3 = keyof typeof BENCHMARK_VALUES_3;

const BENCHMARK_BUCKETS_3: ReadonlyArray<{ upTo: number; label: BenchmarkLabel3 }> = [
  { upTo: 1 / 3, label: 'low' },
  { upTo: 2 / 3, label: 'moderate' },
  { upTo: Infinity, label: 'high' },
];

/**
 * Get the nearest benchmark label for a scalar value (3-benchmark system)
 * Boundaries at 1/3 and 2/3
 */
export function getNearestBenchmarkLabel3(scalar: number): BenchmarkLabel3 {
  return nearestLabel(scalar, BENCHMARK_BUCKETS_3);
}

// 3-benchmark system for Spell DC/Attack (moderate, high, extreme in PF2e GMG)
// Uses scalar: 0 = moderate, 0.5 = high, 1 = extreme
export const SPELL_BENCHMARK_VALUES = {
  moderate: 0,
  high: 0.5,
  extreme: 1
} as const;

export type SpellBenchmarkLabel = keyof typeof SPELL_BENCHMARK_VALUES;

const SPELL_BENCHMARK_BUCKETS: ReadonlyArray<{ upTo: number; label: SpellBenchmarkLabel }> = [
  { upTo: 0.25, label: 'moderate' },
  { upTo: 0.75, label: 'high' },
  { upTo: Infinity, label: 'extreme' },
];

/**
 * Get the nearest spell benchmark label for a scalar value
 * 0-0.25 = moderate, 0.25-0.75 = high, 0.75-1 = extreme
 */
export function getNearestSpellBenchmarkLabel(scalar: number): SpellBenchmarkLabel {
  return nearestLabel(scalar, SPELL_BENCHMARK_BUCKETS);
}
