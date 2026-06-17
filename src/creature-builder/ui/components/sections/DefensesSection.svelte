<script lang="ts">
  import type { EditableCreature, CreatureStats, DamageModifier, Immunity } from '@/creature-builder/editor';
  import { getStatRangesForLevel, getHPRange, getResistanceWeaknessRange } from '@/creature-builder/config/creatureStatTables';
  import {
    RESISTANCE_TYPE_GROUPS,
    WEAKNESS_TYPE_GROUPS,
    IMMUNITY_TYPE_GROUPS,
    EXCEPTION_TYPE_GROUPS
  } from '@/creature-builder/config/iwrTypes';
  import BenchmarkSelector from '../widgets/BenchmarkSelector.svelte';
  import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
  import IwrChipCloud from '../widgets/IwrChipCloud.svelte';

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
    onUpdateWeakness,
    onAddImmunity,
    onRemoveImmunity,
    onUpdateImmunity
  }: {
    creature: EditableCreature;
    computedStats: CreatureStats | null;
    expanded: boolean;
    onToggle?: () => void;
    onBenchmarkSelect?: (d: { path: string; value: number }) => void;
    onBenchmarkEdit?: (d: { path: string; value: number; statType: string }) => void;
    onAddResistance?: (type: string) => void;
    onRemoveResistance?: (index: number) => void;
    onUpdateResistance?: (d: { index: number; updates: Partial<DamageModifier> }) => void;
    onAddWeakness?: (type: string) => void;
    onRemoveWeakness?: (index: number) => void;
    onUpdateWeakness?: (d: { index: number; updates: Partial<DamageModifier> }) => void;
    onAddImmunity?: (type: string) => void;
    onRemoveImmunity?: (index: number) => void;
    onUpdateImmunity?: (d: { index: number; updates: Partial<Immunity> }) => void;
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

      <!-- Immunities — valueless tags. Resistances/weaknesses are quantified, so they
           carry an inline value (and resistances a 'double vs' line), but share the cloud. -->
      <div class="damage-modifiers-section">
        <div class="damage-modifiers-header">
          <span class="modifier-title">Immunities{#if creature.immunities.length}<span class="modifier-count">{creature.immunities.length}</span>{/if}</span>
        </div>
        <IwrChipCloud
          items={creature.immunities}
          typeGroups={IMMUNITY_TYPE_GROUPS}
          exceptionGroups={EXCEPTION_TYPE_GROUPS}
          addLabel="add immunity"
          onAdd={(type) => onAddImmunity?.(type)}
          onRemove={(index) => onRemoveImmunity?.(index)}
          onUpdate={(index, updates) => onUpdateImmunity?.({ index, updates })}
        />
      </div>

      <!-- Resistances -->
      <div class="damage-modifiers-section">
        <div class="damage-modifiers-header">
          <span class="modifier-title">Resistances{#if creature.resistances.length}<span class="modifier-count">{creature.resistances.length}</span>{/if}</span>
          <span class="modifier-typical">typical {resistanceWeaknessRange.min}–{resistanceWeaknessRange.max}</span>
        </div>
        <IwrChipCloud
          items={creature.resistances}
          typeGroups={RESISTANCE_TYPE_GROUPS}
          exceptionGroups={EXCEPTION_TYPE_GROUPS}
          addLabel="add resistance"
          valued
          showDoubleVs
          valueRange={resistanceWeaknessRange}
          onAdd={(type) => onAddResistance?.(type)}
          onRemove={(index) => onRemoveResistance?.(index)}
          onUpdate={(index, updates) => onUpdateResistance?.({ index, updates })}
        />
      </div>

      <!-- Weaknesses -->
      <div class="damage-modifiers-section">
        <div class="damage-modifiers-header">
          <span class="modifier-title">Weaknesses{#if creature.weaknesses.length}<span class="modifier-count">{creature.weaknesses.length}</span>{/if}</span>
          <span class="modifier-typical">typical {resistanceWeaknessRange.min}–{resistanceWeaknessRange.max}</span>
        </div>
        <IwrChipCloud
          items={creature.weaknesses}
          typeGroups={WEAKNESS_TYPE_GROUPS}
          exceptionGroups={EXCEPTION_TYPE_GROUPS}
          addLabel="add weakness"
          valued
          valueRange={resistanceWeaknessRange}
          onAdd={(type) => onAddWeakness?.(type)}
          onRemove={(index) => onRemoveWeakness?.(index)}
          onUpdate={(index, updates) => onUpdateWeakness?.({ index, updates })}
        />
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
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-8);
  }

  .modifier-title {
    font-size: var(--font-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }

  .modifier-count {
    margin-left: var(--space-6);
    font-size: var(--font-xs);
    font-weight: var(--font-weight-medium);
    color: var(--text-muted);
  }

  .modifier-typical {
    font-size: var(--font-xs);
    color: var(--text-muted);
  }
</style>
