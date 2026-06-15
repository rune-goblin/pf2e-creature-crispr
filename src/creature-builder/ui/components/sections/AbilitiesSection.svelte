<script lang="ts">
  import type { EditableCreature, CreatureStats } from '@/creature-builder/editor';
  import { ABILITY_SCORES, ABILITY_SCORE_LABELS } from '@/creature-builder/models';
  import BenchmarkSelector from '../widgets/BenchmarkSelector.svelte';
  import CollapsibleSection from '../widgets/CollapsibleSection.svelte';

  let {
    creature,
    computedStats,
    expanded,
    onToggle,
    onBenchmarkSelect,
    onBenchmarkEdit
  }: {
    creature: EditableCreature;
    computedStats: CreatureStats | null;
    expanded: boolean;
    onToggle?: () => void;
    onBenchmarkSelect?: (detail: { path: string; value: number }) => void;
    onBenchmarkEdit?: (detail: { path: string; value: number; statType: string }) => void;
  } = $props();
</script>

<section class="editor-section">
  <CollapsibleSection label="Ability Scores" {expanded} ontoggle={() => onToggle?.()} />
  {#if expanded}
    <div class="section-body">
      <div class="benchmark-grid">
        {#each ABILITY_SCORES as ability}
          <BenchmarkSelector
            label={ABILITY_SCORE_LABELS[ability]}
            value={creature.benchmarks.abilities[ability]}
            computedValue={computedStats?.[ability]}
            benchmarks={['low', 'moderate', 'high', 'extreme']}
            use4Benchmark={true}
            onselect={(d) => onBenchmarkSelect?.({ path: `abilities.${ability}`, value: d.value })}
            onedit={(d) => onBenchmarkEdit?.({ path: `abilities.${ability}`, value: d.value, statType: 'ability' })}
          />
        {/each}
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  .editor-section {
    background: var(--surface-low);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .section-body {
    padding: var(--space-16);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  .benchmark-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
</style>
