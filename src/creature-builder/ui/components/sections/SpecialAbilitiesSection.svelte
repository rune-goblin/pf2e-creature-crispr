<script lang="ts">
   import { SvelteSet } from 'svelte/reactivity';
   import type { EditableCreature, SpecialAbility, ScalableValue } from '@/creature-builder/editor';
   import type { BenchmarkLabel4, BenchmarkLabel3, SpellBenchmarkLabel } from '@/creature-builder/models';
   import {
      getAbilityDescription,
      renderAbilityDescriptionHtml,
      getEffectiveValue,
      getScaledRecommendation,
      getDisplayBenchmark,
      hasOverride,
      parseDiceComponents,
      formatDiceFormula
   } from '@/creature-builder/services';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';

   const DAMAGE_BENCHMARKS: BenchmarkLabel4[] = ['low', 'moderate', 'high', 'extreme'];
   const PERSISTENT_BENCHMARKS: BenchmarkLabel3[] = ['low', 'moderate', 'high'];
   const DC_BENCHMARKS: SpellBenchmarkLabel[] = ['moderate', 'high', 'extreme'];

   let {
      creature,
      expanded,
      onToggle,
      onUpdateAbilityScalableOverride,
      onUpdateAbilityScalableCustomValue,
      onUpdateAbilityCustomDescriptionTemplate
   }: {
      creature: EditableCreature;
      expanded: boolean;
      onToggle?: () => void;
      onUpdateAbilityScalableOverride?: (detail: { abilityIndex: number; valueIndex: number; override: number | undefined }) => void;
      onUpdateAbilityScalableCustomValue?: (detail: { abilityIndex: number; valueIndex: number; customValue: string | undefined }) => void;
      onUpdateAbilityCustomDescriptionTemplate?: (detail: { abilityIndex: number; customTemplate: string | undefined }) => void;
   } = $props();

   const expandedAbilities = new SvelteSet<number>();

   function getScalableValue(sv: ScalableValue, level: number): string {
      const raw = getEffectiveValue(sv, level);
      if (sv.type === 'dc') {
         return `DC ${raw}`;
      }
      const dmgType = sv.damageType ? ` ${sv.damageType}` : '';
      return `${raw}${dmgType}`;
   }

   function handleBenchmarkSelect(abilityIndex: number, valueIndex: number, benchmark: number): void {
      onUpdateAbilityScalableOverride?.({
         abilityIndex,
         valueIndex,
         override: benchmark
      });
   }

   function handleReset(abilityIndex: number, valueIndex: number): void {
      onUpdateAbilityScalableOverride?.({
         abilityIndex,
         valueIndex,
         override: undefined
      });
   }

   const DIE_OPTIONS = [4, 6, 8, 10, 12, 20];

   function getDiceEditorComponents(sv: ScalableValue, level: number): { count: number; die: number; bonus: number } {
      const raw = getEffectiveValue(sv, level);
      return parseDiceComponents(raw) ?? { count: 1, die: 6, bonus: 0 };
   }

   function handleDiceEdit(
      abilityIndex: number,
      valueIndex: number,
      current: { count: number; die: number; bonus: number },
      field: 'count' | 'die' | 'bonus',
      rawValue: number
   ): void {
      if (!Number.isFinite(rawValue)) return;
      const next = { ...current, [field]: rawValue };
      const formula = formatDiceFormula(next.count, next.die, next.bonus);
      onUpdateAbilityScalableCustomValue?.({
         abilityIndex,
         valueIndex,
         customValue: formula
      });
   }

   function handleDcEdit(abilityIndex: number, valueIndex: number, rawValue: number): void {
      if (!Number.isFinite(rawValue)) return;
      const clamped = Math.max(0, Math.round(rawValue));
      onUpdateAbilityScalableCustomValue?.({
         abilityIndex,
         valueIndex,
         customValue: String(clamped)
      });
   }

   let editingAbilityIndex = $state<number | null>(null);
   let editingTemplate = $state('');

   function startEditTemplate(abilityIndex: number, ability: SpecialAbility): void {
      editingAbilityIndex = abilityIndex;
      // Seed with the current effective template: custom override, then parsed
      // template, then the raw description text.
      editingTemplate = ability.customDescriptionTemplate
         ?? ability.descriptionTemplate
         ?? ability.description
         ?? '';
   }

   function cancelEditTemplate(): void {
      editingAbilityIndex = null;
      editingTemplate = '';
   }

   function saveEditTemplate(abilityIndex: number): void {
      onUpdateAbilityCustomDescriptionTemplate?.({
         abilityIndex,
         customTemplate: editingTemplate
      });
      editingAbilityIndex = null;
      editingTemplate = '';
   }

   function resetEditTemplate(abilityIndex: number): void {
      onUpdateAbilityCustomDescriptionTemplate?.({
         abilityIndex,
         customTemplate: undefined
      });
      editingAbilityIndex = null;
      editingTemplate = '';
   }

   function renderDescriptionHtml(ability: SpecialAbility): string {
      const template = ability.customDescriptionTemplate ?? ability.descriptionTemplate;
      if (template && ability.scalableValues && ability.scalableValues.length > 0) {
         return renderAbilityDescriptionHtml(
            template,
            ability.scalableValues,
            creature.level
         );
      }
      // No scalable values — the plain renderer still honours
      // customDescriptionTemplate as a freeform override.
      return getAbilityDescription(ability, creature.level);
   }

   function hasExpandableContent(ability: SpecialAbility): boolean {
      if (ability.traits && ability.traits.length > 0) return true;
      if (ability.scalableValues && ability.scalableValues.length > 0) return true;

      const description = getAbilityDescription(ability, creature.level);
      const textContent = description.replace(/<[^>]*>/g, '').trim();
      if (textContent.length > 0) return true;

      return false;
   }

   function toggleAbility(index: number): void {
      if (expandedAbilities.has(index)) {
         expandedAbilities.delete(index);
      } else {
         expandedAbilities.add(index);
      }
   }

   function expandAllAbilities(): void {
      expandedAbilities.clear();
      for (const [i, ability] of creature.specialAbilities.entries()) {
         if (hasExpandableContent(ability)) expandedAbilities.add(i);
      }
   }

   function collapseAllAbilities(): void {
      expandedAbilities.clear();
   }
