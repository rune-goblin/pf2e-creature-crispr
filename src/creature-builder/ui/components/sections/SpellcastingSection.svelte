<script lang="ts">
   import type { EditableCreature, CreatureStats } from '@/creature-builder/editor';
   import { SPELL_BENCHMARK_VALUES, SPELL_TRADITIONS, type SpellBenchmarkLabel } from '@/creature-builder/logic/models';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import { getStatRangesForLevel, spellStatToScalar } from '@/creature-builder/logic/creatureStatTables';
   import {
      getSpellSlots,
      getMaxSpellRankForProgression,
      MAX_SPELL_RANK
   } from '@/creature-builder/logic/spellSlotTables';
   import {
      SPELL_PROGRESSION_OPTIONS,
      SPELL_TRADITION_LABELS,
      SPELL_FONT_OPTIONS
   } from '@/creature-builder/editor/creatureEditorUtils';

   let {
      creature,
      computedStats,
      expanded,
      onToggle,
      onUpdateBenchmark,
      onSetSpellSlotOverride,
      onResetSpellSlotOverride
   }: {
      creature: EditableCreature;
      computedStats: CreatureStats | null;
      expanded: boolean;
      onToggle?: () => void;
      onUpdateBenchmark?: (d: { path: string; value: number | string | undefined }) => void;
      onSetSpellSlotOverride?: (d: { rank: number; count: number }) => void;
      onResetSpellSlotOverride?: (d: { rank: number }) => void;
   } = $props();

   const SPELL_BENCHMARK_LABELS: SpellBenchmarkLabel[] = ['moderate', 'high', 'extreme'];

   let editingSpellDC = $state(false);
   let editingSpellAttack = $state(false);
   let editSpellDCValue = $state(0);
   let editSpellAttackValue = $state(0);

   const spellcastingEnabled = $derived(creature.benchmarks.spellDC !== undefined);

   const usesSpellSlots = $derived(
      !!creature.benchmarks.spellProgression
         && creature.benchmarks.spellProgression !== 'none'
         && creature.benchmarks.spellProgression !== 'innate'
   );

   // Non-overridden (calculated) slot layout for this progression/level/font.
   // Used to compute reset values and detect which ranks are overridden.
   const calculatedSlots = $derived(
      usesSpellSlots
         ? getSpellSlots(creature.benchmarks.spellProgression!, creature.level, creature.benchmarks.spellFont)
         : undefined
   );

   const slotOverrides = $derived(creature.benchmarks.spellSlotOverrides);

   const maxRank = $derived(
      getMaxSpellRankForProgression(creature.benchmarks.spellProgression, creature.level)
   );

   const slotEntries = $derived.by(() => {
      const ranks = new Set<number>([
         ...Object.keys(calculatedSlots ?? {}).map(Number),
         ...Object.keys(slotOverrides ?? {}).map(Number)
      ]);
      return [...ranks]
         .map((rank) => {
            const calculated = calculatedSlots?.[rank] ?? 0;
            const override = slotOverrides?.[rank];
            const count = override !== undefined ? override : calculated;
            return {
               rank,
               count,
               calculated,
               overridden: override !== undefined,
               exceedsLevel: rank > 0 && rank > maxRank
            };
         })
         // A count of 0 is how a removed rank is stored, so it drops out of the list entirely.
         .filter((entry) => entry.count > 0)
         .sort((a, b) => a.rank - b.rank);
   });

   const availableRanks = $derived.by(() => {
      const present = new Set(slotEntries.map((e) => e.rank));
      const ranks: number[] = [];
      for (let rank = 0; rank <= MAX_SPELL_RANK; rank++) {
         if (!present.has(rank)) ranks.push(rank);
      }
      return ranks;
   });

   const fontSlotCount = $derived(
      creature.benchmarks.spellFont
         ? (creature.level >= 15 ? 6 : creature.level >= 5 ? 5 : 4)
         : 0
   );

   // Font slots are applied to the top non-cantrip rank of the *calculated* layout, so the note stays
   // with that rank. Deriving it from the displayed ranks would migrate it down when the top rank is
   // removed, where the calculated-minus-font breakdown describes nothing.
   const fontRank = $derived.by(() => {
      const ranks = Object.keys(calculatedSlots ?? {}).map(Number).filter((rank) => rank > 0);
      return ranks.length > 0 ? Math.max(...ranks) : 0;
   });

   function toggleSpellcasting(enabled: boolean): void {
      if (enabled) {
         onUpdateBenchmark?.({ path: 'spellDC', value: SPELL_BENCHMARK_VALUES.moderate });
         onUpdateBenchmark?.({ path: 'spellAttack', value: SPELL_BENCHMARK_VALUES.moderate });
      } else {
         onUpdateBenchmark?.({ path: 'spellDC', value: undefined });
         onUpdateBenchmark?.({ path: 'spellAttack', value: undefined });
         onUpdateBenchmark?.({ path: 'spellProgression', value: undefined });
         onUpdateBenchmark?.({ path: 'spellTradition', value: undefined });
         onUpdateBenchmark?.({ path: 'spellFont', value: undefined });
      }
   }

   function startEditSpellDC(): void {
      if (!creature || !computedStats) return;
      editSpellDCValue = computedStats.spellDC ?? 0;
      editingSpellDC = true;
   }

   function commitSpellDCEdit(): void {
      if (!creature) return;
      const ranges = getStatRangesForLevel(creature.level);
      const scalar = spellStatToScalar(editSpellDCValue, ranges.spellDC);
      onUpdateBenchmark?.({ path: 'spellDC', value: scalar });
      editingSpellDC = false;
   }

   function cancelSpellDCEdit(): void {
      editingSpellDC = false;
   }

   function startEditSpellAttack(): void {
      if (!creature || !computedStats) return;
      editSpellAttackValue = computedStats.spellAttack ?? 0;
      editingSpellAttack = true;
   }

   function commitSpellAttackEdit(): void {
      if (!creature) return;
      const ranges = getStatRangesForLevel(creature.level);
      const scalar = spellStatToScalar(editSpellAttackValue, ranges.spellAttack);
      onUpdateBenchmark?.({ path: 'spellAttack', value: scalar });
      editingSpellAttack = false;
   }

   function cancelSpellAttackEdit(): void {
      editingSpellAttack = false;
   }

   function rankLabel(rank: number): string {
      if (rank === 0) return 'Cantrips';
      return `Rank ${rank}`;
   }

   function adjustSlot(rank: number, current: number, delta: number): void {
      const next = Math.max(0, current + delta);
      onSetSpellSlotOverride?.({ rank, count: next });
   }

   function resetSlot(rank: number): void {
      onResetSpellSlotOverride?.({ rank });
   }

   function defaultSlotCount(rank: number): number {
      const calculated = calculatedSlots?.[rank] ?? 0;
      if (calculated > 0) return calculated;
      if (rank === 0) return 5;
      switch (creature.benchmarks.spellProgression) {
         case 'fullPrepared': return 3;
         case 'fullSpontaneous': return 4;
         case 'bounded': return 2;
         default: return 1;
      }
   }

   function removeRank(rank: number): void {
      onSetSpellSlotOverride?.({ rank, count: 0 });
   }

   function addRank(rank: number): void {
      onSetSpellSlotOverride?.({ rank, count: defaultSlotCount(rank) });
   }
