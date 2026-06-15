<script lang="ts">
  import type { EditableCreature, CreatureStats, DamageModifier } from '@/creature-builder/editor';
  import { getStatRangesForLevel, getHPRange, getResistanceWeaknessRange } from '@/creature-builder/config/creatureStatTables';
  import { DAMAGE_TYPES } from '@/creature-builder/editor/creatureEditorUtils';
  import BenchmarkSelector from '../widgets/BenchmarkSelector.svelte';
  import CollapsibleSection from '../widgets/CollapsibleSection.svelte';

  let {
    creature,
    computedStats,
    expanded,
    onToggle,
    onBenchmarkSelect,
    onBenchmarkEdit,
    onAddResistance,
    onRemoveResistance,
    onUpdateResistance,
    onAddWeakness,
    onRemoveWeakness,
    onUpdateWeakness
  }: {
    creature: EditableCreature;
    computedStats: CreatureStats | null;
    expanded: boolean;
    onToggle?: () => void;
    onBenchmarkSelect?: (d: { path: string; value: number }) => void;
    onBenchmarkEdit?: (d: { path: string; value: number; statType: string }) => void;
    onAddResistance?: () => void;
    onRemoveResistance?: (index: number) => void;
    onUpdateResistance?: (d: { index: number; updates: Partial<DamageModifier> }) => void;
    onAddWeakness?: () => void;
    onRemoveWeakness?: (index: number) => void;
    onUpdateWeakness?: (d: { index: number; updates: Partial<DamageModifier> }) => void;
  } = $props();

  const hpRangeSubtext = $derived.by(() => {
    if (!creature) return undefined;
    const ranges = getStatRangesForLevel(creature.level);
    const hpRange = getHPRange(creature.benchmarks.hp, ranges.hp);
    return `${hpRange.min}–${hpRange.max}`;
  });

  const resistanceWeaknessRange = $derived(getResistanceWeaknessRange(creature?.level ?? 1));
</script>

