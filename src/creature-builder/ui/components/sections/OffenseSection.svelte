<script lang="ts">
   import type { EditableCreature, CreatureStrike, CreatureStats } from '@/creature-builder/editor';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import DeleteBaseboard from '../widgets/DeleteBaseboard.svelte';
   import EffectiveDamageBar from '../widgets/EffectiveDamageBar.svelte';
   import { getDamageTypeGroups } from '@/creature-builder/ui/vocab';
   import { formatDiceFormula, parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
   import { getStatRangesForLevel, statToScalar4 } from '@/creature-builder/logic/creatureStatTables';
   import { resolveStrikeDamage, strikeDamageScalar, isDirectPart } from '@/creature-builder/logic/strikeDamage';
   import type { StrikeDamageCategory, StrikeDamagePart } from '@/creature-builder/logic/models';
   import {
      DICE_SIZES,
      parseDiceFormula,
      calculateAverageDamage,
      computeStrikeStats,
      formatDamageAverageDisplay,
      getStrikeEffectiveDamageBar,
      type DiceSize
   } from '@/creature-builder/editor/creatureEditorUtils';

   // The main roll excludes bleed (persistent-only); extra damage offers it.
   const damageTypeGroups = getDamageTypeGroups();
   const extraTypeGroups = getDamageTypeGroups({ includeBleed: true });
   const CATEGORIES: { value: StrikeDamageCategory | ''; key: string }[] = [
      { value: '', key: 'direct' },
      { value: 'persistent', key: 'persistent' },
      { value: 'splash', key: 'splash' },
      { value: 'precision', key: 'precision' }
   ];

   let {
      creature,
      computedStats,
      expanded,
      highlightDrop = false,
      onToggle,
      onUpdateBenchmark,
      onAddStrike,
      onRemoveStrike,
      onUpdateStrike,
      onUpdateStrikeAttackBenchmark,
      onUpdateStrikeDamageBenchmark,
      onSetStrikeMainDamage,
      onAddStrikeDamagePart,
      onUpdateStrikeDamagePart,
      onRemoveStrikeDamagePart
   }: {
      creature: EditableCreature;
      computedStats: CreatureStats | null;
      expanded: boolean;
      /** True while a drag hovers the editor and this section is the detected destination. */
      highlightDrop?: boolean;
      onToggle?: () => void;
      onUpdateBenchmark?: (d: { path: string; value: number }) => void;
      onAddStrike?: () => void;
      onRemoveStrike?: (index: number) => void;
      onUpdateStrike?: (d: { index: number; updates: Partial<CreatureStrike> }) => void;
      onUpdateStrikeAttackBenchmark?: (d: { index: number; benchmark: number }) => void;
      onUpdateStrikeDamageBenchmark?: (d: { index: number; benchmark: number }) => void;
      onSetStrikeMainDamage?: (d: { index: number; formula: string }) => void;
      onAddStrikeDamagePart?: (d: { index: number; part: Omit<StrikeDamagePart, 'baseLevel' | 'rollKey'> }) => void;
      onUpdateStrikeDamagePart?: (d: {
         index: number;
         partIndex: number;
         updates: Partial<Pick<StrikeDamagePart, 'formula' | 'damageType' | 'category'>>;
      }) => void;
      onRemoveStrikeDamagePart?: (d: { index: number; partIndex: number }) => void;
   } = $props();

   const BENCHMARK_LABELS_4: ('low' | 'moderate' | 'high' | 'extreme')[] = ['low', 'moderate', 'high', 'extreme'];

   let editingStrikeIndex = $state<number | null>(null);
   let diceCount = $state(1);
   let diceSize = $state<DiceSize>(8);
   let diceBonus = $state(0);

   // While the dice editor is open the tier highlight tracks the live dice average plus the strike's
   // direct extra damage, not the last-committed benchmark — so typing 2d8 vs 1d8 moves the tier as you go.
   const liveDamageBenchmark = $derived.by(() => {
      const strike = editingStrikeIndex === null ? undefined : creature?.strikes[editingStrikeIndex];
      if (!creature || !strike) return 0;
      const extras = resolveStrikeDamage(strike, creature.level).parts
         .filter(isDirectPart)
         .reduce((sum, p) => sum + p.average, 0);
      return strikeDamageScalar(calculateAverageDamage(diceCount, diceSize, diceBonus) + extras, creature.level);
   });

   let editingStrikeAttackIndex = $state<number | null>(null);
   let editStrikeAttackValue = $state(0);

   function getComputedStrikeStatsLocal(strike: CreatureStrike) {
      return computeStrikeStats(creature.level, strike);
   }

   function startStrikeDiceEdit(index: number): void {
      if (!creature) return;
      const strike = creature.strikes[index];
      if (!strike) return;

      const parsed = parseDiceFormula(getComputedStrikeStatsLocal(strike).damage || '1d4');
      diceCount = parsed.count;
      diceSize = parsed.size;
      diceBonus = parsed.bonus;
      editingStrikeIndex = index;
   }

   function commitStrikeDiceEdit(): void {
      if (!creature || editingStrikeIndex === null) return;
      onSetStrikeMainDamage?.({ index: editingStrikeIndex, formula: formatDiceFormula(diceCount, diceSize, diceBonus) });
      editingStrikeIndex = null;
   }

   function selectStrikeDamageBenchmark(index: number, benchmarkValue: number): void {
      if (!creature) return;

      onUpdateStrikeDamageBenchmark?.({ index, benchmark: benchmarkValue });

      if (editingStrikeIndex === index) {
         const parsed = parseDiceFormula(getComputedStrikeStatsLocal(creature.strikes[index]).damage || '1d4');
         diceCount = parsed.count;
         diceSize = parsed.size;
         diceBonus = parsed.bonus;
      }
   }

   // A formula that doesn't parse would be written to the item verbatim; revert the field instead.
   function commitPartFormula(index: number, partIndex: number, input: HTMLInputElement, current: string): void {
      const formula = input.value.trim();
      if (parseDiceFormulaAverage(formula) <= 0) {
         input.value = current;
         return;
      }
      if (formula !== current) onUpdateStrikeDamagePart?.({ index, partIndex, updates: { formula } });
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

<section class="editor-section" class:drag-over={highlightDrop}>
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
      <div
         class="section-body"
         class:drag-over={highlightDrop}
         role="group"
         aria-label="Drop a melee attack here to add it"
      >
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
                           {#each damageTypeGroups as group (group.label)}
                              <optgroup label={group.label}>
                                 {#each group.options as opt (opt.value)}
                                    <option value={opt.value}>{opt.label}</option>
                                 {/each}
                              </optgroup>
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
                           <div class="attack-tiers">
                              <BenchmarkButtons
                                 value={strike.attackBenchmark}
                                 benchmarks={BENCHMARK_LABELS_4}
                                 use4Benchmark={true}
                                 compact={true}
                                 onselect={(d) => onUpdateStrikeAttackBenchmark?.({ index, benchmark: d.value })}
                              />
                           </div>
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
                                 {computedStrike.damage || game.i18n.localize('pf2e-creature-crispr.offense.noMainRoll')}
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

                        <div class="ledger">
                           <div class="ledger-row">
                              <span class="ledger-name">{strike.name}</span>
                              <span class="ledger-avg">{computedStrike.mainAverage} avg</span>
                           </div>

                           {#each computedStrike.parts as part, partIndex (partIndex)}
                              <div class="ledger-row">
                                 <input
                                    type="text"
                                    class="cc-input ledger-formula"
                                    value={part.resolved}
                                    placeholder="1d6 or 6"
                                    aria-label={game.i18n.localize('pf2e-creature-crispr.offense.damageFormula')}
                                    onchange={(e) => commitPartFormula(index, partIndex, e.currentTarget, part.resolved)}
                                 />
                                 <select
                                    class="cc-select ledger-select"
                                    value={part.damageType}
                                    aria-label={game.i18n.localize('pf2e-creature-crispr.offense.damageType')}
                                    onchange={(e) => onUpdateStrikeDamagePart?.({ index, partIndex, updates: { damageType: e.currentTarget.value } })}
                                 >
                                    {#each extraTypeGroups as group (group.label)}
                                       <optgroup label={group.label}>
                                          {#each group.options as opt (opt.value)}
                                             <option value={opt.value}>{opt.label}</option>
                                          {/each}
                                       </optgroup>
                                    {/each}
                                 </select>
                                 <select
                                    class="cc-select ledger-select"
                                    value={part.category ?? ''}
                                    aria-label={game.i18n.localize('pf2e-creature-crispr.offense.damageCategory')}
                                    onchange={(e) => onUpdateStrikeDamagePart?.({
                                       index,
                                       partIndex,
                                       updates: { category: (e.currentTarget.value || undefined) as StrikeDamageCategory | undefined }
                                    })}
                                 >
                                    {#each CATEGORIES as category (category.key)}
                                       <option value={category.value}>{game.i18n.localize(`pf2e-creature-crispr.offense.category.${category.key}`)}</option>
                                    {/each}
                                 </select>
                                 <span class="ledger-avg">{part.average} avg</span>
                                 <button
                                    class="ledger-remove"
                                    aria-label={game.i18n.localize('pf2e-creature-crispr.offense.removeDamage')}
                                    title={game.i18n.localize('pf2e-creature-crispr.offense.removeDamage')}
                                    onclick={() => onRemoveStrikeDamagePart?.({ index, partIndex })}
                                 ><i class="fas fa-times"></i></button>
                              </div>
                           {/each}

                           <div class="ledger-row ledger-foot">
                              <button
                                 class="ledger-add"
                                 onclick={() => onAddStrikeDamagePart?.({ index, part: { formula: '1d6', damageType: 'fire' } })}
                              ><i class="fas fa-plus"></i> {game.i18n.localize('pf2e-creature-crispr.offense.addDamage')}</button>
                              {#if computedStrike.parts.length}
                                 <span class="ledger-total">
                                    <span class="total-label">{game.i18n.localize('pf2e-creature-crispr.offense.total')}</span>
                                    {computedStrike.combinedDamageAverage} avg
                                 </span>
                              {/if}
                           </div>
                        </div>

                        <EffectiveDamageBar row={getStrikeEffectiveDamageBar(creature.level, computedStrike.damageAverage, computedStrike.persistentDamage)} />
                     </div>
                     <DeleteBaseboard
                        bleed
                        label="attack"
                        confirming={pendingDeleteIndex === index}
                        onRequest={() => requestRemoveStrike(index)}
                        onConfirm={() => confirmRemoveStrike(index)}
                        onCancel={cancelRemoveStrike}
                     />
                  </div>
               {:else}
                  <p class="attacks-empty">{game.i18n.localize('pf2e-creature-crispr.offense.troopEmpty')}</p>
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
      transition: border-color var(--transition-fast), background var(--transition-fast);

      /* Section-level highlight too: the destination may be collapsed, so .section-body
         (expanded-only) can't carry the cue alone. */
      &.drag-over {
         border-color: var(--color-primary);
         background: color-mix(in srgb, var(--color-primary) 7%, var(--section-body-bg));
      }
   }

   .section-body {
      padding: var(--space-16);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: var(--space-12);
      transition: background var(--transition-fast), outline-color var(--transition-fast);
      outline: 2px dashed transparent;
      outline-offset: -4px;

      &.drag-over {
         outline-color: var(--color-primary);
         background: color-mix(in srgb, var(--color-primary) 7%, transparent);
      }
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

   .attacks-empty {
      grid-column: 1 / -1;
      color: var(--text-muted);
      font-size: var(--font-sm);
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

   /* Tier chips pin to the row's end so they read as right-aligned and any overflow pushes
      inward (left) rather than off the card's right edge — otherwise the extreme tab clips. */
   .attack-tiers,
   .damage-tiers {
      margin-left: auto;
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

   /* Extra rolls share one grid so formulas, types, categories, and averages line up in columns. */
   .ledger {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-6);
      margin-top: var(--space-2);
      padding-top: var(--space-8);
      border-top: 1px solid var(--border-faint);
   }

   .ledger-row {
      align-self: stretch;
      display: grid;
      grid-template-columns: 5rem minmax(0, 1fr) minmax(0, 1fr) 4.5rem 1.5rem;
      align-items: center;
      gap: var(--space-6);
   }

   .ledger-formula {
      box-sizing: border-box;
      width: 100%;
      min-height: 2rem;
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-bold);
      font-variant-numeric: tabular-nums;
      text-align: center;
   }

   /* The builder's global .cc-select rule is ID-scoped, so a plain scoped class can't shrink it. */
   :global(#pf2e-creature-crispr-builder) .ledger-select {
      width: 100%;
      min-width: 0;
      min-height: 2rem;
      padding: 0 var(--space-20) 0 var(--space-6);
      font-size: var(--font-sm);
      text-overflow: ellipsis;
   }

   .ledger-avg {
      justify-self: end;
      font-size: var(--font-sm);
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
   }

   .ledger-remove {
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--font-xs);

      &:hover {
         background: var(--surface-danger-low);
         color: var(--text-danger);
      }
   }

   /* The main roll's line in the column: the attack's name over the formula cells, its average
      in the averages column. Fixed — the main roll is edited on the Damage line above. */
   .ledger-name {
      grid-column: 1 / 4;
      padding-left: var(--space-4);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
   }

   /* Add sits under the formulas; the total sits under the averages column it sums. */
   .ledger-foot .ledger-add {
      grid-column: 1 / 3;
      justify-self: start;
   }

   .ledger-total {
      grid-column: 3 / 5;
      justify-self: end;
      font-size: var(--font-sm);
      font-weight: var(--font-weight-bold);
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
      white-space: nowrap;
   }

   .total-label {
      margin-right: var(--space-6);
      font-size: var(--font-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
   }

   .ledger-add {
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--font-xs);
      padding: var(--space-2) var(--space-8);

      &:hover {
         border-color: var(--color-primary);
         color: var(--color-primary);
      }
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