</script>

<section class="editor-section">
   <CollapsibleSection label="Spellcasting" {expanded} ontoggle={() => onToggle?.()}>
      {#snippet summary()}
         {#if spellcastingEnabled}
            <span class="sum-stat"><span class="sum-key">DC</span><strong>{computedStats?.spellDC ?? '—'}</strong></span>
            <span class="sum-stat"><span class="sum-key">atk</span><strong>{computedStats?.spellAttack !== undefined ? (computedStats.spellAttack >= 0 ? `+${computedStats.spellAttack}` : computedStats.spellAttack) : '—'}</strong></span>
            {#if creature.benchmarks.spellTradition}<span class="sum-muted">{SPELL_TRADITION_LABELS[creature.benchmarks.spellTradition as keyof typeof SPELL_TRADITION_LABELS]}</span>{/if}
         {:else}
            <span class="sum-muted">none</span>
         {/if}
      {/snippet}
   </CollapsibleSection>
   {#if expanded}
      <div class="section-body">
         <label class="spellcasting-toggle">
            <input
               type="checkbox"
               checked={spellcastingEnabled}
               onchange={(e) => toggleSpellcasting(e.currentTarget.checked)}
            />
            <span>Enable spellcasting</span>
         </label>

         {#if spellcastingEnabled}
            <div class="selectors-grid">
               <div class="selector-field">
                  <label for="spell-type">Casting Type</label>
                  <select
                     id="spell-type"
                     class="cc-select"
                     value={creature.benchmarks.spellProgression || ''}
                     onchange={(e) => {
                        const value = e.currentTarget.value || undefined;
                        onUpdateBenchmark?.({ path: 'spellProgression', value });
                        if (value !== 'fullPrepared' && creature.benchmarks.spellFont) {
                           onUpdateBenchmark?.({ path: 'spellFont', value: undefined });
                        }
                     }}
                  >
                     <option value="">— Select —</option>
                     {#each SPELL_PROGRESSION_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                     {/each}
                  </select>
               </div>

               <div class="selector-field">
                  <label for="spell-tradition">Tradition</label>
                  <select
                     id="spell-tradition"
                     class="cc-select"
                     value={creature.benchmarks.spellTradition || ''}
                     onchange={(e) => {
                        const value = e.currentTarget.value || undefined;
                        onUpdateBenchmark?.({ path: 'spellTradition', value });
                        if (value !== 'divine' && creature.benchmarks.spellFont) {
                           onUpdateBenchmark?.({ path: 'spellFont', value: undefined });
                        }
                     }}
                  >
                     <option value="">— Select —</option>
                     {#each SPELL_TRADITIONS as t}
                        <option value={t}>{SPELL_TRADITION_LABELS[t]}</option>
                     {/each}
                  </select>
               </div>

               <div class="selector-field" class:hidden={!(creature.benchmarks.spellProgression === 'fullPrepared' && creature.benchmarks.spellTradition === 'divine')} aria-hidden={!(creature.benchmarks.spellProgression === 'fullPrepared' && creature.benchmarks.spellTradition === 'divine')}>
                  <label for="spell-font">Divine Font</label>
                  <select
                     id="spell-font"
                     class="cc-select"
                     value={creature.benchmarks.spellFont || ''}
                     tabindex={creature.benchmarks.spellProgression === 'fullPrepared' && creature.benchmarks.spellTradition === 'divine' ? 0 : -1}
                     onchange={(e) => onUpdateBenchmark?.({ path: 'spellFont', value: e.currentTarget.value || undefined })}
                  >
                     {#each SPELL_FONT_OPTIONS as opt}
                        <option value={opt.value}>{opt.label}</option>
                     {/each}
                  </select>
               </div>
            </div>

            <div class="spell-stats-row">
               <div class="spell-stat">
                  <span class="stat-label">Spell DC</span>
                  {#if editingSpellDC}
                     <div class="inline-edit">
                        <input
                           type="number"
                           class="stat-input"
                           bind:value={editSpellDCValue}
                           onkeydown={(e) => {
                              if (e.key === 'Enter') commitSpellDCEdit();
                              if (e.key === 'Escape') cancelSpellDCEdit();
                           }}
                        />
                        <button class="edit-ok" aria-label="Confirm" title="Confirm" onclick={commitSpellDCEdit}><i class="fas fa-check"></i></button>
                        <button class="edit-cancel" aria-label="Cancel" title="Cancel" onclick={cancelSpellDCEdit}><i class="fas fa-times"></i></button>
                     </div>
                  {:else}
                     <button class="stat-value editable" onclick={startEditSpellDC}>{computedStats?.spellDC ?? '—'}</button>
                  {/if}
                  <BenchmarkButtons
                     value={creature.benchmarks.spellDC ?? 0}
                     benchmarks={SPELL_BENCHMARK_LABELS}
                     useSpellBenchmark={true}
                     compact={true}
                     onselect={(d) => onUpdateBenchmark?.({ path: 'spellDC', value: d.value })}
                  />
               </div>

               <div class="spell-stat">
                  <span class="stat-label">Spell Attack</span>
                  {#if editingSpellAttack}
                     <div class="inline-edit">
                        <input
                           type="number"
                           class="stat-input"
                           bind:value={editSpellAttackValue}
                           onkeydown={(e) => {
                              if (e.key === 'Enter') commitSpellAttackEdit();
                              if (e.key === 'Escape') cancelSpellAttackEdit();
                           }}
                        />
                        <button class="edit-ok" aria-label="Confirm" title="Confirm" onclick={commitSpellAttackEdit}><i class="fas fa-check"></i></button>
                        <button class="edit-cancel" aria-label="Cancel" title="Cancel" onclick={cancelSpellAttackEdit}><i class="fas fa-times"></i></button>
                     </div>
                  {:else}
                     <button class="stat-value editable" onclick={startEditSpellAttack}>{computedStats?.spellAttack !== undefined ? (computedStats.spellAttack >= 0 ? '+' : '') + computedStats.spellAttack : '—'}</button>
                  {/if}
                  <BenchmarkButtons
                     value={creature.benchmarks.spellAttack ?? 0}
                     benchmarks={SPELL_BENCHMARK_LABELS}
                     useSpellBenchmark={true}
                     compact={true}
                     onselect={(d) => onUpdateBenchmark?.({ path: 'spellAttack', value: d.value })}
                  />
               </div>
            </div>

            {#if usesSpellSlots}
               <div class="slots-breakdown">
                  <div class="slots-header">Spell Slots by Rank</div>
                  {#if slotEntries.length > 0}
                     <div class="slots-table">
                        {#each slotEntries as entry (entry.rank)}
                           <div class="slot-row" class:exceeds-level={entry.exceedsLevel}>
                              {#if entry.exceedsLevel}
                                 <i
                                    class="fas fa-triangle-exclamation slot-warning"
                                    title={`Rank ${entry.rank} is above rank ${maxRank}, the highest a level ${creature.level} caster normally reaches`}
                                 ></i>
                              {/if}
                              <span class="slot-rank">{rankLabel(entry.rank)}</span>
                              <div class="slot-controls">
                                 <button
                                    type="button"
                                    class="slot-btn"
                                    aria-label="Decrease"
                                    title="Decrease"
                                    disabled={entry.count <= 0}
                                    onclick={() => adjustSlot(entry.rank, entry.count, -1)}
                                 ><i class="fas fa-minus"></i></button>
                                 <span class="slot-count" class:overridden={entry.overridden}>{entry.count}</span>
                                 <button
                                    type="button"
                                    class="slot-btn"
                                    aria-label="Increase"
                                    title="Increase"
                                    onclick={() => adjustSlot(entry.rank, entry.count, 1)}
                                 ><i class="fas fa-plus"></i></button>
                                 <button
                                    type="button"
                                    class="slot-btn slot-reset"
                                    aria-label={`Reset to ${entry.calculated}`}
                                    title={`Reset to ${entry.calculated}`}
                                    disabled={!entry.overridden}
                                    onclick={() => resetSlot(entry.rank)}
                                 ><i class="fas fa-rotate-left"></i></button>
                                 <button
                                    type="button"
                                    class="slot-btn"
                                    aria-label={entry.rank === 0 ? 'Remove cantrips' : 'Remove rank'}
                                    title={entry.rank === 0 ? 'Remove cantrips' : 'Remove rank'}
                                    onclick={() => removeRank(entry.rank)}
                                 ><i class="fas fa-xmark"></i></button>
                              </div>
                              {#if entry.rank === fontRank && !entry.overridden && fontSlotCount > 0 && creature.benchmarks.spellFont}
                                 <span class="slot-note">({entry.calculated - fontSlotCount} + {fontSlotCount} {creature.benchmarks.spellFont} font)</span>
                              {/if}
                           </div>
                        {/each}
                     </div>
                  {:else}
                     <div class="slots-empty">No spell slots at this level.</div>
                  {/if}

                  {#if availableRanks.length > 0}
                     <div class="add-rank">
                        <select
                           class="cc-select"
                           aria-label="Add spell rank"
                           value=""
                           onchange={(e) => {
                              const value = e.currentTarget.value;
                              if (!value) return;
                              e.currentTarget.value = '';
                              addRank(Number(value));
                           }}
                        >
                           <option value="" disabled>+ Add rank</option>
                           {#each availableRanks as rank (rank)}
                              <option value={rank}>{rankLabel(rank)}</option>
                           {/each}
                        </select>
                     </div>
                  {/if}
               </div>
            {/if}
         {/if}
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

   .spellcasting-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-primary);
      cursor: pointer;

      input[type="checkbox"] {
         width: 1rem;
         height: 1rem;
         cursor: pointer;
      }
   }

   .selectors-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-12);
      padding-left: var(--space-24);
   }

   .selector-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);

      label {
         font-size: var(--font-xs);
         font-weight: var(--font-weight-semibold);
         color: var(--text-muted);
      }

      .cc-select {
         width: 100%;
      }

      &.hidden {
         visibility: hidden;
      }
   }

   .spell-stats-row {
      display: flex;
      gap: var(--space-24);
      padding-left: var(--space-24);
      flex-wrap: wrap;
   }

   .spell-stat {
      display: flex;
      align-items: center;
      gap: var(--space-8);

      .stat-label {
         font-size: var(--font-sm);
         font-weight: var(--font-weight-medium);
         color: var(--text-secondary);
         min-width: 5rem;
      }

      .stat-value {
         font-size: var(--font-md);
         font-weight: var(--font-weight-bold);
         font-variant-numeric: tabular-nums;
         color: var(--text-primary);
         min-width: 2.5rem;
         text-align: center;

         &.editable {
            background: var(--surface-lowest);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            padding: var(--space-4) var(--space-8);
            cursor: pointer;

            &:hover {
               border-color: var(--color-primary);
            }
         }
      }

      .inline-edit {
         display: flex;
         align-items: center;
         gap: var(--space-4);

         .stat-input {
            width: 3.5rem;
            padding: var(--space-4) var(--space-6);
            background: var(--surface-lowest);
            border: 1px solid var(--color-primary);
            border-radius: var(--radius-md);
            font-size: var(--font-md);
            font-weight: var(--font-weight-bold);
            color: var(--text-primary);
            text-align: center;

            &:focus {
               outline: none;
               box-shadow: 0 0 0 2px var(--color-primary-alpha);
            }
         }

         .edit-ok, .edit-cancel {
            width: 1.5rem;
            height: 1.5rem;
            border: none;
            border-radius: var(--radius-sm);
            background: var(--surface-low);
            color: var(--text-secondary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-xs);

            &:hover {
               background: var(--hover);
               color: var(--text-primary);
            }
         }

         .edit-ok:hover {
            background: var(--surface-success-low);
            color: var(--text-success);
         }

         .edit-cancel:hover {
            background: var(--surface-danger-low);
            color: var(--text-danger);
         }
      }
   }

   .slots-breakdown {
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
      padding-left: var(--space-24);
   }

   .slots-header {
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--text-muted);
   }

   .slots-table {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-8) var(--space-12);
      max-width: 28rem;
   }

   .slot-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-12);
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-sm);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);

      &:not(:last-child) {
         border-bottom: 1px solid var(--border-subtle);
      }

      &.exceeds-level {
         border-color: var(--border-warning);
         background: var(--surface-warning-lower);
      }
   }

   .slot-warning {
      color: var(--text-warning);
      margin-right: var(--space-4);
   }

   .slot-rank {
      font-weight: var(--font-weight-semibold);
      color: var(--text-secondary);
      min-width: 5rem;
   }

   .slot-controls {
      display: flex;
      align-items: center;
      gap: var(--space-4);
   }

   .slot-count {
      font-weight: var(--font-weight-bold);
      color: var(--text-primary);
      min-width: 2rem;
      text-align: center;
      font-variant-numeric: tabular-nums;

      &.overridden {
         color: var(--color-primary);
      }
   }

   .slot-btn {
      width: 1.5rem;
      height: 1.5rem;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      background: var(--surface-low);
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-xs);
      padding: 0;

      &:hover:not(:disabled) {
         background: var(--hover);
         color: var(--text-primary);
         border-color: var(--color-primary);
      }

      &:disabled {
         opacity: 0.4;
         cursor: not-allowed;
      }
   }

   .slot-reset {
      margin-left: var(--space-4);
   }

   .slot-note {
      font-size: var(--font-xs);
      color: var(--text-muted);
      font-style: italic;
   }

   .slots-empty {
      font-size: var(--font-sm);
      color: var(--text-muted);
      font-style: italic;
   }

   .add-rank {
      display: flex;
      align-items: center;

      .cc-select {
         width: auto;
         min-width: 9rem;
         font-size: var(--font-xs);
         color: var(--text-secondary);
      }
   }
</style>
