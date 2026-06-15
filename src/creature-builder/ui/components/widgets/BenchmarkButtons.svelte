<script lang="ts">
  import {
    BENCHMARK_VALUES,
    BENCHMARK_VALUES_4,
    BENCHMARK_VALUES_3,
    SPELL_BENCHMARK_VALUES,
    getNearestBenchmarkLabel,
    getNearestBenchmarkLabel4,
    getNearestBenchmarkLabel3,
    getNearestSpellBenchmarkLabel,
    type BenchmarkLabel,
    type BenchmarkLabel4,
    type BenchmarkLabel3,
    type SpellBenchmarkLabel
  } from '@/creature-builder/models';

  let {
    value,
    benchmarks = ['terrible', 'low', 'moderate', 'high', 'extreme'],
    use4Benchmark = false,
    use3Benchmark = false,
    useSpellBenchmark = false,
    compact = false,
    onselect
  }: {
    value: number;
    benchmarks?: BenchmarkLabel[] | BenchmarkLabel4[] | BenchmarkLabel3[] | SpellBenchmarkLabel[];
    use4Benchmark?: boolean;
    use3Benchmark?: boolean;
    useSpellBenchmark?: boolean;
    compact?: boolean;
    onselect?: (detail: { value: number }) => void;
  } = $props();

  const BENCHMARK_DATA_5: Record<BenchmarkLabel, { label: string; abbrev: string; value: number }> = {
    terrible: { label: 'Terrible', abbrev: 'Ter', value: BENCHMARK_VALUES.terrible },
    low: { label: 'Low', abbrev: 'Low', value: BENCHMARK_VALUES.low },
    moderate: { label: 'Moderate', abbrev: 'Mod', value: BENCHMARK_VALUES.moderate },
    high: { label: 'High', abbrev: 'Hig', value: BENCHMARK_VALUES.high },
    extreme: { label: 'Extreme', abbrev: 'Ext', value: BENCHMARK_VALUES.extreme }
  };

  const BENCHMARK_DATA_4: Record<BenchmarkLabel4, { label: string; abbrev: string; value: number }> = {
    low: { label: 'Low', abbrev: 'Low', value: BENCHMARK_VALUES_4.low },
    moderate: { label: 'Moderate', abbrev: 'Mod', value: BENCHMARK_VALUES_4.moderate },
    high: { label: 'High', abbrev: 'Hig', value: BENCHMARK_VALUES_4.high },
    extreme: { label: 'Extreme', abbrev: 'Ext', value: BENCHMARK_VALUES_4.extreme }
  };

  const BENCHMARK_DATA_3: Record<BenchmarkLabel3, { label: string; abbrev: string; value: number }> = {
    low: { label: 'Low', abbrev: 'Low', value: BENCHMARK_VALUES_3.low },
    moderate: { label: 'Moderate', abbrev: 'Mod', value: BENCHMARK_VALUES_3.moderate },
    high: { label: 'High', abbrev: 'Hig', value: BENCHMARK_VALUES_3.high }
  };

  const BENCHMARK_DATA_SPELL: Record<SpellBenchmarkLabel, { label: string; abbrev: string; value: number }> = {
    moderate: { label: 'Moderate', abbrev: 'Mod', value: SPELL_BENCHMARK_VALUES.moderate },
    high: { label: 'High', abbrev: 'Hig', value: SPELL_BENCHMARK_VALUES.high },
    extreme: { label: 'Extreme', abbrev: 'Ext', value: SPELL_BENCHMARK_VALUES.extreme }
  };

  const activeBenchmark = $derived(
    useSpellBenchmark
      ? getNearestSpellBenchmarkLabel(value)
      : use3Benchmark
        ? getNearestBenchmarkLabel3(value)
        : use4Benchmark
          ? getNearestBenchmarkLabel4(value)
          : getNearestBenchmarkLabel(value)
  );

  const isExactMatch = $derived.by(() => {
    const benchmarkValues = useSpellBenchmark
      ? SPELL_BENCHMARK_VALUES
      : use3Benchmark
        ? BENCHMARK_VALUES_3
        : use4Benchmark
          ? BENCHMARK_VALUES_4
          : BENCHMARK_VALUES;
    const exactValue = benchmarkValues[activeBenchmark as keyof typeof benchmarkValues];
    return Math.abs(value - exactValue) < 0.01;
  });

  function getBenchmarkData(bm: BenchmarkLabel | BenchmarkLabel4 | BenchmarkLabel3 | SpellBenchmarkLabel) {
    if (useSpellBenchmark) return BENCHMARK_DATA_SPELL[bm as SpellBenchmarkLabel];
    if (use3Benchmark) return BENCHMARK_DATA_3[bm as BenchmarkLabel3];
    if (use4Benchmark) return BENCHMARK_DATA_4[bm as BenchmarkLabel4];
    return BENCHMARK_DATA_5[bm as BenchmarkLabel];
  }
</script>

<div class="buttons" class:compact>
  {#each benchmarks as bm}
    {@const data = getBenchmarkData(bm)}
    <button
      type="button"
      class="rm-benchmark-btn"
      class:active={activeBenchmark === bm}
      onclick={() => onselect?.({ value: data.value })}
      title={data.label}
    >
      {#if activeBenchmark === bm && !isExactMatch}~{/if}{data.abbrev}
    </button>
  {/each}
</div>

<style lang="scss">
  .buttons {
    display: flex;
    gap: var(--space-4);

    &.compact {
      gap: var(--space-2);
    }
  }

  .rm-benchmark-btn {
    box-sizing: border-box;
    display: inline-block;
    padding: var(--space-4) 0;
    width: 2.75rem;
    background: var(--surface-lowest);
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: var(--font-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    text-align: center;
    outline: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;

    .compact & {
      width: 2.25rem;
      font-size: var(--font-xs);
      padding: var(--space-2) 0;
    }

    &:hover {
      background: var(--surface-low);
      color: var(--text-secondary);
    }

    &.active {
      background: var(--surface-highest);
      border-color: rgba(128, 128, 128, 0.5);
      color: var(--text-primary);
    }
  }
</style>
