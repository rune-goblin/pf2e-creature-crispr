<script lang="ts">
   import { SvelteSet } from 'svelte/reactivity';
   import type { EditableCreature, SpecialAbility, ScalableValue, EditorEnvironment } from '@/creature-builder/editor';
   import type { BenchmarkLabel4, BenchmarkLabel3, SpellBenchmarkLabel } from '@/creature-builder/logic/models';
   import type { AbilityProvider, CustomAbilityDefinition } from '@/creature-builder/logic/contracts';
   import {
      getAbilityDescription,
      renderAbilityDescriptionHtml,
      getEffectiveValue,
      getScaledRecommendation,
      getDisplayBenchmark,
      getActiveTierFormula,
      scalesWithLevel,
      getLevelGuidance,
      hasOverride,
      parseDiceComponents,
      formatDiceFormula
   } from '@/creature-builder/logic/abilityScaling';
   import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
   import BenchmarkButtons from '../widgets/BenchmarkButtons.svelte';
   import EnrichedHtml from '../baseComponents/EnrichedHtml.svelte';
   import AbilityPickerDialog from './AbilityPickerDialog.svelte';

   const DAMAGE_BENCHMARKS: BenchmarkLabel4[] = ['low', 'moderate', 'high', 'extreme'];
   const PERSISTENT_BENCHMARKS: BenchmarkLabel3[] = ['low', 'moderate', 'high'];
   const HEALING_BENCHMARKS: BenchmarkLabel3[] = ['low', 'moderate', 'high'];
   const DC_BENCHMARKS: SpellBenchmarkLabel[] = ['moderate', 'high', 'extreme'];

   let {
      creature,
      env,
      expanded,
      kind,
      abilityProviders = [],
      highlightDrop = false,
      onToggle,
      onUpdateAbilityScalableOverride,
      onUpdateAbilityScalableCustomValue,
      onUpdateAbilityCustomDescriptionTemplate,
      onAddAbility,
      onUpdateAbility,
      onRemoveAbility,
      onAddBlank
   }: {
      creature: EditableCreature;
      env: EditorEnvironment;
      expanded: boolean;
      kind: 'action' | 'passive';
      abilityProviders?: AbilityProvider[];
      /** True while a drag hovers the editor and this section is the detected destination. */
      highlightDrop?: boolean;
      onToggle?: () => void;
      onUpdateAbilityScalableOverride?: (detail: { abilityIndex: number; valueIndex: number; override: number | undefined }) => void;
      onUpdateAbilityScalableCustomValue?: (detail: { abilityIndex: number; valueIndex: number; customValue: string | undefined }) => void;
      onUpdateAbilityCustomDescriptionTemplate?: (detail: { abilityIndex: number; customTemplate: string | undefined }) => void;
      /** Returns false when the ability was rejected as a duplicate. */
      onAddAbility?: (ability: SpecialAbility) => boolean;
      onUpdateAbility?: (detail: { index: number; updates: Partial<SpecialAbility> }) => void;
      onRemoveAbility?: (index: number) => void;
      onAddBlank?: () => void;
   } = $props();

   const isPassiveSection = $derived(kind === 'passive');
   const sectionLabel = $derived(isPassiveSection ? 'Passives' : 'Actions');

   // One section renders one kind; "Actions" holds action/reaction/free, "Passives" holds passive.
   // Carry the original index so every edit callback still addresses the full specialAbilities array.
   const entries = $derived(
      creature.specialAbilities
         .map((ability, index) => ({ ability, index }))
         .filter(({ ability }) => (isPassiveSection ? ability.actionType === 'passive' : ability.actionType !== 'passive'))
   );

   type ActionCost = '1' | '2' | '3' | 'reaction' | 'free' | 'passive';
   // Header cost picker: PF2e action glyphs for the five action costs, a text segment for "passive"
   // (choosing it moves the ability between the Actions and Passives sections).
   const COST_PICKER: { value: ActionCost; glyph?: string; label: string; title: string }[] = [
      { value: '1', glyph: '◆', label: '◆', title: '1 action' },
      { value: '2', glyph: '◆◆', label: '◆◆', title: '2 actions' },
      { value: '3', glyph: '◆◆◆', label: '◆◆◆', title: '3 actions' },
      { value: 'reaction', glyph: '↺', label: '↺', title: 'Reaction' },
      { value: 'free', glyph: '◇', label: '◇', title: 'Free action' },
      { value: 'passive', label: 'Passive', title: 'Passive (no action cost)' }
   ];

   function abilityCost(ability: SpecialAbility): ActionCost {
      return ability.actionType === 'action' ? (String(ability.actions ?? 1) as ActionCost) : ability.actionType;
   }

   function setAbilityCost(index: number, cost: ActionCost): void {
      if (cost === '1' || cost === '2' || cost === '3') {
         onUpdateAbility?.({ index, updates: { actionType: 'action', actions: Number(cost) as 1 | 2 | 3 } });
      } else {
         onUpdateAbility?.({ index, updates: { actionType: cost, actions: undefined } });
      }
   }

   // Keyed by ability id (not array index) so expansion survives add/remove/reorder.
   const expandedAbilities = new SvelteSet<string>();

   // Top-bar (name + action cost) editing is gated behind the pencil — separate from expansion
   // and from the description/value editors. Snapshot the bar's fields to revert on cancel.
   let headerEditId = $state<string | null>(null);
   let headerEditSnapshot = $state<Pick<SpecialAbility, 'name' | 'actionType' | 'actions'> | null>(null);

   function startHeaderEdit(ability: SpecialAbility): void {
      headerEditId = ability.id;
      headerEditSnapshot = { name: ability.name, actionType: ability.actionType, actions: ability.actions };
      pendingDeleteId = null;
   }

   function confirmHeaderEdit(): void {
      headerEditId = null;
      headerEditSnapshot = null;
   }

   function cancelHeaderEdit(abilityIndex: number): void {
      if (headerEditSnapshot) onUpdateAbility?.({ index: abilityIndex, updates: { ...headerEditSnapshot } });
      headerEditId = null;
      headerEditSnapshot = null;
   }

   // Two-step delete so a stray click can't destroy an ability.
   let pendingDeleteId = $state<string | null>(null);

   function requestDelete(id: string): void {
      pendingDeleteId = id;
      headerEditId = null;
      headerEditSnapshot = null;
   }

   function cancelDelete(): void {
      pendingDeleteId = null;
   }

   function confirmDelete(abilityIndex: number): void {
      pendingDeleteId = null;
      onRemoveAbility?.(abilityIndex);
   }

   let showAbilityPicker = $state(false);

   // Picked provider ability → host instantiates it (kernel mapping + id), then it's added like a drop.
   function handlePickerAdd(def: CustomAbilityDefinition): void {
      const ability = env.abilityFromDefinition(def, creature.level);
      if (onAddAbility?.(ability) === false) {
         env.notify.warn('Ability already exists.');
         return;
      }
      env.notify.info(`Added "${ability.name}" to special abilities`);
   }

   // Drag a CRISPR ability onto a PF2e actor sheet: the host serializes it to a Foundry Item drop
   // payload (with the user's current scalable edits baked in).
   function handleAbilityDragStart(event: DragEvent, ability: SpecialAbility): void {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData('text/plain', env.abilityToDropPayload(ability, creature.level));
      event.dataTransfer.effectAllowed = 'copy';
   }

   function healingLabel(ability: SpecialAbility): string {
      if (!ability.fastHealing) return 'Healing'; // an in-prose heal, not a fast-healing/regen rule
      return ability.fastHealing.kind === 'regeneration' ? 'Regeneration' : 'Fast Healing';
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

   const isRollType = (sv: ScalableValue): boolean => sv.type === 'damage' || sv.type === 'persistent';

   // min/mean/max for a dice formula (NdM±B) or a flat integer; null when the formula isn't a simple
   // shape (e.g. a compound "2d6+1d4"), in which case the spread is just omitted.
   function rollStats(formula: string): { min: number; mean: number; max: number } | null {
      const c = parseDiceComponents(formula);
      if (c) {
         return {
            min: c.count + c.bonus,
            mean: (c.count * (c.die + 1)) / 2 + c.bonus,
            max: c.count * c.die + c.bonus
         };
      }
      const flat = Number(formula);
      return Number.isFinite(flat) ? { min: flat, mean: flat, max: flat } : null;
   }

   const fmtMean = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

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

   function handleHealingEdit(abilityIndex: number, valueIndex: number, rawValue: number): void {
      if (!Number.isFinite(rawValue)) return;
      const clamped = Math.max(1, Math.round(rawValue));
      onUpdateAbilityScalableCustomValue?.({
         abilityIndex,
         valueIndex,
         customValue: String(clamped)
      });
   }

   function handleConditionEdit(abilityIndex: number, valueIndex: number, rawValue: number): void {
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

   // Every ability is now an editable card — its name, action cost, description and scalable
   // values all live in the expandable body, so there's always something to open.
   function hasExpandableContent(_ability: SpecialAbility): boolean {
      return true;
   }

   function toggleAbility(id: string): void {
      if (expandedAbilities.has(id)) {
         expandedAbilities.delete(id);
         if (headerEditId === id) confirmHeaderEdit();
         if (pendingDeleteId === id) pendingDeleteId = null;
      } else {
         expandedAbilities.add(id);
      }
   }

   function expandAllAbilities(): void {
      expandedAbilities.clear();
      for (const { ability } of entries) expandedAbilities.add(ability.id);
   }

   function collapseAllAbilities(): void {
      expandedAbilities.clear();
   }
</script>

<section class="editor-section" class:drag-over={highlightDrop}>
   <CollapsibleSection
      label="{sectionLabel} ({entries.length})"
      {expanded}
      ontoggle={() => onToggle?.()}
      addLabel={isPassiveSection ? 'Add Passive' : 'Add Action'}
      addTitle="Add a blank {isPassiveSection ? 'passive' : 'action'}"
      onAdd={() => onAddBlank?.()}
   >
      {#snippet actions()}
         {#if abilityProviders.length > 0 && !isPassiveSection}
            <button type="button" class="add-ability-btn" title="Add from the library" onclick={() => (showAbilityPicker = true)}>
               <i class="fas fa-book"></i> From Library
            </button>
         {/if}
      {/snippet}
   </CollapsibleSection>
   {#if expanded}
      <div
         class="section-body"
         class:drag-over={highlightDrop}
         role="group"
         aria-label="Drop an action or passive ability here to add it"
      >
         {#if entries.length === 0}
            <p class="no-abilities-message">
               No {isPassiveSection ? 'passives' : 'actions'} yet. Use <strong>Add</strong>, drag one from an actor sheet here, or import a creature.
            </p>
         {:else}
            <div class="abilities-toolbar">
               <button class="toolbar-btn" onclick={expandAllAbilities} title="Expand all" aria-label="Expand all">
                  <i class="fas fa-arrows-from-line"></i>
               </button>
               <button class="toolbar-btn" onclick={collapseAllAbilities} title="Collapse all" aria-label="Collapse all">
                  <i class="fas fa-arrows-to-line"></i>
               </button>
            </div>
            <div class="abilities-list">
               {#each entries as { ability, index: abilityIndex } (ability.id)}
                  {@const isAbilityExpanded = expandedAbilities.has(ability.id)}
                  <div class="ability-row">
                     <span
                        class="drag-handle"
                        draggable="true"
                        role="img"
                        aria-label="Drag {ability.name} onto an actor sheet"
                        title="Drag onto an actor sheet to copy this ability"
                        ondragstart={(e) => handleAbilityDragStart(e, ability)}
                     >
                        <i class="fas fa-grip-vertical"></i>
                     </span>
                     <div class="ability-card" class:expanded={isAbilityExpanded}>
                        <div class="ability-card-head">
                           {#if headerEditId === ability.id}
                              <div class="ability-head-edit">
                                 <button
                                    type="button"
                                    class="ability-toggle"
                                    title="Collapse"
                                    aria-label="Collapse {ability.name}"
                                    onclick={() => toggleAbility(ability.id)}
                                 ><i class="fas fa-chevron-right ability-toggle-icon"></i></button>
                                 <input
                                    class="ability-name-input"
                                    value={ability.name}
                                    placeholder="Ability name"
                                    aria-label="Ability name"
                                    oninput={(e) => onUpdateAbility?.({ index: abilityIndex, updates: { name: e.currentTarget.value } })}
                                 />
                                 <div class="cost-picker" role="group" aria-label="Action cost">
                                    {#each COST_PICKER as o (o.value)}
                                       <button
                                          type="button"
                                          class="cost-segment"
                                          class:cost-glyph={!!o.glyph}
                                          class:selected={abilityCost(ability) === o.value}
                                          title={o.title}
                                          aria-pressed={abilityCost(ability) === o.value}
                                          onclick={() => setAbilityCost(abilityIndex, o.value)}
                                       >{o.glyph ?? o.label}</button>
                                    {/each}
                                 </div>
                              </div>
                              <button
                                 type="button"
                                 class="head-confirm"
                                 title="Confirm"
                                 aria-label="Confirm name and action cost"
                                 onclick={confirmHeaderEdit}
                              ><i class="fas fa-check"></i></button>
                              <button
                                 type="button"
                                 class="head-cancel"
                                 title="Cancel"
                                 aria-label="Cancel name and action cost changes"
                                 onclick={() => cancelHeaderEdit(abilityIndex)}
                              ><i class="fas fa-times"></i></button>
                           {:else}
                              <button class="ability-header" onclick={() => toggleAbility(ability.id)}>
                                 <i class="fas fa-chevron-right ability-toggle-icon"></i>
                                 <span class="ability-name">{ability.name}</span>
                                 {#if ability.actionType !== 'passive'}
                                    <div class="ability-icons">
                                       {#if ability.actionType === 'action'}
                                          {#if ability.actions === 2}
                                             <span class="action-icon" title="2 actions">◆◆</span>
                                          {:else if ability.actions === 3}
                                             <span class="action-icon" title="3 actions">◆◆◆</span>
                                          {:else}
                                             <span class="action-icon" title="1 action">◆</span>
                                          {/if}
                                       {:else if ability.actionType === 'reaction'}
                                          <span class="action-icon" title="reaction">↺</span>
                                       {:else if ability.actionType === 'free'}
                                          <span class="action-icon" title="free action">◇</span>
                                       {/if}
                                    </div>
                                 {/if}
                              </button>
                              <button
                                 type="button"
                                 class="ability-edit-btn"
                                 title="Edit name & action cost"
                                 aria-label="Edit name and action cost for {ability.name}"
                                 onclick={() => startHeaderEdit(ability)}
                              ><i class="fas fa-pencil"></i></button>
                           {/if}
                        </div>
                        {#if isAbilityExpanded}
                           <div class="ability-body">
                              {#if editingAbilityIndex !== abilityIndex}
                                 <div class="ability-body-toolbar">
                                    <button
                                       type="button"
                                       class="desc-edit-btn"
                                       title="Edit description"
                                       aria-label="Edit description for {ability.name}"
                                       onclick={() => startEditTemplate(abilityIndex, ability)}
                                    ><i class="fas fa-pencil"></i> Edit description</button>
                                 </div>
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
                                    <div class="template-actions">
                                       <button type="button" class="template-btn template-btn-secondary" onclick={cancelEditTemplate}>Cancel</button>
                                       {#if ability.customDescriptionTemplate}
                                          <button type="button" class="template-btn template-btn-secondary" onclick={() => resetEditTemplate(abilityIndex)}>Reset to original</button>
                                       {/if}
                                       <button type="button" class="template-btn template-btn-primary" onclick={() => saveEditTemplate(abilityIndex)}>Save</button>
                                    </div>
                                 </div>
                              {:else}
                                 <div class="ability-description">
                                    <EnrichedHtml html={renderDescriptionHtml(ability)} enrich={env.enrichHtml} />
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
                                          aria-label="{sv.type === 'dc' ? 'DC' : sv.type === 'persistent' ? 'Persistent' : sv.type === 'healing' ? healingLabel(ability) : sv.type === 'condition' ? (sv.conditionLabel ?? 'Condition') : 'Damage'} editor"
                                       >
                                          <span class="scalable-type">
                                             {#if sv.type === 'damage'}
                                                Damage{sv.damageType ? ` (${sv.damageType})` : ''}
                                             {:else if sv.type === 'persistent'}
                                                Persistent{sv.damageType ? ` ${sv.damageType}` : ''}
                                             {:else if sv.type === 'healing'}
                                                {healingLabel(ability)}
                                             {:else if sv.type === 'condition'}
                                                {sv.conditionLabel ?? 'Condition'}
                                             {:else}
                                                {sv.checkType ? `${sv.checkType[0].toUpperCase()}${sv.checkType.slice(1)} DC` : 'DC'}
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
                                                {#if scalesWithLevel(sv)}
                                                   <div class="scalable-tiers">
                                                      <BenchmarkButtons
                                                         value={displayBenchmark}
                                                         benchmarks={DC_BENCHMARKS}
                                                         useSpellBenchmark={true}
                                                         compact={true}
                                                         onselect={(d) => handleBenchmarkSelect(abilityIndex, valueIndex, d.value)}
                                                      />
                                                   </div>
                                                {/if}
                                             {:else if sv.type === 'healing'}
                                                <div class="scalable-editor scalable-editor--healing" class:overridden>
                                                   <input
                                                      type="number"
                                                      class="input-field healing-input"
                                                      min="1"
                                                      step="1"
                                                      value={Number(effectiveValue)}
                                                      oninput={(e) => handleHealingEdit(abilityIndex, valueIndex, e.currentTarget.valueAsNumber)}
                                                   />
                                                   <span class="dice-suffix">{ability.fastHealing ? 'HP/round' : 'HP'}</span>
                                                </div>
                                                <div class="scalable-tiers">
                                                   <BenchmarkButtons
                                                      value={displayBenchmark}
                                                      benchmarks={HEALING_BENCHMARKS}
                                                      use3Benchmark={true}
                                                      compact={true}
                                                      onselect={(d) => handleBenchmarkSelect(abilityIndex, valueIndex, d.value)}
                                                   />
                                                </div>
                                             {:else if sv.type === 'condition'}
                                                <div class="scalable-editor scalable-editor--condition" class:overridden>
                                                   <input
                                                      type="number"
                                                      class="input-field condition-input"
                                                      min="0"
                                                      step="1"
                                                      value={Number(effectiveValue)}
                                                      oninput={(e) => handleConditionEdit(abilityIndex, valueIndex, e.currentTarget.valueAsNumber)}
                                                   />
                                                   <span class="dice-suffix">{sv.conditionLabel ?? 'value'}</span>
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
                                             {#if isRollType(sv)}
                                                {@const activeRec = getActiveTierFormula(sv, creature.level)}
                                                {@const recStats = activeRec ? rollStats(activeRec.formula) : null}
                                                {@const calcStats = rollStats(effectiveValue)}
                                                <div class="scalable-stats">
                                                   <span class="stat-tag">recommended</span>
                                                   <strong class="stat-val stat-val--rec">{activeRec ? activeRec.formula : '—'}</strong>
                                                   <span class="stat-spread">{#if recStats}min {recStats.min} · mean {fmtMean(recStats.mean)} · max {recStats.max}{/if}</span>
                                                   <span class="stat-tag">calculated</span>
                                                   <strong class="stat-val">{effectiveValue}</strong>
                                                   <span class="stat-spread">{#if calcStats}min {calcStats.min} · mean {fmtMean(calcStats.mean)} · max {calcStats.max}{/if}</span>
                                                </div>
                                             {:else if sv.type === 'dc' && !scalesWithLevel(sv)}
                                                <span class="scalable-guidance">
                                                   level-based DC: <strong>{getLevelGuidance(sv, creature.level)}</strong>
                                                </span>
                                             {:else if !atBaseLevel && scalesWithLevel(sv)}
                                                <span class="scalable-recommended">
                                                   recommended: <strong>{sv.type === 'dc' ? 'DC ' : ''}{recommendation}</strong>
                                                </span>
                                             {:else if !atBaseLevel}
                                                <span class="scalable-guidance">
                                                   if scaled to lvl {creature.level}: <strong>{getLevelGuidance(sv, creature.level)}</strong>
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
                           <div class="ability-footer" class:confirming={pendingDeleteId === ability.id}>
                              {#if pendingDeleteId === ability.id}
                                 <span class="delete-confirm-text">Delete this ability?</span>
                                 <button type="button" class="delete-confirm-btn" onclick={() => confirmDelete(abilityIndex)}>Delete</button>
                                 <button type="button" class="delete-cancel-btn" onclick={cancelDelete}>Cancel</button>
                              {:else}
                                 <button type="button" class="ability-delete-btn" title="Delete this ability" onclick={() => requestDelete(ability.id)}>
                                    <i class="fas fa-trash"></i> Delete ability
                                 </button>
                              {/if}
                           </div>
                        {/if}
                     </div>
                  </div>
               {/each}
            </div>
         {/if}
      </div>
   {/if}
</section>

<AbilityPickerDialog
   bind:show={showAbilityPicker}
   providers={abilityProviders}
   level={creature.level}
   onPick={handlePickerAdd}
   enrich={env.enrichHtml}
/>

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

   /* Special Abilities Section */
   .no-abilities-message {
      color: var(--text-muted);
      font-size: var(--font-sm);
      font-style: italic;
      padding: var(--space-8);
   }

   /* Secondary header add — ghost weight so the primary "Add Action" stays dominant. */
   .add-ability-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-2) var(--space-8);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: var(--font-xs);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: all var(--transition-fast);

      &:hover {
         background: var(--hover-low);
         color: var(--text-primary);
      }

      i {
         font-size: 0.6rem;
      }
   }

   /* Header row: the expand/edit toggle fills the width; the edit pencil sits flush right. */
   .ability-card-head {
      display: flex;
      align-items: stretch;
   }

   .ability-card-head .ability-header {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
   }

   /* Confirm/cancel for the top-bar edit — neutral to match the surrounding controls, not a
      bright green/red affirmation. They replace the pencil while editing. */
   .head-confirm,
   .head-cancel {
      flex: 0 0 auto;
      align-self: center;
      margin-left: var(--space-4);
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
      transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);

      &:hover {
         background: var(--hover);
         border-color: var(--border-medium);
      }
   }

   .head-confirm:hover {
      color: var(--text-primary);
   }

   .head-cancel:hover {
      color: var(--text-danger);
   }

   .head-cancel {
      margin-right: var(--space-4);
   }

   /* Expanded header toolbar (edit mode): chevron · editable title · cost-glyph picker. */
   .ability-head-edit {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-8);
      padding: var(--space-6) var(--space-8) var(--space-6) var(--space-12);
   }

   .ability-toggle {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;

      .ability-toggle-icon {
         font-size: var(--font-xs);
         transition: transform 0.15s ease;
      }
   }

   /* Only shown in the header edit state — a full bordered input matching the cost picker beside
      it, so the name reads as clearly editable rather than static title text. */
   .ability-name-input {
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--space-4) var(--space-8);
      background: var(--surface-lowest);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      outline: none;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

      &::placeholder {
         color: var(--text-muted);
         font-weight: var(--font-weight-medium);
      }

      &:hover {
         border-color: var(--border-medium);
      }

      &:focus {
         border-color: var(--color-primary);
         box-shadow: 0 0 0 1px var(--color-primary);
      }
   }

   .cost-picker {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: stretch;
      background: var(--surface-lowest);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      overflow: hidden;
   }

   .cost-segment {
      /* Fixed height + flex centering gives the big glyphs and the small PASSIVE label one
         shared vertical centre (their font metrics differ, so padding alone misaligns them). */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.9rem;
      height: 1.65rem;
      padding: 0 var(--space-6);
      background: transparent;
      border: none;
      border-right: 1px solid var(--border-subtle);
      color: var(--text-muted);
      cursor: pointer;
      font-size: var(--font-xs);
      line-height: 1;
      transition: background var(--transition-fast), color var(--transition-fast);

      &:last-child {
         border-right: none;
      }

      &.cost-glyph {
         font-family: 'Pathfinder2eActions', sans-serif;
         font-size: var(--font-lg);
         line-height: 1;
      }

      &:not(.cost-glyph) {
         text-transform: uppercase;
         letter-spacing: 0.03em;
         font-weight: var(--font-weight-semibold);
      }

      &:hover {
         background: var(--hover-low);
         color: var(--text-secondary);
      }

      &.selected {
         background: var(--surface-primary-low);
         color: var(--text-primary);
      }
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

   .ability-row {
      display: flex;
      align-items: stretch;
      gap: var(--space-4);
   }

   .ability-row > .ability-card {
      flex: 1 1 auto;
      min-width: 0;
   }

   .drag-handle {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      color: var(--text-muted);
      cursor: grab;
      border-radius: var(--radius-sm);
      transition: color var(--transition-fast), background var(--transition-fast);

      &:hover {
         color: var(--text-primary);
         background: var(--hover-low);
      }

      &:active {
         cursor: grabbing;
      }

      i {
         font-size: var(--font-xs);
         pointer-events: none;
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
            font-size: var(--font-md);
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
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
            font-size: var(--font-2xl);
            line-height: 1;
            color: var(--text-primary);
            font-family: 'Pathfinder2eActions', sans-serif;
         }
      }

      .ability-body {
         position: relative;
         padding: var(--space-8) var(--space-12) var(--space-12);
         border-top: 1px solid var(--border-subtle);
      }

      .ability-body-toolbar {
         display: flex;
         justify-content: flex-end;
         margin-bottom: var(--space-6);
      }

      .desc-edit-btn {
         display: inline-flex;
         align-items: center;
         gap: var(--space-4);
         padding: var(--space-2) var(--space-8);
         border: 1px solid var(--border-default);
         border-radius: var(--radius-sm);
         background: var(--surface-low);
         color: var(--text-muted);
         cursor: pointer;
         font-size: var(--font-xs);
         font-weight: var(--font-weight-medium);
         transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);

         &:hover {
            background: var(--hover);
            color: var(--text-primary);
            border-color: var(--border-medium);
         }
      }

      /* Destructive action is the card's full-width footer — flush to the frame, clipped by the
         card's rounded bottom, quiet until hovered. A background tint (not a divider rule) sets it
         apart from the body, so the open card carries one fewer horizontal line. Two-step confirm
         guards a stray click. */
      .ability-footer {
         display: flex;
         align-items: center;
         gap: var(--space-8);

         &.confirming {
            padding: var(--space-8) var(--space-12);
            background: var(--surface-danger-lowest);
         }
      }

      .ability-delete-btn {
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

      .ability-edit-btn {
         flex: 0 0 auto;
         align-self: center;
         margin-right: var(--space-8);
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
         font-size: var(--font-md);
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

         /* PF2e enriched content ships a loud gold <hr> between Trigger/Effect — quiet it to a
            faint hairline so it reads as a paragraph break, not another frame rung. */
         :global(hr) {
            height: 0;
            border: none;
            border-top: 1px solid var(--border-faint);
            margin: var(--space-8) 0;
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
         margin-top: var(--space-8);
         display: flex;
         flex-direction: column;
         gap: var(--space-6);

         .scalables-header {
            font-size: var(--font-xs);
            font-weight: var(--font-weight-semibold);
            color: var(--text-muted);
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
               .healing-input { width: 3rem; }
               .condition-input { width: 3rem; }
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

            /* Advisory only (the field stays flat) — quieter than the applied recommendation. */
            .scalable-guidance {
               color: var(--text-muted);

               strong {
                  color: var(--text-secondary);
                  font-weight: var(--font-weight-semibold);
               }
            }

            .scalable-original {
               color: var(--text-muted);
               font-style: italic;
            }

            /* recommended (the selected benchmark tier) over calculated (the current dice), each with
               its min/mean/max — three aligned columns so the values line up for quick comparison. */
            .scalable-stats {
               display: grid;
               grid-template-columns: auto auto auto;
               column-gap: var(--space-8);
               row-gap: 1px;
               align-items: baseline;

               .stat-tag {
                  text-align: right;
                  color: var(--text-muted);
                  text-transform: uppercase;
                  letter-spacing: 0.03em;
                  font-size: 0.625rem;
               }

               .stat-val {
                  text-align: right;
                  color: var(--text-primary);
                  font-weight: var(--font-weight-semibold);
                  font-variant-numeric: tabular-nums;
               }

               .stat-val--rec {
                  color: var(--color-primary);
               }

               .stat-spread {
                  text-align: left;
                  color: var(--text-secondary);
                  font-variant-numeric: tabular-nums;
               }
            }
         }
      }
   }
</style>
