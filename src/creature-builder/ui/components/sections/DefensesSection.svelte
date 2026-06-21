<script lang="ts">
  import type { EditableCreature, CreatureStats, DamageModifier, Immunity } from '@/creature-builder/editor';
  import {
    getStatRangesForLevel,
    getHPRange,
    getResistanceWeaknessRange,
    calculateTroopThresholds,
    getTroopWeaknessValues
  } from '@/creature-builder/logic/creatureStatTables';
  import { TROOP_SIZES, type TroopSize } from '@/creature-builder/logic/models';
  import {
    RESISTANCE_TYPE_GROUPS,
    WEAKNESS_TYPE_GROUPS,
    IMMUNITY_TYPE_GROUPS,
    EXCEPTION_TYPE_GROUPS
  } from '@/creature-builder/logic/iwrTypes';
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
    onUpdateImmunity,
    onSetTroop,
    onSetTroopSize,
    onConvertToTroop
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
    onSetTroop?: (isTroop: boolean) => void;
    onSetTroopSize?: (size: TroopSize) => void;
    onConvertToTroop?: () => void;
  } = $props();

  const hpRangeSubtext = $derived.by(() => {
    if (!creature) return undefined;
    const ranges = getStatRangesForLevel(creature.level);
    const hpRange = getHPRange(creature.benchmarks.hp, ranges.hp);
    return `${hpRange.min}–${hpRange.max}`;
  });

  const resistanceWeaknessRange = $derived(getResistanceWeaknessRange(creature?.level ?? 1));

  // Troops show formation thresholds (from live HP) + level-derived area/splash weaknesses; the
  // weaknesses themselves are stamped on save, so here they're read-only guidance.
  const troopInfo = $derived.by(() => {
    if (!creature?.isTroop || !computedStats) return null;
    return {
      thresholds: calculateTroopThresholds(computedStats.hp, creature.troopSize ?? 'gargantuan'),
      weakness: getTroopWeaknessValues(creature.level)
    };
  });
</script>

<section class="editor-section">
  <CollapsibleSection label="Defenses" {expanded} ontoggle={() => onToggle?.()} />
  {#if expanded}
    <div class="section-body">
      <div class="troop-row">
        <label class="troop-toggle">
          <input type="checkbox" checked={creature.isTroop ?? false} onchange={(e) => onSetTroop?.(e.currentTarget.checked)} />
          <span>Troop</span>
        </label>
        {#if creature.isTroop}
          <select
            class="cc-select troop-size-select"
            value={creature.troopSize ?? 'gargantuan'}
            onchange={(e) => onSetTroopSize?.(e.currentTarget.value as TroopSize)}
            aria-label="Troop formation size"
          >
            {#each TROOP_SIZES as size (size)}
              <option value={size}>{size}</option>
            {/each}
          </select>
        {:else}
          <button type="button" class="convert-troop-btn" onclick={() => onConvertToTroop?.()}>
            <i class="fas fa-people-group"></i> Convert to Troop
          </button>
        {/if}
      </div>
      {#if troopInfo}
        <div class="troop-info">
          <div class="troop-line"><span class="troop-label">Squares</span><span>{troopInfo.thresholds.squares.full} → {troopInfo.thresholds.squares.atThreshold1} → {troopInfo.thresholds.squares.atThreshold2}</span></div>
          <div class="troop-line"><span class="troop-label">HP thresholds</span><span>{troopInfo.thresholds.maxHP} / {troopInfo.thresholds.threshold1} / {troopInfo.thresholds.threshold2}</span></div>
          <div class="troop-line"><span class="troop-label">Weaknesses</span><span>area {troopInfo.weakness.area}, splash {troopInfo.weakness.splash} <em>(added on save)</em></span></div>
        </div>
      {/if}

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

  .troop-row {
    display: flex;
    align-items: center;
    gap: var(--space-12);
  }

  .troop-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    font-size: var(--font-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    cursor: pointer;

    input {
      cursor: pointer;
    }
  }

  .troop-size-select {
    text-transform: capitalize;
    min-height: auto;
    padding: var(--space-2) var(--space-24) var(--space-2) var(--space-8);
    font-size: var(--font-sm);
  }

  .convert-troop-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-4) var(--space-12);
    background: var(--surface-lowest);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: var(--font-sm);
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
      background: var(--hover);
      border-color: var(--color-primary);
      color: var(--text-primary);
    }

    i {
      font-size: var(--font-xs);
    }
  }

  .troop-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-8) var(--space-12);
    background: var(--surface-lowest);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: var(--font-sm);
    color: var(--text-secondary);

    .troop-line {
      display: flex;
      gap: var(--space-8);
    }

    .troop-label {
      width: 8rem;
      flex-shrink: 0;
      color: var(--text-muted);
    }

    em {
      color: var(--text-muted);
      font-style: italic;
    }
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