</script>

<section class="editor-section">
   <CollapsibleSection label="Special Abilities ({creature.specialAbilities.length})" {expanded} ontoggle={() => onToggle?.()} />
   {#if expanded}
      <div class="section-body">
         {#if creature.specialAbilities.length === 0}
            <p class="no-abilities-message">No special abilities. Import a creature to see its abilities.</p>
         {:else}
            <div class="abilities-toolbar">
               <button class="toolbar-btn" onclick={expandAllAbilities} title="Expand all" aria-label="Expand all">
                  <i class="fas fa-expand-alt"></i>
               </button>
               <button class="toolbar-btn" onclick={collapseAllAbilities} title="Collapse all" aria-label="Collapse all">
                  <i class="fas fa-compress-alt"></i>
               </button>
            </div>
            <div class="abilities-list">
               {#each creature.specialAbilities as ability, abilityIndex (abilityIndex)}
                  {@const isExpandable = hasExpandableContent(ability)}
                  {@const isAbilityExpanded = isExpandable && expandedAbilities.has(abilityIndex)}
                  {#if isExpandable}
                     <div class="ability-card" class:expanded={isAbilityExpanded}>
                        <button class="ability-header" onclick={() => toggleAbility(abilityIndex)}>
                           <i class="fas fa-chevron-right ability-toggle-icon"></i>
                           <span class="ability-name">{ability.name}</span>
                           <div class="ability-icons">
                              {#if ability.actionType === 'action'}
                                 {#if ability.actions === 1}
                                    <span class="action-icon" title="1 action">◆</span>
                                 {:else if ability.actions === 2}
                                    <span class="action-icon" title="2 actions">◆◆</span>
                                 {:else if ability.actions === 3}
                                    <span class="action-icon" title="3 actions">◆◆◆</span>
                                 {:else}
                                    <span class="action-icon" title="action">◆</span>
                                 {/if}
                              {:else if ability.actionType === 'reaction'}
                                 <span class="action-icon" title="reaction">↺</span>
                              {:else if ability.actionType === 'free'}
                                 <span class="action-icon" title="free action">◇</span>
                              {:else}
                                 <span class="action-icon" title="passive">—</span>
                              {/if}
                           </div>
                           {#if !isAbilityExpanded && ability.scalableValues && ability.scalableValues.length > 0}
                              <div class="scalable-tags">
                                 {#each ability.scalableValues as sv, svIndex (svIndex)}
                                    <span class="scalable-tag">
                                       {getScalableValue(sv, creature.level)}
                                    </span>
                                 {/each}
                              </div>
                           {/if}
                        </button>
                        {#if isAbilityExpanded}
                           <div class="ability-body">
                              {#if editingAbilityIndex !== abilityIndex}
                                 <button
                                    type="button"
                                    class="ability-edit-btn"
                                    title="Edit description template"
                                    aria-label="Edit description template"
                                    onclick={(e) => { e.stopPropagation(); startEditTemplate(abilityIndex, ability); }}
                                 ><i class="fas fa-pencil"></i></button>
                              {/if}
                              {#if ability.traits && ability.traits.length > 0}
                                 <div class="ability-traits">
                                    {#each ability.traits as trait, traitIndex (traitIndex)}
                                       <span class="trait-tag">{trait}</span>
                                    {/each}
                                 </div>
                              {/if}
                              {#if editingAbilityIndex === abilityIndex}
                                 <div class="ability-template-editor">
                                    <textarea
                                       class="template-textarea"
                                       rows="6"
                                       bind:value={editingTemplate}
                                    ></textarea>
                                    <p class="template-help">
                                       Edit the text freely. Use <code>{'{0}'}</code>, <code>{'{1}'}</code>, etc.
                                       where you want the editable values below to be inserted. Foundry link
                                       tags like <code>@UUID[...]</code> and <code>@Check[...]</code> are preserved.
                                    </p>
                                    <div class="template-actions">
                                       <button type="button" class="template-btn template-btn-secondary" onclick={cancelEditTemplate}>Cancel</button>
                                       {#if ability.customDescriptionTemplate}
                                          <button type="button" class="template-btn template-btn-secondary" onclick={() => resetEditTemplate(abilityIndex)}>Reset to original</button>
                                       {/if}
                                       <button type="button" class="template-btn template-btn-primary" onclick={() => saveEditTemplate(abilityIndex)}>Save</button>
                                    </div>
                                 </div>
                              {:else}
                                 <!-- Trusted: renderDescriptionHtml emits PF2e-formatted markup from our own renderer, not user input. -->
                                 <div class="ability-description">
                                    {@html renderDescriptionHtml(ability)}
                                 </div>
                              {/if}
                              {#if ability.scalableValues && ability.scalableValues.length > 0}
                                 <div class="ability-scalables">
                                    <div class="scalables-header">Editable Values</div>
                                    {#each ability.scalableValues as sv, valueIndex (valueIndex)}
                                       {@const overridden = hasOverride(sv)}
                                       {@const effectiveValue = getEffectiveValue(sv, creature.level)}
                                       {@const recommendation = getScaledRecommendation(sv, creature.level)}
                                       {@const atBaseLevel = sv.baseLevel !== undefined && sv.baseLevel === creature.level}
                                       {@const displayBenchmark = getDisplayBenchmark(sv, creature.level)}
                                       <div
                                          class="scalable-row"
                                          role="group"
                                          aria-label="{sv.type === 'dc' ? 'DC' : sv.type === 'persistent' ? 'Persistent' : 'Damage'} editor"
                                       >
                                          <span class="scalable-type">
                                             {#if sv.type === 'damage'}
                                                Damage{sv.damageType ? ` (${sv.damageType})` : ''}
                                             {:else if sv.type === 'persistent'}
                                                Persistent{sv.damageType ? ` ${sv.damageType}` : ''}
                                             {:else}
                                                DC
                                             {/if}
                                          </span>
                                          <div class="scalable-controls">
                                             {#if sv.type === 'dc'}
                                                <div class="scalable-editor scalable-editor--dc" class:overridden>
                                                   <span class="dc-prefix">DC</span>
                                                   <input
                                                      type="number"
                                                      class="input-field dc-input"
                                                      min="0"
                                                      step="1"
                                                      value={Number(effectiveValue)}
                                                      oninput={(e) => handleDcEdit(abilityIndex, valueIndex, e.currentTarget.valueAsNumber)}
                                                   />
                                                </div>
                                                <div class="scalable-tiers">
                                                   <BenchmarkButtons
                                                      value={displayBenchmark}
                                                      benchmarks={DC_BENCHMARKS}
                                                      useSpellBenchmark={true}
                                                      compact={true}
                                                      onselect={(d) => handleBenchmarkSelect(abilityIndex, valueIndex, d.value)}
                                                   />
                                                </div>
                                             {:else}
                                                {@const components = getDiceEditorComponents(sv, creature.level)}
                                                <div class="scalable-editor scalable-editor--dice" class:overridden>
                                                   <input
                                                      type="number"
                                                      class="input-field dice-count"
                                                      min="1"
                                                      step="1"
                                                      value={components.count}
                                                      oninput={(e) => handleDiceEdit(abilityIndex, valueIndex, components, 'count', e.currentTarget.valueAsNumber)}
                                                   />
                                                   <span class="dice-op">d</span>
                                                   <select
                                                      class="input-field dice-die"
                                                      value={components.die}
                                                      onchange={(e) => handleDiceEdit(abilityIndex, valueIndex, components, 'die', Number(e.currentTarget.value))}
                                                   >
                                                      {#each DIE_OPTIONS as face (face)}
                                                         <option value={face}>{face}</option>
                                                      {/each}
                                                   </select>
                                                   {#if components.bonus >= 0}
                                                      <span class="dice-op">+</span>
                                                   {/if}
                                                   <input
                                                      type="number"
                                                      class="input-field dice-bonus"
                                                      step="1"
                                                      value={components.bonus}
                                                      oninput={(e) => handleDiceEdit(abilityIndex, valueIndex, components, 'bonus', e.currentTarget.valueAsNumber)}
                                                   />
                                                   {#if sv.damageType}
                                                      <span class="dice-suffix">{sv.damageType}</span>
                                                   {/if}
                                                </div>
                                                <div class="scalable-tiers">
                                                   {#if sv.type === 'damage'}
                                                      <BenchmarkButtons
                                                         value={displayBenchmark}
                                                         benchmarks={DAMAGE_BENCHMARKS}
                                                         use4Benchmark={true}
                                                         compact={true}
                                                         onselect={(d) => handleBenchmarkSelect(abilityIndex, valueIndex, d.value)}
                                                      />
                                                   {:else}
                                                      <BenchmarkButtons
                                                         value={displayBenchmark}
                                                         benchmarks={PERSISTENT_BENCHMARKS}
                                                         use3Benchmark={true}
                                                         compact={true}
                                                         onselect={(d) => handleBenchmarkSelect(abilityIndex, valueIndex, d.value)}
                                                      />
                                                   {/if}
                                                </div>
                                             {/if}
                                             <button
                                                type="button"
                                                class="scalable-btn scalable-reset"
                                                title="Reset to recommended"
                                                aria-label="Reset to recommended"
                                                disabled={!overridden}
                                                onclick={() => handleReset(abilityIndex, valueIndex)}
                                             ><i class="fas fa-rotate-left"></i></button>
                                          </div>
                                          <div class="scalable-hint">
                                             {#if !atBaseLevel}
                                                <span class="scalable-recommended">
                                                   recommended: <strong>{sv.type === 'dc' ? 'DC ' : ''}{recommendation}</strong>
                                                </span>
                                             {/if}
                                             <span class="scalable-original">
                                                original: {sv.type === 'dc' ? 'DC ' : ''}{sv.originalValue}{#if sv.baseLevel !== undefined} @ lvl {sv.baseLevel}{/if}
                                             </span>
                                          </div>
                                       </div>
                                    {/each}
                                 </div>
                              {/if}
                           </div>
                        {/if}
                     </div>
                  {:else}
                     <div class="ability-item">
                        <span class="ability-name">{ability.name}</span>
                        <div class="ability-icons">
                           {#if ability.actionType === 'action'}
                              {#if ability.actions === 1}
                                 <span class="action-icon" title="1 action">◆</span>
                              {:else if ability.actions === 2}
                                 <span class="action-icon" title="2 actions">◆◆</span>
                              {:else if ability.actions === 3}
                                 <span class="action-icon" title="3 actions">◆◆◆</span>
                              {:else}
                                 <span class="action-icon" title="action">◆</span>
                              {/if}
                           {:else if ability.actionType === 'reaction'}
                              <span class="action-icon" title="reaction">↺</span>
                           {:else if ability.actionType === 'free'}
                              <span class="action-icon" title="free action">◇</span>
                           {:else}
                              <span class="action-icon" title="passive">—</span>
                           {/if}
                        </div>
                     </div>
                  {/if}
               {/each}
            </div>
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
      gap: var(--space-12);
   }

   /* Special Abilities Section */
   .no-abilities-message {
      color: var(--text-muted);
      font-size: var(--font-sm);
      font-style: italic;
      padding: var(--space-8);
   }

   .abilities-toolbar {
      display: flex;
      gap: var(--space-4);
      margin-bottom: var(--space-8);
   }

   .toolbar-btn {
      padding: var(--space-4) var(--space-8);
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: var(--font-xs);
      cursor: pointer;
      transition: all var(--transition-fast);

      &:hover {
         background: var(--hover);
         color: var(--text-primary);
         border-color: var(--border-medium);
      }
   }

   .abilities-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
   }

   /* Simple ability item (no expandable content) */
   .ability-item {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      padding: var(--space-8) var(--space-12);
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);

      .ability-name {
         font-size: var(--font-sm);
         font-weight: var(--font-weight-semibold);
         color: var(--text-primary);
      }

      .ability-icons {
         display: flex;
         gap: var(--space-4);
         flex-shrink: 0;
         /* 16px total from name: 8px gap + 8px margin */
         margin-left: var(--space-8);
      }

      .action-icon {
         font-size: var(--font-md);
         color: var(--text-primary);
         font-family: 'Pathfinder2eActions', sans-serif;
      }
   }

   .ability-card {
      background: var(--surface-lowest);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;

      &.expanded {
         .ability-toggle-icon {
            transform: rotate(90deg);
         }
      }


      .ability-header {
         display: flex;
         align-items: center;
         justify-content: flex-start;
         gap: var(--space-8);
         padding: var(--space-8) var(--space-12);
         background: transparent;
         border: none;
         width: 100%;
         cursor: pointer;
         text-align: left;
         transition: background var(--transition-fast);

         &:hover {
            background: var(--hover-low);
         }

         .ability-toggle-icon {
            font-size: var(--font-xs);
            color: var(--text-muted);
            transition: transform 0.15s ease;
            flex-shrink: 0;
         }

         .ability-name {
            font-size: var(--font-sm);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
         }

         .scalable-tags {
            display: flex;
            gap: var(--space-4);
            flex-shrink: 0;
            /* Push the collapsed-preview tags to the far right of the header */
            margin-left: auto;
         }

         .scalable-tag {
            padding: var(--space-2) var(--space-6);
            border-radius: var(--radius-sm);
            font-size: var(--font-xs);
            font-weight: var(--font-weight-medium);
            white-space: nowrap;
            background: var(--surface-low);
            color: var(--text-secondary);
            border: 1px solid var(--border-medium);
         }

         .ability-icons {
            display: flex;
            gap: var(--space-4);
            flex-shrink: 0;
            /* Sit immediately after the ability name with 16px of visual space.
               The header flex `gap` already provides 8px, so an additional 8px
               margin-left brings the total spacing to 16px. */
            margin-left: var(--space-8);
         }

         .action-icon {
            font-size: var(--font-md);
            color: var(--text-primary);
            font-family: 'Pathfinder2eActions', sans-serif;
         }
      }

      .ability-body {
         position: relative;
         padding: var(--space-8) var(--space-12) var(--space-12);
         border-top: 1px solid var(--border-subtle);
      }

      .ability-edit-btn {
         position: absolute;
         top: var(--space-8);
         right: var(--space-8);
         width: 1.75rem;
         height: 1.75rem;
         border: 1px solid var(--border-default);
         border-radius: var(--radius-sm);
         background: var(--surface-low);
         color: var(--text-muted);
         cursor: pointer;
         display: flex;
         align-items: center;
         justify-content: center;
         font-size: var(--font-xs);
         padding: 0;
         z-index: 2;
         transition: color var(--transition-fast), border-color var(--transition-fast);

         &:hover {
            background: var(--hover);
            color: var(--text-primary);
            border-color: var(--border-medium);
         }
      }

      .ability-template-editor {
         display: flex;
         flex-direction: column;
         gap: var(--space-8);

         .template-textarea {
            width: 100%;
            min-height: 8rem;
            padding: var(--space-8);
            background: var(--surface-lowest);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-sm);
            color: var(--text-primary);
            font-family: var(--font-mono, ui-monospace, monospace);
            font-size: var(--font-xs);
            line-height: 1.5;
            resize: vertical;
            outline: none;
            transition: border-color var(--transition-fast);

            &:focus {
               border-color: var(--border-medium);
            }
         }

         .template-help {
            margin: 0;
            font-size: var(--font-xs);
            color: var(--text-muted);
            line-height: 1.4;

            code {
               font-family: var(--font-mono, ui-monospace, monospace);
               background: var(--surface-lowest);
               padding: 1px var(--space-4);
               border: 1px solid var(--border-subtle);
               border-radius: var(--radius-sm);
               color: var(--text-secondary);
            }
         }

         .template-actions {
            display: flex;
            gap: var(--space-8);
            justify-content: flex-end;
         }

         .template-btn {
            padding: var(--space-6) var(--space-12);
            border-radius: var(--radius-sm);
            font-size: var(--font-xs);
            font-weight: var(--font-weight-medium);
            cursor: pointer;
            transition: background var(--transition-fast);
         }

         .template-btn-secondary {
            background: var(--surface-low);
            border: 1px solid var(--border-default);
            color: var(--text-secondary);

            &:hover {
               background: var(--hover);
               color: var(--text-primary);
            }
         }

         .template-btn-primary {
            background: var(--btn-primary-bg);
            border: 1px solid var(--btn-primary-bg);
            color: var(--text-primary);

            &:hover {
               background: var(--btn-primary-hover, var(--btn-primary-bg));
            }
         }
      }

      .ability-traits {
         display: flex;
         flex-wrap: wrap;
         gap: var(--space-4);
         margin-bottom: var(--space-8);

         .trait-tag {
            padding: var(--space-2) var(--space-6);
            background: var(--surface-low);
            border: 1px solid var(--border-medium);
            border-radius: var(--radius-sm);
            font-size: var(--font-xs);
            color: var(--text-secondary);
            text-transform: capitalize;
         }
      }

      .ability-description {
         font-size: var(--font-sm);
         color: var(--text-secondary);
         line-height: 1.5;
         max-height: 200px;
         overflow-y: auto;

         :global(p) {
            margin: 0 0 var(--space-8) 0;
         }

         :global(strong) {
            color: var(--text-primary);
         }

         /* Inline scalable-value tags injected via renderAbilityDescriptionHtml */
         :global(.scalable-inline) {
            display: inline-block;
            padding: 0 var(--space-4);
            border-radius: var(--radius-sm);
            color: var(--color-primary);
            text-decoration: underline;
            text-decoration-color: var(--color-primary);
            text-decoration-thickness: 1px;
            text-underline-offset: 2px;
            font-weight: var(--font-weight-semibold);
            transition: background var(--transition-fast), color var(--transition-fast);
         }

         :global(.scalable-inline--overridden) {
            color: var(--color-warning);
            text-decoration-color: var(--color-warning);
         }
      }

      .ability-scalables {
         margin-top: var(--space-12);
         padding-top: var(--space-12);
         border-top: 1px solid var(--border-subtle);
         display: flex;
         flex-direction: column;
         gap: var(--space-6);

         .scalables-header {
            font-size: var(--font-xs);
            font-weight: var(--font-weight-semibold);
            color: var(--text-muted);
            text-transform: uppercase;
            margin-bottom: var(--space-8);
         }

         .scalable-row {
            display: flex;
            align-items: center;
            gap: var(--space-12);
            padding: var(--space-6) var(--space-8);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);

            .scalable-type {
               font-size: var(--font-sm);
               font-weight: var(--font-weight-medium);
               color: var(--text-primary);
               min-width: 120px;
            }

            .scalable-controls {
               display: flex;
               align-items: center;
               gap: var(--space-4);
            }

            .scalable-editor {
               display: inline-flex;
               align-items: center;
               gap: var(--space-4);
               font-size: var(--font-sm);
               font-weight: var(--font-weight-bold);
               color: var(--text-primary);

               .dc-prefix,
               .dice-op,
               .dice-suffix {
                  color: var(--text-muted);
                  font-weight: var(--font-weight-medium);
                  user-select: none;
               }

               /* Shared styling for every editable field in the editor row */
               .input-field {
                  box-sizing: border-box;
                  padding: var(--space-2) var(--space-6);
                  background: var(--surface-lowest);
                  border: 1px solid var(--border-default);
                  border-radius: var(--radius-sm);
                  color: var(--text-primary);
                  font: inherit;
                  text-align: center;
                  outline: none;
                  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

                  &:hover {
                     border-color: var(--border-medium);
                  }

                  &:focus {
                     border-color: var(--color-primary);
                     box-shadow: 0 0 0 1px var(--color-primary);
                  }
               }

               /* Hide native number spinners — we want a clean bordered box */
               input[type="number"].input-field {
                  -moz-appearance: textfield;
                  appearance: textfield;

                  &::-webkit-outer-spin-button,
                  &::-webkit-inner-spin-button {
                     -webkit-appearance: none;
                     margin: 0;
                  }
               }

               .dc-input { width: 3rem; }
               .dice-count { width: 2.5rem; }
               .dice-bonus { width: 2.75rem; }

               /* Die dropdown styled as a proper button with a chevron indicator */
               select.dice-die {
                  width: 3.25rem;
                  padding-right: 1.1rem; /* room for the chevron */
                  cursor: pointer;
                  -webkit-appearance: none;
                  -moz-appearance: none;
                  appearance: none;
                  background-image:
                     linear-gradient(45deg, transparent 50%, currentColor 50%),
                     linear-gradient(135deg, currentColor 50%, transparent 50%);
                  background-position:
                     calc(100% - 10px) 55%,
                     calc(100% - 6px) 55%;
                  background-size: 4px 4px, 4px 4px;
                  background-repeat: no-repeat;
               }
            }

            /* Wrapper around the tier BenchmarkButtons: creates a 16px visual gap
               between the last dice input and the tier buttons while keeping the
               normal 4px gap before the reset button. */
            .scalable-tiers {
               margin-left: var(--space-12);
            }

            .scalable-btn {
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

            .scalable-reset {
               margin-left: var(--space-4);
            }

            .scalable-hint {
               margin-left: auto;
               display: flex;
               flex-direction: column;
               align-items: flex-end;
               gap: 1px;
               font-size: var(--font-xs);
               line-height: 1.3;
            }

            .scalable-recommended {
               color: var(--text-secondary);

               strong {
                  color: var(--color-primary);
                  font-weight: var(--font-weight-semibold);
               }
            }

            .scalable-original {
               color: var(--text-muted);
               font-style: italic;
            }
         }
      }
   }
</style>