<section class="editor-section">
  <CollapsibleSection label="Defenses" {expanded} ontoggle={() => onToggle?.()} />
  {#if expanded}
    <div class="section-body">
      <div class="benchmark-grid">
        <BenchmarkSelector
          label="AC"
          value={creature.benchmarks.ac}
          computedValue={computedStats?.ac}
          benchmarks={['low', 'moderate', 'high', 'extreme']}
          use4Benchmark={true}
          formatValue={(v) => v === undefined ? '-' : String(v)}
          onselect={(d) => onBenchmarkSelect?.({ path: 'ac', value: d.value })}
          onedit={(d) => onBenchmarkEdit?.({ path: 'ac', value: d.value, statType: 'ac' })}
        />
        <BenchmarkSelector
          label="HP"
          value={creature.benchmarks.hp}
          computedValue={computedStats?.hp}
          benchmarks={['low', 'moderate', 'high']}
          use3Benchmark={true}
          formatValue={(v) => v === undefined ? '-' : String(v)}
          onselect={(d) => onBenchmarkSelect?.({ path: 'hp', value: d.value })}
          onedit={(d) => onBenchmarkEdit?.({ path: 'hp', value: d.value, statType: 'hp' })}
        />
        <div class="hp-range-row">
          <span class="hp-range-label"></span>
          <span class="hp-range-value">{hpRangeSubtext}</span>
        </div>
        <BenchmarkSelector
          label="Fort"
          value={creature.benchmarks.saves.fortitude}
          computedValue={computedStats?.fortitude}
          onselect={(d) => onBenchmarkSelect?.({ path: 'saves.fortitude', value: d.value })}
          onedit={(d) => onBenchmarkEdit?.({ path: 'saves.fortitude', value: d.value, statType: 'save' })}
        />
        <BenchmarkSelector
          label="Ref"
          value={creature.benchmarks.saves.reflex}
          computedValue={computedStats?.reflex}
          onselect={(d) => onBenchmarkSelect?.({ path: 'saves.reflex', value: d.value })}
          onedit={(d) => onBenchmarkEdit?.({ path: 'saves.reflex', value: d.value, statType: 'save' })}
        />
        <BenchmarkSelector
          label="Will"
          value={creature.benchmarks.saves.will}
          computedValue={computedStats?.will}
          onselect={(d) => onBenchmarkSelect?.({ path: 'saves.will', value: d.value })}
          onedit={(d) => onBenchmarkEdit?.({ path: 'saves.will', value: d.value, statType: 'save' })}
        />
      </div>

      <!-- Resistances -->
      <div class="damage-modifiers-section">
        <div class="damage-modifiers-header">
          <span>Resistances</span>
          <button class="add-modifier-btn" aria-label="Add resistance" title="Add resistance" onclick={() => onAddResistance?.()}>
            <i class="fas fa-plus"></i>
          </button>
        </div>
        {#if creature.resistances.length > 0}
          <div class="damage-modifiers-list">
            {#each creature.resistances as resistance, index (index)}
              <div class="damage-modifier-row">
                <select
                  class="rm-select modifier-type-select"
                  value={resistance.type}
                  onchange={(e) => onUpdateResistance?.({ index, updates: { type: e.currentTarget.value } })}
                >
                  {#each DAMAGE_TYPES as dt (dt)}
                    <option value={dt}>{dt}</option>
                  {/each}
                </select>
                <input
                  type="number"
                  class="rm-input modifier-value-input"
                  value={resistance.value}
                  min="1"
                  onchange={(e) => onUpdateResistance?.({ index, updates: { value: parseInt(e.currentTarget.value) || 1 } })}
                />
                <span class="modifier-range">({resistanceWeaknessRange.min}-{resistanceWeaknessRange.max})</span>
                <button class="remove-modifier-btn" aria-label="Remove resistance" title="Remove resistance" onclick={() => onRemoveResistance?.(index)}>
                  <i class="fas fa-times"></i>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Weaknesses -->
      <div class="damage-modifiers-section">
        <div class="damage-modifiers-header">
          <span>Weaknesses</span>
          <button class="add-modifier-btn" aria-label="Add weakness" title="Add weakness" onclick={() => onAddWeakness?.()}>
            <i class="fas fa-plus"></i>
          </button>
        </div>
        {#if creature.weaknesses.length > 0}
          <div class="damage-modifiers-list">
            {#each creature.weaknesses as weakness, index (index)}
              <div class="damage-modifier-row">
                <select
                  class="rm-select modifier-type-select"
                  value={weakness.type}
                  onchange={(e) => onUpdateWeakness?.({ index, updates: { type: e.currentTarget.value } })}
                >
                  {#each DAMAGE_TYPES as dt (dt)}
                    <option value={dt}>{dt}</option>
                  {/each}
                </select>
                <input
                  type="number"
                  class="rm-input modifier-value-input"
                  value={weakness.value}
                  min="1"
                  onchange={(e) => onUpdateWeakness?.({ index, updates: { value: parseInt(e.currentTarget.value) || 1 } })}
                />
                <span class="modifier-range">({resistanceWeaknessRange.min}-{resistanceWeaknessRange.max})</span>
                <button class="remove-modifier-btn" aria-label="Remove weakness" title="Remove weakness" onclick={() => onRemoveWeakness?.(index)}>
                  <i class="fas fa-times"></i>
                </button>
              </div>
            {/each}
          </div>
        {/if}
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

  .hp-range-row {
    display: flex;
    align-items: center;
    gap: var(--space-10);
    margin-bottom: var(--space-8);

    .hp-range-label {
      width: 5.5rem;
      flex-shrink: 0;
    }

    .hp-range-value {
      width: 5rem;
      font-size: var(--font-sm);
      color: var(--text-muted);
      text-align: center;
    }
  }

  /* Damage Modifiers (Resistances/Weaknesses) */
  .damage-modifiers-section {
    margin-top: var(--space-16);
    padding-top: var(--space-12);
    border-top: 1px solid var(--border-subtle);
  }

  .damage-modifiers-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-8);

    span {
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-secondary);
    }
  }

  .add-modifier-btn {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: var(--surface-low);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: pointer;

    &:hover {
      background: var(--surface-high);
      color: var(--text-primary);
    }
  }

  .damage-modifiers-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .damage-modifier-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }

  .modifier-type-select {
    min-height: auto;
    padding: var(--space-4) var(--space-24) var(--space-4) var(--space-8);
    font-size: var(--font-sm);
    width: 8rem;
  }

  .modifier-value-input {
    width: 4rem;
    padding: var(--space-4) var(--space-8);
    font-size: var(--font-sm);
    text-align: center;
  }

  .modifier-range {
    font-size: var(--font-xs);
    color: var(--text-muted);
  }

  .remove-modifier-btn {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--text-muted);
    font-size: var(--font-xs);
    cursor: pointer;

    &:hover {
      color: var(--text-danger);
    }
  }
</style>
