<script lang="ts">
   import type { EditableCreature, CreatureStrike, CreatureStats } from '@/creature-builder/editor';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import { damageToBenchmark } from '@/creature-builder/logic/abilityScaling';
   import { getStatRangesForLevel, statToScalar4, getStrikeDamageForScalar } from '@/creature-builder/logic/creatureStatTables';
   import {
      DAMAGE_TYPES,
      DICE_SIZES,
      parseDiceFormula,
      calculateAverageDamage,
      computeStrikeStats,
      formatDamageAverageDisplay,
      persistentFormulaToScalar,
      PERSISTENT_BENCHMARK_VALUES,
      type DiceSize
   } from '@/creature-builder/editor/creatureEditorUtils';

   let {
      creature,
      computedStats,
      expanded,
      onToggle,
      onUpdateBenchmark,
      onAddStrike,
      onRemoveStrike,
      onUpdateStrike,
      onUpdateStrikeAttackBenchmark,
      onUpdateStrikeDamageBenchmark,
      onUpdateStrikePersistentBenchmark,
      onUpdateStrikePersistentType,
      onClearStrikePersistent
   }: {
      creature: EditableCreature;
      computedStats: CreatureStats | null;
      expanded: boolean;
      onToggle?: () => void;
      onUpdateBenchmark?: (d: { path: string; value: number }) => void;
      onAddStrike?: () => void;
      onRemoveStrike?: (index: number) => void;
      onUpdateStrike?: (d: { index: number; updates: Partial<CreatureStrike> }) => void;
      onUpdateStrikeAttackBenchmark?: (d: { index: number; benchmark: number }) => void;
      onUpdateStrikeDamageBenchmark?: (d: { index: number; benchmark: number }) => void;
      onUpdateStrikePersistentBenchmark?: (d: { index: number; benchmark: number }) => void;
      onUpdateStrikePersistentType?: (d: { index: number; type: string }) => void;
      onClearStrikePersistent?: (index: number) => void;
   } = $props();

   const BENCHMARK_LABELS_4: ('low' | 'moderate' | 'high' | 'extreme')[] = ['low', 'moderate', 'high', 'extreme'];

   let editingStrikeIndex = $state<number | null>(null);
   let diceCount = $state(1);
   let diceSize = $state<DiceSize>(8);
   let diceBonus = $state(0);

   // While the dice editor is open the tier highlight tracks the live dice average, not the
   // last-committed benchmark — so typing 2d8 vs 1d8 moves the active tier as you go.
   const liveDamageBenchmark = $derived(
      creature ? damageToBenchmark(calculateAverageDamage(diceCount, diceSize, diceBonus), creature.level) : 0
   );

   let editingStrikeAttackIndex = $state<number | null>(null);
   let editStrikeAttackValue = $state(0);

   function getComputedStrikeStatsLocal(strike: CreatureStrike) {
      if (!creature || !strike) return { attackBonus: 0, damage: '', damageAverage: 0, combinedDamageAverage: 0, effectiveDamageAverage: 0, persistentAverage: 0, persistentDamage: '' };
      return computeStrikeStats(creature.level, strike);
   }

   function startStrikeDiceEdit(index: number): void {
      if (!creature) return;
      const strike = creature.strikes[index];
      if (!strike) return;

      const computedStrike = getComputedStrikeStatsLocal(strike);
      const currentFormula = strike.customDamageFormula || computedStrike.damage;
      const parsed = parseDiceFormula(currentFormula);
      diceCount = parsed.count;
      diceSize = parsed.size;
      diceBonus = parsed.bonus;
      editingStrikeIndex = index;
   }

   function commitStrikeDiceEdit(): void {
      if (!creature || editingStrikeIndex === null) return;

      const avgDamage = calculateAverageDamage(diceCount, diceSize, diceBonus);
      const benchmark = damageToBenchmark(avgDamage, creature.level);

      onUpdateStrikeDamageBenchmark?.({ index: editingStrikeIndex, benchmark });
      editingStrikeIndex = null;
   }

   function selectStrikeDamageBenchmark(index: number, benchmarkValue: number): void {
      if (!creature) return;

      onUpdateStrikeDamageBenchmark?.({ index, benchmark: benchmarkValue });

      if (editingStrikeIndex === index) {
         const ranges = getStatRangesForLevel(creature.level);
         const entry = getStrikeDamageForScalar(benchmarkValue, ranges.strikeDamage);
         const parsed = parseDiceFormula(entry.formula);
         diceCount = parsed.count;
         diceSize = parsed.size;
         diceBonus = parsed.bonus;
      }
   }

   function cancelStrikeDiceEdit(): void {
      editingStrikeIndex = null;
   }

   function startEditStrikeAttack(index: number): void {
      if (!creature) return;
      const strike = creature.strikes[index];
      if (!strike) return;
      const computed = getComputedStrikeStatsLocal(strike);
      editStrikeAttackValue = computed.attackBonus;
      editingStrikeAttackIndex = index;
   }

   function commitStrikeAttackEdit(): void {
      if (!creature || editingStrikeAttackIndex === null) return;
      const ranges = getStatRangesForLevel(creature.level);
      const scalar = statToScalar4(editStrikeAttackValue, ranges.strikeAttack);
      onUpdateStrikeAttackBenchmark?.({ index: editingStrikeAttackIndex, benchmark: scalar });
      editingStrikeAttackIndex = null;
   }

   function cancelStrikeAttackEdit(): void {
      editingStrikeAttackIndex = null;
   }

   // Two-step delete so a stray click can't destroy an attack.
   let pendingDeleteIndex = $state<number | null>(null);

   function requestRemoveStrike(index: number): void {
      pendingDeleteIndex = index;
   }

   function cancelRemoveStrike(): void {
      pendingDeleteIndex = null;
   }

   function confirmRemoveStrike(index: number): void {
      pendingDeleteIndex = null;
      onRemoveStrike?.(index);
   }
