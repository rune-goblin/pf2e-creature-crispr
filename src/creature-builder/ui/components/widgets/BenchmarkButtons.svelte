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
  } from '@/creature-builder/logic/models';
  import BenchmarkBadge from './BenchmarkBadge.svelte';

  let {
    value,
    benchmarks = ['terrible', 'low', 'moderate', 'high', 'extreme'],
    use4Benchmark = false,
    use3Benchmark = false,
    useSpellBenchmark = false,
    compact = false,
    onselect,
    onedit
  }: {
    value: number;
    benchmarks?: BenchmarkLabel[] | BenchmarkLabel4[] | BenchmarkLabel3[] | SpellBenchmarkLabel[];
    use4Benchmark?: boolean;
    use3Benchmark?: boolean;
    useSpellBenchmark?: boolean;
    compact?: boolean;
    onselect?: (detail: { value: number }) => void;
    onedit?: () => void;
  } = $props();

  const BENCHMARK_DATA_5: Record<BenchmarkLabel, { label: string; abbrev: string; value: number }> = {
    terrible: { label: 'Terrible', abbrev: 'Terr', value: BENCHMARK_VALUES.terrible },
    low: { label: 'Low', abbrev: 'Low', value: BENCHMARK_VALUES.low },
    moderate: { label: 'Moderate', abbrev: 'Mod', value: BENCHMARK_VALUES.moderate },
    high: { label: 'High', abbrev: 'High', value: BENCHMARK_VALUES.high },
    extreme: { label: 'Extreme', abbrev: 'Ext', value: BENCHMARK_VALUES.extreme }
  };

  const BENCHMARK_DATA_4: Record<BenchmarkLabel4, { label: string; abbrev: string; value: number }> = {
    low: { label: 'Low', abbrev: 'Low', value: BENCHMARK_VALUES_4.low },
    moderate: { label: 'Moderate', abbrev: 'Mod', value: BENCHMARK_VALUES_4.moderate },
    high: { label: 'High', abbrev: 'High', value: BENCHMARK_VALUES_4.high },
    extreme: { label: 'Extreme', abbrev: 'Ext', value: BENCHMARK_VALUES_4.extreme }
  };

  const BENCHMARK_DATA_3: Record<BenchmarkLabel3, { label: string; abbrev: string; value: number }> = {
    low: { label: 'Low', abbrev: 'Low', value: BENCHMARK_VALUES_3.low },
    moderate: { label: 'Moderate', abbrev: 'Mod', value: BENCHMARK_VALUES_3.moderate },
    high: { label: 'High', abbrev: 'High', value: BENCHMARK_VALUES_3.high }
  };

  const BENCHMARK_DATA_SPELL: Record<SpellBenchmarkLabel, { label: string; abbrev: string; value: number }> = {
    moderate: { label: 'Moderate', abbrev: 'Mod', value: SPELL_BENCHMARK_VALUES.moderate },
    high: { label: 'High', abbrev: 'High', value: SPELL_BENCHMARK_VALUES.high },
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
    <BenchmarkBadge
      tier={bm}
      label={data.abbrev}
      active={activeBenchmark === bm}
      approximate={!isExactMatch}
      interactive={true}
      {compact}
      title={data.label}
      onclick={() => onselect?.({ value: data.value })}
    />
  {/each}
  {#if onedit}
    <button type="button" class="edit-btn" class:compact title="Edit" aria-label="Edit" onclick={() => onedit?.()}>
      <i class="fas fa-pen"></i>
    </button>
  {/if}
</div>

<style lang="scss">
  .buttons {
    display: flex;
    align-items: center;
    gap: var(--space-4);

    &.compact {
      gap: var(--space-2);
    }
  }

  /* Matches the benchmark badge box metrics so it sits flush with the tabs; the pencil
     keeps it from reading as a fifth tier. */
  .edit-btn {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4) var(--space-8);
    background: var(--surface-lowest);
    border: 1px solid var(--border-faint);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: var(--font-sm);
    cursor: pointer;
    outline: none;
    transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;

    &:hover {
      background: var(--surface-low);
      border-color: var(--border-default);
      color: var(--text-secondary);
    }

    &.compact {
      font-size: var(--font-xs);
      padding: var(--space-2) var(--space-6);
    }
  }
</style>
