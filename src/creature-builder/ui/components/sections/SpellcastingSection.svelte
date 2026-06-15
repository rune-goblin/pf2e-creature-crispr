<script lang="ts">
   import type { EditableCreature, CreatureStats } from '@/creature-builder/editor';
   import { SPELL_BENCHMARK_VALUES, SPELL_TRADITIONS, type SpellBenchmarkLabel } from '@/creature-builder/models';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import { getStatRangesForLevel, spellStatToScalar } from '@/creature-builder/config/creatureStatTables';
   import { getSpellSlots } from '@/creature-builder/config/spellSlotTables';
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

   // Non-overridden (calculated) slot layout for this progression/level/font.
   // Used to compute reset values and detect which ranks are overridden.
   const calculatedSlots = $derived(
      creature.benchmarks.spellProgression
            && creature.benchmarks.spellProgression !== 'none'
            && creature.benchmarks.spellProgression !== 'innate'
         ? getSpellSlots(creature.benchmarks.spellProgression, creature.level, creature.benchmarks.spellFont)
         : undefined
   );

   const slotOverrides = $derived(creature.benchmarks.spellSlotOverrides);

   // Iterate the calculated layout so ranks with overridden values of 0 still render
   // (otherwise the user loses the ability to bump them back up). Ranks absent from
   // the calculated layout cannot be overridden.
   const slotEntries = $derived.by(() =>
      calculatedSlots
         ? Object.entries(calculatedSlots)
              .map(([rankStr, calculated]) => {
                 const rank = Number(rankStr);
                 const override = slotOverrides?.[rank];
                 const count = override !== undefined ? override : calculated;
                 return { rank, count, calculated, overridden: override !== undefined };
              })
              .sort((a, b) => a.rank - b.rank)
         : []
   );

   const fontSlotCount = $derived(
      creature.benchmarks.spellFont
         ? (creature.level >= 15 ? 6 : creature.level >= 5 ? 5 : 4)
         : 0
   );

   const fontRank = $derived(
      slotEntries.length > 0
         ? Math.max(...slotEntries.filter(e => e.rank > 0).map(e => e.rank))
         : 0
   );

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
</script>

<section class="editor-section">
   <CollapsibleSection label="Spellcasting" {expanded} ontoggle={() => onToggle?.()} />
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
                     class="rm-select"
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
                     class="rm-select"
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
                     class="rm-select"
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

            {#if slotEntries.length > 0}
               <div class="slots-breakdown">
                  <div class="slots-header">Spell Slots by Rank</div>
                  <div class="slots-table">
                     {#each slotEntries as entry}
                        <div class="slot-row">
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
                           </div>
                           {#if entry.rank === fontRank && fontSlotCount > 0 && creature.benchmarks.spellFont}
                              <span class="slot-note">({entry.calculated - fontSlotCount} + {fontSlotCount} {creature.benchmarks.spellFont} font)</span>
                           {/if}
                        </div>
                     {/each}
                  </div>
               </div>
            {:else if creature.benchmarks.spellProgression && creature.benchmarks.spellProgression !== 'innate' && creature.benchmarks.spellProgression !== 'none'}
               <div class="slots-empty">No spell slots at this level.</div>
            {/if}
         {/if}
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
         text-transform: uppercase;
      }

      .rm-select {
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
      text-transform: uppercase;
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
      padding: var(--space-2) 0;
      font-size: var(--font-sm);

      &:not(:last-child) {
         border-bottom: 1px solid var(--border-subtle);
      }
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
      padding-left: var(--space-24);
   }
</style>
