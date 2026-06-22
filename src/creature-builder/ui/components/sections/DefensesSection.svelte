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
    onSetTroopSize
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
    onSetTroopSize?: (size: TroopSize) => void;
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

  const fmtSave = (v: number | undefined): string => (v === undefined ? '—' : v >= 0 ? `+${v}` : `${v}`);
</script>

<section class="editor-section">
  <CollapsibleSection label="Defenses" {expanded} ontoggle={() => onToggle?.()}>
    {#snippet summary()}
      <span class="sum-stat"><span class="sum-key">AC</span><strong>{computedStats?.ac ?? '—'}</strong></span>
      <span class="sum-stat"><span class="sum-key">HP</span><strong>{computedStats?.hp ?? '—'}</strong></span>
      <span class="sum-stat"><span class="sum-key">F</span><strong>{fmtSave(computedStats?.fortitude)}</strong></span>
      <span class="sum-stat"><span class="sum-key">R</span><strong>{fmtSave(computedStats?.reflex)}</strong></span>
      <span class="sum-stat"><span class="sum-key">W</span><strong>{fmtSave(computedStats?.will)}</strong></span>
    {/snippet}
  </CollapsibleSection>
  {#if expanded}
    <div class="section-body">
      {#if creature.isTroop}
        <div class="troop-info">
          <div class="troop-line">
            <span class="troop-label">Formation</span>
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
          </div>
          {#if troopInfo}
            <div class="troop-line"><span class="troop-label">Squares</span><span>{troopInfo.thresholds.squares.full} → {troopInfo.thresholds.squares.atThreshold1} → {troopInfo.thresholds.squares.atThreshold2}</span></div>
            <div class="troop-line"><span class="troop-label">HP thresholds</span><span>{troopInfo.thresholds.maxHP} / {troopInfo.thresholds.threshold1} / {troopInfo.thresholds.threshold2}</span></div>
            <div class="troop-line"><span class="troop-label">Weaknesses</span><span>area {troopInfo.weakness.area}, splash {troopInfo.weakness.splash} <em>(added on save)</em></span></div>
          {/if}
        </div>
      {/if}

      <div class="defenses-grid">
        <div class="grid-cell">
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
        </div>

        <!-- Immunities — valueless tags. Resistances/weaknesses are quantified, so they
             carry an inline value (and resistances a 'double vs' line), but share the cloud. -->
        <div class="grid-cell">
          <div class="damage-modifiers-header">
            <span class="modifier-title">Immunities</span>
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

        <div class="grid-row-divider"></div>

        <div class="grid-cell">
          <div class="damage-modifiers-header">
            <span class="modifier-title">Resistances</span>
            <span class="modifier-typical">(Range {resistanceWeaknessRange.min}–{resistanceWeaknessRange.max})</span>
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

        <div class="grid-cell">
          <div class="damage-modifiers-header">
            <span class="modifier-title">Weaknesses</span>
            <span class="modifier-typical">(Range {resistanceWeaknessRange.min}–{resistanceWeaknessRange.max})</span>
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
    </div>
  {/if}
</section>

<style lang="scss">
  .editor-section {
    background: var(--section-body-bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .section-body {
    padding: var(--space-16);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  .troop-size-select {
    text-transform: capitalize;
    min-height: auto;
    padding: var(--space-2) var(--space-24) var(--space-2) var(--space-8);
    font-size: var(--font-sm);
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
      align-items: center;
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

  /* Defenses (AC/HP/saves) + Immunities on the top row, Resistances + Weaknesses below;
     collapses to one column when the editor window gets narrow (container query keys off
     .editor-body, the resizable window — see container-type there). */
  .defenses-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    /* Central gutter equals the section's outer padding (--space-16) so the two columns sit in an
       even horizontal rhythm — same channel width as every other two-column section. */
    column-gap: var(--space-16);
    row-gap: var(--space-12);
  }

  .grid-row-divider {
    grid-column: 1 / -1;
    border-top: 1px solid var(--border-subtle);
  }

  @container (max-width: 48rem) {
    .defenses-grid {
      grid-template-columns: 1fr;
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
      width: 6.5rem;
      flex-shrink: 0;
    }

    .hp-range-value {
      width: 3.25rem;
      font-size: var(--font-sm);
      color: var(--text-muted);
      text-align: center;
    }
  }

  .damage-modifiers-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-6);
    margin-bottom: var(--space-8);
  }

  .modifier-title {
    font-size: var(--font-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }

  .modifier-typical {
    font-size: var(--font-xs);
    color: var(--text-tertiary);
  }
</style>
