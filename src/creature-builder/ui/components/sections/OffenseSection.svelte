<script lang="ts">
   import type { EditableCreature, CreatureStrike, CreatureStats } from '@/creature-builder/editor';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import { damageToBenchmark } from '@/creature-builder/services';
   import { getStatRangesForLevel, statToScalar4, getStrikeDamageForScalar } from '@/creature-builder/config/creatureStatTables';
   import {
      DAMAGE_TYPES,
      DICE_SIZES,
      parseDiceFormula,
      calculateAverageDamage,
      computeStrikeStats,
      getStrikeDamageBenchmarkInfo,
      formatDamageAverageDisplay,
      getStrikeDamageBenchmarkAverages,
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

   function getStrikeDamageBenchmarkInfoLocal(index: number) {
      if (!creature) return null;
      const strike = creature.strikes[index];
      if (!strike) return null;

      const editingAvg = editingStrikeIndex === index
         ? calculateAverageDamage(diceCount, diceSize, diceBonus)
         : undefined;

      return getStrikeDamageBenchmarkInfo(creature.level, strike, editingAvg);
   }
</script>

<section class="editor-section">
   <CollapsibleSection label="Offense" {expanded} ontoggle={() => onToggle?.()} />
   {#if expanded}
      <div class="section-body">
         <div class="attacks-editor">
            <div class="attacks-header">
               <span>Attacks</span>
               <button class="add-attack-btn" onclick={() => onAddStrike?.()}>
                  <i class="fas fa-plus"></i> Add Attack
               </button>
            </div>

            {#each creature.strikes as strike, index}
               {@const computedStrike = getComputedStrikeStatsLocal(strike)}
               {@const damageBenchmarkInfo = getStrikeDamageBenchmarkInfoLocal(index)}
               {@const benchmarkAvgs = getStrikeDamageBenchmarkAverages(creature.level)}
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
                     {#if creature.strikes.length > 1}
                        <button class="remove-attack-btn" aria-label="Remove attack" title="Remove attack" onclick={() => onRemoveStrike?.(index)}>
                           <i class="fas fa-trash"></i>
                        </button>
                     {/if}
                  </div>

                  <div class="attack-stats-row">
                     <div class="attack-stat strike-stat">
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

                     <div class="attack-stat damage-stat">
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
                        <div class="benchmark-with-averages">
                           <span class="avg-label">AVG</span>
                           <div class="benchmark-column">
                              <BenchmarkButtons
                                 value={strike.damageBenchmark}
                                 benchmarks={BENCHMARK_LABELS_4}
                                 use4Benchmark={true}
                                 compact={true}
                                 onselect={(d) => selectStrikeDamageBenchmark(index, d.value)}
                              />
                              <div class="benchmark-values">
                                 <span class="avg-value">{benchmarkAvgs.low}</span>
                                 <span class="avg-value">{benchmarkAvgs.moderate}</span>
                                 <span class="avg-value">{benchmarkAvgs.high}</span>
                                 <span class="avg-value">{benchmarkAvgs.extreme}</span>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div class="attack-stat persistent-stat">
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
               </div>
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

   /* Attacks Editor */
   .attacks-editor {
      .attacks-header {
         display: flex;
         align-items: center;
         justify-content: space-between;
         margin-bottom: var(--space-12);

         span {
            font-size: var(--font-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-secondary);
         }
      }

      .add-attack-btn {
         display: flex;
         align-items: center;
         gap: var(--space-6);
         padding: var(--space-6) var(--space-12);
         background: var(--surface-lowest);
         border: 1px solid var(--border-medium);
         border-radius: var(--radius-md);
         color: var(--text-secondary);
         font-size: var(--font-sm);
         cursor: pointer;
         transition: all var(--transition-fast);

         &:hover {
            background: var(--surface-primary-low);
            border-color: var(--color-primary);
            color: var(--text-primary);
         }

         i {
            font-size: var(--font-xs);
         }
      }
   }

   .attack-group {
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-10);
      margin-bottom: var(--space-8);

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

      .remove-attack-btn {
         width: 1.75rem;
         height: 1.75rem;
         border: 1px solid var(--border-medium);
         border-radius: var(--radius-sm);
         background: var(--surface-lowest);
         color: var(--text-muted);
         cursor: pointer;
         display: flex;
         align-items: center;
         justify-content: center;
         font-size: var(--font-xs);
         transition: all var(--transition-fast);

         &:hover {
            background: var(--surface-danger-low);
            border-color: var(--border-danger-subtle);
            color: var(--text-danger);
         }
      }
   }

   /* Compact Attack Stats Row */
   .attack-stats-row {
      display: flex;
      gap: var(--space-12);
      align-items: flex-start;
   }

   .attack-stat {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);

      .stat-label {
         font-size: var(--font-xs);
         font-weight: var(--font-weight-semibold);
         color: var(--text-muted);
         text-transform: uppercase;
      }

      .stat-value {
         font-size: var(--font-md);
         font-weight: var(--font-weight-bold);
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
            font-weight: var(--font-weight-normal);
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
   }

   .strike-stat {
      min-width: 7rem;
   }

   .damage-stat {
      flex: 1;
      min-width: 10rem;
   }

   .benchmark-with-averages {
      display: flex;
      align-items: flex-end;
      gap: var(--space-6);
   }

   .benchmark-column {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
   }

   .benchmark-values {
      display: flex;
      gap: var(--space-2);
   }

   .avg-label {
      font-size: var(--font-xs);
      color: var(--text-muted);
      font-weight: var(--font-weight-semibold);
      line-height: 1;
      padding-bottom: var(--space-2);
   }

   .avg-value {
      width: 2.25rem;
      text-align: center;
      font-size: var(--font-xs);
      color: var(--text-muted);
   }

   .persistent-stat {
      min-width: 9rem;
      border-left: 1px solid var(--border-subtle);
      padding-left: var(--space-12);
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
      text-transform: uppercase;

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
      margin-top: var(--space-4);
   }

   .persistent-formula-compact {
      width: 3.5rem;
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-bold);
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