</script>

<section class="editor-section">
   <CollapsibleSection
      label="Offense"
      {expanded}
      ontoggle={() => onToggle?.()}
      addLabel="Add Attack"
      addTitle="Add an attack"
      onAdd={() => onAddStrike?.()}
   >
      {#snippet summary()}
         {#if creature.strikes.length}
            {#each creature.strikes.slice(0, 3) as strike, i (i)}
               {@const cs = computeStrikeStats(creature.level, strike)}
               <span class="sum-stat">{strike.name || 'Attack'} <strong>{cs.attackBonus >= 0 ? '+' : ''}{cs.attackBonus}</strong></span>
            {/each}{#if creature.strikes.length > 3}<span class="sum-muted">+{creature.strikes.length - 3} more</span>{/if}
         {:else}
            <span class="sum-muted">no attacks</span>
         {/if}
      {/snippet}
   </CollapsibleSection>
   {#if expanded}
      <div class="section-body">
         <div class="attacks-editor">
            <div class="attacks-header">
               <span>Attacks</span>
            </div>

            <div class="attacks-list">
               {#each creature.strikes as strike, index}
                  {@const computedStrike = getComputedStrikeStatsLocal(strike)}
                  <div class="attack-group">
                     <div class="attack-header">
                        <input
                           type="text"
                           class="cc-input attack-name"
                           value={strike.name}
                           oninput={(e) => onUpdateStrike?.({ index, updates: { name: e.currentTarget.value } })}
                           placeholder="Attack Name"
                        />
                        <select
                           class="cc-select damage-type-select"
                           value={strike.damageType}
                           onchange={(e) => onUpdateStrike?.({ index, updates: { damageType: e.currentTarget.value } })}
                        >
                           {#each DAMAGE_TYPES as dt}
                              <option value={dt}>{dt}</option>
                           {/each}
                        </select>
                     </div>

                     <div class="attack-stats">
                        <div class="stat-line">
                           <span class="stat-label">Strike</span>
                           {#if editingStrikeAttackIndex === index}
                              <div class="inline-edit">
                                 <input
                                    type="number"
                                    class="stat-input"
                                    bind:value={editStrikeAttackValue}
                                    onkeydown={(e) => {
                                       if (e.key === 'Enter') commitStrikeAttackEdit();
                                       if (e.key === 'Escape') cancelStrikeAttackEdit();
                                    }}
                                 />
                                 <button class="edit-ok" aria-label="Confirm" title="Confirm" onclick={(e) => { e.stopPropagation(); commitStrikeAttackEdit(); }}><i class="fas fa-check"></i></button>
                                 <button class="edit-cancel" aria-label="Cancel" title="Cancel" onclick={(e) => { e.stopPropagation(); cancelStrikeAttackEdit(); }}><i class="fas fa-times"></i></button>
                              </div>
                           {:else}
                              <button class="stat-value editable" onclick={() => startEditStrikeAttack(index)}>{computedStrike.attackBonus >= 0 ? '+' : ''}{computedStrike.attackBonus}</button>
                           {/if}
                           <BenchmarkButtons
                              value={strike.attackBenchmark}
                              benchmarks={BENCHMARK_LABELS_4}
                              use4Benchmark={true}
                              compact={true}
                              onselect={(d) => onUpdateStrikeAttackBenchmark?.({ index, benchmark: d.value })}
                           />
                        </div>

                        <div class="stat-line">
                           <span class="stat-label">Damage</span>
                           {#if editingStrikeIndex === index}
                              <div class="dice-editor-inline">
                                 <input type="number" class="dice-input" bind:value={diceCount} min="1" max="10" />
                                 <select class="cc-select dice-select" bind:value={diceSize}>
                                    {#each DICE_SIZES as s}<option value={s}>d{s}</option>{/each}
                                 </select>
                                 <input type="number" class="dice-input bonus" bind:value={diceBonus} />
                                 <span class="dice-avg">({formatDamageAverageDisplay(calculateAverageDamage(diceCount, diceSize, diceBonus), computedStrike.persistentAverage)})</span>
                                 <button class="dice-ok" aria-label="Confirm" title="Confirm" onclick={(e) => { e.stopPropagation(); commitStrikeDiceEdit(); }}><i class="fas fa-check"></i></button>
                                 <button class="dice-cancel" aria-label="Cancel" title="Cancel" onclick={(e) => { e.stopPropagation(); cancelStrikeDiceEdit(); }}><i class="fas fa-times"></i></button>
                              </div>
                           {:else}
                              <button class="stat-value clickable" onclick={() => startStrikeDiceEdit(index)}>
                                 {computedStrike.damage}
                                 <span class="avg">({formatDamageAverageDisplay(computedStrike.damageAverage, computedStrike.persistentAverage)})</span>
                              </button>
                           {/if}
                           <div class="damage-tiers" class:editing={editingStrikeIndex === index}>
                              <BenchmarkButtons
                                 value={editingStrikeIndex === index ? liveDamageBenchmark : strike.damageBenchmark}
                                 benchmarks={BENCHMARK_LABELS_4}
                                 use4Benchmark={true}
                                 compact={true}
                                 onselect={(d) => selectStrikeDamageBenchmark(index, d.value)}
                                 onedit={editingStrikeIndex === index ? undefined : () => startStrikeDiceEdit(index)}
                              />
                           </div>
                        </div>

                        <div class="stat-line persistent-line">
                           <label class="persistent-toggle-compact">
                              <input
                                 type="checkbox"
                                 checked={strike.persistentBenchmark !== undefined}
                                 onchange={(e) => {
                                    if (e.currentTarget.checked) {
                                       onUpdateStrikePersistentBenchmark?.({ index, benchmark: PERSISTENT_BENCHMARK_VALUES.moderate });
                                       onUpdateStrikePersistentType?.({ index, type: 'fire' });
                                    } else {
                                       onClearStrikePersistent?.(index);
                                    }
                                 }}
                              />
                              <span>Persistent</span>
                           </label>
                           {#if strike.persistentBenchmark !== undefined}
                              <div class="persistent-inline">
                                 <input
                                    type="text"
                                    class="cc-input persistent-formula-compact"
                                    value={computedStrike.persistentDamage || ''}
                                    placeholder="1d6"
                                    onchange={(e) => {
                                       const benchmark = persistentFormulaToScalar(e.currentTarget.value, creature.level);
                                       onUpdateStrikePersistentBenchmark?.({ index, benchmark });
                                    }}
                                 />
                                 <select
                                    class="cc-select persistent-type-compact"
                                    value={strike.persistentDamageType || 'fire'}
                                    onchange={(e) => onUpdateStrikePersistentType?.({ index, type: e.currentTarget.value })}
                                 >
                                    {#each DAMAGE_TYPES as dt}
                                       <option value={dt}>{dt}</option>
                                    {/each}
                                 </select>
                                 {#if computedStrike.persistentAverage}
                                    <span class="persistent-avg">({computedStrike.persistentAverage} avg)</span>
                                 {/if}
                              </div>
                           {/if}
                        </div>
                     </div>
                     <div class="attack-footer" class:confirming={pendingDeleteIndex === index}>
                        {#if pendingDeleteIndex === index}
                           <span class="delete-confirm-text">Delete this attack?</span>
                           <button type="button" class="delete-confirm-btn" onclick={() => confirmRemoveStrike(index)}>Delete</button>
                           <button type="button" class="delete-cancel-btn" onclick={cancelRemoveStrike}>Cancel</button>
                        {:else}
                           <button type="button" class="attack-delete-btn" title="Remove attack" onclick={() => requestRemoveStrike(index)}>
                              <i class="fas fa-trash"></i> Delete attack
                           </button>
                        {/if}
                     </div>
                  </div>
               {/each}
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
      gap: var(--space-12);
   }

   /* Attacks Editor */
   .attacks-editor {
      .attacks-header {
         display: flex;
         align-items: center;
         margin-bottom: var(--space-12);

         span {
            font-size: var(--font-md);
            font-weight: var(--font-weight-semibold);
            color: var(--text-secondary);
         }
      }
   }

   /* Attack cards two-up; collapse to one column when the editor gets narrow (responds to
      .editor-body's container width — see CreatureEditor's container-type). */
   .attacks-list {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      /* Gutter equals the section's outer padding (--space-16) so the two attack columns sit in an
         even horizontal rhythm, matching the other two-column sections. */
      gap: var(--space-16);
   }

   @container (max-width: 40rem) {
      .attacks-list {
         grid-template-columns: 1fr;
      }
   }

   .attack-group {
      display: flex;
      flex-direction: column;
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-10);
      overflow: hidden;

      .attack-header {
         display: flex;
         align-items: center;
         gap: var(--space-8);
         margin-bottom: var(--space-8);
      }

      .attack-name {
         flex: 1;
         font-weight: var(--font-weight-semibold);
         padding: var(--space-4) var(--space-8);
      }

      .damage-type-select {
         min-height: auto;
         padding: var(--space-4) var(--space-24) var(--space-4) var(--space-8);
         font-size: var(--font-sm);
         width: auto;
      }

   }

   /* Destructive action is the card's full-width footer — bleeds past the card padding to sit
      flush with the frame (clipped by the card's overflow:hidden), quiet until hovered. A
      background tint (not a divider) separates it. Two-step confirm guards a stray click.
      Mirrors the special-ability card footer. */
   .attack-footer {
      margin: var(--space-10) calc(-1 * var(--space-10)) calc(-1 * var(--space-10));
      display: flex;
      align-items: center;
      gap: var(--space-8);

      &.confirming {
         padding: var(--space-8) var(--space-12);
         background: var(--surface-danger-lowest);
      }
   }

   .attack-delete-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-6);
      width: 100%;
      padding: var(--space-8);
      background: var(--surface-low);
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--font-xs);
      font-weight: var(--font-weight-medium);
      transition: background var(--transition-fast), color var(--transition-fast);

      &:hover {
         background: var(--surface-danger-lowest);
         color: var(--text-danger);
      }
   }

   .delete-confirm-text {
      margin-right: auto;
      font-size: var(--font-sm);
      color: var(--text-secondary);
   }

   .delete-confirm-btn,
   .delete-cancel-btn {
      padding: var(--space-4) var(--space-12);
      border-radius: var(--radius-sm);
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
   }

   .delete-confirm-btn {
      background: var(--surface-danger-low);
      border: 1px solid var(--border-danger);
      color: var(--text-danger);

      &:hover {
         background: var(--surface-danger);
         color: var(--text-primary);
      }
   }

   .delete-cancel-btn {
      background: var(--surface-low);
      border: 1px solid var(--border-default);
      color: var(--text-secondary);

      &:hover {
         background: var(--hover);
         color: var(--text-primary);
      }
   }

   /* Grows to absorb the grid's equal-height stretch so the footer pins to the card's bottom edge
      and footers line up across a two-up row. */
   .attack-stats {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
   }

   /* Strike / Damage / Persistent each read as a tight labelled row inside the card,
      instead of three columns stretched edge-to-edge. */
   .stat-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-4) var(--space-8);
   }

   .stat-label {
      width: 4.25rem;
      flex-shrink: 0;
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--text-muted);
   }

   /* While the dice editor is open the tier buttons drop to their own line and indent past
      the label (width + the row's column-gap) so they sit under the value, not the label. */
   .damage-tiers.editing {
      flex-basis: 100%;
      margin-left: calc(4.25rem + var(--space-8));
   }

   .stat-value {
      font-size: var(--font-md);
      font-weight: var(--font-weight-bold);
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);

      &.clickable {
         cursor: pointer;
         &:hover {
            color: var(--color-primary);
         }
      }

      &.editable {
         background: var(--surface-lowest);
         border: 1px solid var(--border-default);
         border-radius: var(--radius-md);
         padding: var(--space-4) var(--space-8);
         cursor: pointer;
         min-width: 3rem;
         text-align: center;

         &:hover {
            border-color: var(--color-primary);
         }
      }

      .avg {
         font-weight: var(--font-weight-medium);
         font-size: var(--font-sm);
         color: var(--text-muted);
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

   /* Faint divider sets the persistent toggle apart from the strike/damage rows above. */
   .persistent-line {
      margin-top: var(--space-2);
      padding-top: var(--space-8);
      border-top: 1px solid var(--border-faint);
   }

   /* Compact Persistent Damage */
   .persistent-toggle-compact {
      display: flex;
      align-items: center;
      gap: var(--space-6);
      cursor: pointer;
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      color: var(--text-muted);

      input[type="checkbox"] {
         width: 0.875rem;
         height: 0.875rem;
         cursor: pointer;
      }
   }

   .persistent-inline {
      display: flex;
      align-items: center;
      gap: var(--space-6);
   }

   .persistent-formula-compact {
      width: 3.5rem;
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-bold);
      font-variant-numeric: tabular-nums;
      text-align: center;
   }

   .persistent-type-compact {
      min-height: auto;
      padding: var(--space-2) var(--space-16) var(--space-2) var(--space-4);
      font-size: var(--font-xs);
      width: auto;
   }

   .persistent-avg {
      font-size: var(--font-sm);
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
   }

   /* Dice Editor Inline */
   .dice-editor-inline {
      display: flex;
      align-items: center;
      gap: var(--space-4);

      .dice-input {
         width: 2.5rem;
         padding: var(--space-2) var(--space-4);
         text-align: center;
         font-size: var(--font-sm);
         border: 1px solid var(--border-default);
         border-radius: var(--radius-sm);
         background: var(--surface-low);
         color: var(--text-primary);

         &.bonus {
            width: 3rem;
         }
      }

      .dice-select {
         min-height: auto;
         padding: var(--space-2) var(--space-16) var(--space-2) var(--space-4);
         font-size: var(--font-sm);
         width: auto;
      }

      .dice-avg {
         font-size: var(--font-sm);
         font-weight: var(--font-weight-bold);
         color: var(--text-secondary);
         white-space: nowrap;
         font-variant-numeric: tabular-nums;
      }

      .dice-ok, .dice-cancel {
         width: 1.5rem;
         height: 1.5rem;
         border: none;
         border-radius: var(--radius-sm);
         cursor: pointer;
         display: flex;
         align-items: center;
         justify-content: center;
         font-size: var(--font-xs);
      }

      .dice-ok {
         background: var(--color-success);
         color: white;
      }

      .dice-cancel {
         background: var(--surface-high);
         color: var(--text-muted);
      }
   }
</style>
