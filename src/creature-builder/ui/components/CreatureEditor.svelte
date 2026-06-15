<script lang="ts">
  import { editorStore } from '@/creature-builder/editor';
  import {
    createCreatureActor,
    updateCreature as updateCreatureService,
    updateMeleeItems,
    updateAbilityItems,
    cloneCreatureActor,
    exportCreatureToFile
  } from '@/creature-builder/services';
  import {
    getStatRangesForLevel,
    statToScalar,
    statToScalar4,
    hpToScalar,
    type StatRange
  } from '@/creature-builder/config/creatureStatTables';
  import { type StatType, getStatRangeForType } from '@/creature-builder/editor/creatureEditorUtils';
  import Dialog from './baseComponents/Dialog.svelte';
  import BasicInfoSection from './sections/BasicInfoSection.svelte';
  import AbilitiesSection from './sections/AbilitiesSection.svelte';
  import DefensesSection from './sections/DefensesSection.svelte';
  import SkillsSection from './sections/SkillsSection.svelte';
  import OffenseSection from './sections/OffenseSection.svelte';
  import SpellcastingSection from './sections/SpellcastingSection.svelte';
  import SpecialAbilitiesSection from './sections/SpecialAbilitiesSection.svelte';
  import StatblockCard from './sections/StatblockCard.svelte';

  const creature = $derived(editorStore.creature);
  const mode = $derived(editorStore.mode);
  const computedStats = $derived(editorStore.computedStats);
  const expandedSections = $derived(editorStore.expandedSections);

  let isSaving = $state(false);
  let isExporting = $state(false);
  let showSaveAsDialog = $state(false);
  let saveAsName = $state('');
  let isSavingAs = $state(false);

  async function handleSave(): Promise<void> {
    const c = editorStore.getCreatureForSave();
    if (!c) {
      ui.notifications?.error('Please fix validation errors before saving');
      return;
    }
    isSaving = true;
    try {
      if (mode === 'create' || mode === 'import') {
        await createCreatureActor(c.name, c.level, c.benchmarks, {
          size: c.size,
          creatureType: c.creatureType,
          traits: c.traits,
          portraitImage: c.portraitImage,
          tokenImage: c.tokenImage,
          strikes: c.strikes,
          specialAbilities: c.specialAbilities
        });
      } else if (c.actorId) {
        await updateCreatureService(c.actorId, {
          name: c.name,
          level: c.level,
          benchmarks: c.benchmarks,
          size: c.size,
          creatureType: c.creatureType,
          traits: c.traits,
          portraitImage: c.portraitImage,
          tokenImage: c.tokenImage
        });
        await updateMeleeItems(c.actorId, c.strikes, c.level);
        await updateAbilityItems(c.actorId, c.specialAbilities, c.level);
      }
      ui.notifications?.info(`Saved creature: ${c.name}`);
      editorStore.resetEditor();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to save creature:', error);
      ui.notifications?.error('Failed to save creature');
    } finally {
      isSaving = false;
    }
  }

  function handleOpenSaveAs(): void {
    const c = editorStore.creature;
    if (!c?.actorId) {
      ui.notifications?.error('Save As is only available for existing creatures');
      return;
    }
    saveAsName = `Copy of ${c.name}`;
    showSaveAsDialog = true;
  }

  function handleSaveAsCancel(): void {
    showSaveAsDialog = false;
  }

  // Relies on Foundry's toObject() preserving embedded-item order: the ith source
  // item (within a filter) maps to the ith clone item.
  function buildItemIdMap(sourceActor: any, cloneActor: any, filter: (i: any) => boolean): Record<string, string> {
    const sourceItems = (sourceActor.items?.contents || []).filter(filter);
    const cloneItems = (cloneActor.items?.contents || []).filter(filter);
    const map: Record<string, string> = {};
    const len = Math.min(sourceItems.length, cloneItems.length);
    for (let i = 0; i < len; i++) map[sourceItems[i].id] = cloneItems[i].id;
    return map;
  }

  async function handleSaveAsConfirm(): Promise<void> {
    const c = editorStore.getCreatureForSave();
    if (!c || !c.actorId) {
      ui.notifications?.error('Please fix validation errors before saving');
      return;
    }
    const trimmedName = saveAsName.trim();
    if (!trimmedName) {
      ui.notifications?.error('Please provide a name for the copy');
      return;
    }
    isSavingAs = true;
    try {
      const sourceActorId = c.actorId;
      const newActorId = await cloneCreatureActor(sourceActorId, trimmedName);

      const sourceActor: any = game.actors?.get(sourceActorId);
      const cloneActor: any = game.actors?.get(newActorId);
      if (!sourceActor || !cloneActor) throw new Error('Clone succeeded but new actor could not be resolved');

      const strikeMap = buildItemIdMap(sourceActor, cloneActor, (i) => i.type === 'melee');
      const abilityMap = buildItemIdMap(sourceActor, cloneActor, (i) => {
        if (i.type === 'action') return true;
        if (i.type === 'feat' && i.system?.category === 'creature') return true;
        return false;
      });

      const remappedStrikes = c.strikes.map((s) => (s.id && strikeMap[s.id] ? { ...s, id: strikeMap[s.id] } : s));
      const remappedAbilities = c.specialAbilities.map((a) => (a.id && abilityMap[a.id] ? { ...a, id: abilityMap[a.id] } : a));

      await updateCreatureService(newActorId, {
        name: trimmedName,
        level: c.level,
        benchmarks: c.benchmarks,
        size: c.size,
        creatureType: c.creatureType,
        traits: c.traits,
        portraitImage: c.portraitImage,
        tokenImage: c.tokenImage
      });
      await updateMeleeItems(newActorId, remappedStrikes, c.level);
      await updateAbilityItems(newActorId, remappedAbilities, c.level);

      ui.notifications?.info(`Saved creature copy: ${trimmedName}`);
      showSaveAsDialog = false;
      editorStore.resetEditor();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to save creature copy:', error);
      ui.notifications?.error('Failed to save creature copy');
    } finally {
      isSavingAs = false;
    }
  }

  async function handleExport(): Promise<void> {
    const c = editorStore.getCreatureForSave();
    if (!c || !c.actorId) {
      ui.notifications?.error('Save the creature first before exporting');
      return;
    }
    isExporting = true;
    try {
      await exportCreatureToFile(c.actorId);
      ui.notifications?.info(`Exported creature: ${c.name}`);
    } catch (error) {
      console.error('[Creature CRISPR] Failed to export creature:', error);
      ui.notifications?.error('Failed to export creature');
    } finally {
      isExporting = false;
    }
  }

  async function openOrCreateActor(): Promise<void> {
    const c = editorStore.creature;
    if (c?.actorId) {
      game.actors?.get(c.actorId)?.sheet?.render(true);
      return;
    }
    if (c?.sourceActorUuid) {
      const actor: any = await fromUuid(c.sourceActorUuid);
      actor?.sheet?.render(true);
      return;
    }
    const saveable = editorStore.getCreatureForSave();
    if (!saveable) {
      ui.notifications?.error('Please fix validation errors before opening actor');
      return;
    }
    isSaving = true;
    try {
      const actorId = await createCreatureActor(saveable.name, saveable.level, saveable.benchmarks, {
        size: saveable.size,
        creatureType: saveable.creatureType,
        traits: saveable.traits,
        portraitImage: saveable.portraitImage,
        tokenImage: saveable.tokenImage
      });
      const actor: any = game.actors?.get(actorId);
      actor?.sheet?.render(true);
      editorStore.updateCreature({ actorId, sourceActorUuid: actor?.uuid });
      ui.notifications?.info(`Created creature: ${saveable.name}`);
    } catch (error) {
      console.error('[Creature CRISPR] Failed to create creature:', error);
      ui.notifications?.error('Failed to create creature');
    } finally {
      isSaving = false;
    }
  }

  function openActorSheet(): void {
    const id = editorStore.creature?.actorId;
    if (!id) return;
    game.actors?.get(id)?.sheet?.render(true);
  }

  function getStatRange(statType: StatType): StatRange {
    const c = editorStore.creature;
    if (!c) return { terrible: 0, low: 0, moderate: 0, high: 0, extreme: 0 };
    return getStatRangeForType(c.level, statType);
  }

  function handleBenchmarkSelect(path: string, benchmarkValue: number): void {
    editorStore.updateBenchmark(path, benchmarkValue);
  }

  // Convert a typed display value back to a 0–1 benchmark scalar against the level's stat range.
  function handleBenchmarkEdit(path: string, computedValue: number, statType: string): void {
    const ranges = getStatRangesForLevel(editorStore.creature?.level ?? 1);
    if (statType === 'ability') {
      editorStore.updateBenchmark(path, statToScalar4(computedValue, ranges.abilityMod));
    } else if (statType === 'ac') {
      editorStore.updateBenchmark(path, statToScalar4(computedValue, ranges.ac));
    } else if (statType === 'hp') {
      editorStore.updateBenchmark(path, hpToScalar(computedValue, ranges.hp));
    } else if (statType === 'strikeAttack') {
      editorStore.updateBenchmark(path, statToScalar4(computedValue, ranges.strikeAttack));
    } else {
      editorStore.updateBenchmark(path, statToScalar(computedValue, getStatRange(statType as StatType)));
    }
  }
</script>

{#if creature}
  <div class="creature-editor">
    <header class="editor-header">
      <span class="header-title">
        {#if mode === 'create'}New Creature{:else if mode === 'import'}Import{:else}Edit{/if}
      </span>
      <div class="header-actions">
        <button class="btn-secondary" onclick={() => editorStore.cancelEdit()} disabled={isSaving || isExporting || isSavingAs}>
          Cancel
        </button>
        {#if mode === 'edit' && creature.actorId}
          <button class="btn-secondary" onclick={handleExport} disabled={isSaving || isExporting || isSavingAs}>Export</button>
          <button class="btn-secondary" onclick={handleOpenSaveAs} disabled={isSaving || isExporting || isSavingAs}>Save As...</button>
        {/if}
        <button class="btn-primary" onclick={handleSave} disabled={isSaving || isExporting || isSavingAs}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </header>

    <div class="editor-body">
      <div class="sticky-section">
        <BasicInfoSection
          {creature}
          expanded={expandedSections.has('basic')}
          onToggle={() => editorStore.toggleSection('basic')}
          onUpdateCreature={(d) => editorStore.updateCreature(d)}
          onUpdateLevel={(level) => editorStore.updateLevel(level)}
          onApplyPreset={(key) => editorStore.applyRolePreset(key)}
          onOpenActorSheet={openActorSheet}
          onOpenOrCreateActor={openOrCreateActor}
        />
      </div>

      <div class="editor-sections">
        <div class="section-row">
          <AbilitiesSection
            {creature}
            {computedStats}
            expanded={expandedSections.has('abilities')}
            onToggle={() => editorStore.toggleSection('abilities')}
            onBenchmarkSelect={(d) => handleBenchmarkSelect(d.path, d.value)}
            onBenchmarkEdit={(d) => handleBenchmarkEdit(d.path, d.value, d.statType)}
          />
          <DefensesSection
            {creature}
            {computedStats}
            expanded={expandedSections.has('defenses')}
            onToggle={() => editorStore.toggleSection('defenses')}
            onBenchmarkSelect={(d) => handleBenchmarkSelect(d.path, d.value)}
            onBenchmarkEdit={(d) => handleBenchmarkEdit(d.path, d.value, d.statType)}
            onAddResistance={() => editorStore.addResistance()}
            onRemoveResistance={(i) => editorStore.removeResistance(i)}
            onUpdateResistance={(d) => editorStore.updateResistance(d.index, d.updates)}
            onAddWeakness={() => editorStore.addWeakness()}
            onRemoveWeakness={(i) => editorStore.removeWeakness(i)}
            onUpdateWeakness={(d) => editorStore.updateWeakness(d.index, d.updates)}
          />
        </div>

        <SkillsSection
          {creature}
          {computedStats}
          expanded={expandedSections.has('skills')}
          onToggle={() => editorStore.toggleSection('skills')}
          onBenchmarkSelect={(d) => handleBenchmarkSelect(d.path, d.value)}
          onBenchmarkEdit={(d) => handleBenchmarkEdit(d.path, d.value, d.statType)}
          onAddSkill={(skill) => editorStore.addSkill(skill)}
          onRemoveSkill={(skill) => editorStore.removeSkill(skill)}
          onUpdateSkillBenchmark={(d) => editorStore.updateSkillBenchmark(d.skill, d.benchmark)}
        />

        <OffenseSection
          {creature}
          {computedStats}
          expanded={expandedSections.has('offense')}
          onToggle={() => editorStore.toggleSection('offense')}
          onUpdateBenchmark={(d) => editorStore.updateBenchmark(d.path, d.value)}
          onAddStrike={() => editorStore.addStrike()}
          onRemoveStrike={(i) => editorStore.removeStrike(i)}
          onUpdateStrike={(d) => editorStore.updateStrike(d.index, d.updates)}
          onUpdateStrikeAttackBenchmark={(d) => editorStore.updateStrikeAttackBenchmark(d.index, d.benchmark)}
          onUpdateStrikeDamageBenchmark={(d) => editorStore.updateStrikeDamageBenchmark(d.index, d.benchmark)}
          onUpdateStrikePersistentBenchmark={(d) => editorStore.updateStrikePersistentBenchmark(d.index, d.benchmark)}
          onUpdateStrikePersistentType={(d) => editorStore.updateStrikePersistentType(d.index, d.type)}
          onClearStrikePersistent={(i) => editorStore.clearStrikePersistent(i)}
        />

        <SpellcastingSection
          {creature}
          {computedStats}
          expanded={expandedSections.has('spellcasting')}
          onToggle={() => editorStore.toggleSection('spellcasting')}
          onUpdateBenchmark={(d) => editorStore.updateBenchmark(d.path, d.value)}
          onSetSpellSlotOverride={(d) => editorStore.setSpellSlotOverride(d.rank, d.count)}
          onResetSpellSlotOverride={(d) => editorStore.resetSpellSlotOverride(d.rank)}
        />

        <SpecialAbilitiesSection
          {creature}
          expanded={expandedSections.has('specialAbilities')}
          onToggle={() => editorStore.toggleSection('specialAbilities')}
          onUpdateAbilityScalableOverride={(d) => editorStore.updateAbilityScalableOverride(d.abilityIndex, d.valueIndex, d.override)}
          onUpdateAbilityScalableCustomValue={(d) => editorStore.updateAbilityScalableCustomValue(d.abilityIndex, d.valueIndex, d.customValue)}
          onUpdateAbilityCustomDescriptionTemplate={(d) => editorStore.updateAbilityCustomDescriptionTemplate(d.abilityIndex, d.customTemplate)}
        />

        {#if computedStats}
          <StatblockCard {creature} {computedStats} />
        {/if}
      </div>
    </div>
  </div>
{/if}

<Dialog
  bind:show={showSaveAsDialog}
  title="Save As Copy"
  confirmLabel={isSavingAs ? 'Saving...' : 'Save Copy'}
  cancelLabel="Cancel"
  width="400px"
  confirmDisabled={!saveAsName.trim() || isSavingAs}
  onConfirm={handleSaveAsConfirm}
  onCancel={handleSaveAsCancel}
>
  <div class="save-as-body">
    <label for="save-as-name">New creature name</label>
    <input
      id="save-as-name"
      type="text"
      class="save-as-input"
      bind:value={saveAsName}
      onkeydown={(e) => {
        if (e.key === 'Enter' && saveAsName.trim() && !isSavingAs) handleSaveAsConfirm();
      }}
    />
    <p class="save-as-hint">
      Creates a new actor in the Creature CRISPR folder with the current edits. The original creature is left unchanged.
    </p>
  </div>
</Dialog>

<style lang="scss">
  .creature-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--empty);
  }

  .save-as-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);

    label {
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--text-secondary);
    }

    .save-as-input {
      padding: var(--space-8) var(--space-12);
      background: var(--surface-lowest);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: var(--font-sm);

      &:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary);
      }
    }

    .save-as-hint {
      margin: 0;
      font-size: var(--font-xs);
      color: var(--text-muted);
      font-style: italic;
    }
  }

  .editor-header {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-12) var(--space-16);
    background: var(--surface-lowest);
    border-bottom: 1px solid var(--border-subtle);

    .header-title {
      font-size: var(--font-md);
      font-weight: var(--font-weight-semibold);
      color: var(--text-secondary);
    }

    .header-actions {
      margin-left: auto;
      display: flex;
      gap: var(--space-8);
    }
  }

  .btn-primary {
    padding: var(--space-8) var(--space-16);
    border: none;
    border-radius: var(--radius-md);
    background: var(--btn-primary-bg);
    color: var(--text-primary);
    font-size: var(--font-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--space-6);

    &:hover:not(:disabled) {
      background: var(--btn-primary-hover);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .btn-secondary {
    padding: var(--space-8) var(--space-16);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-md);
    background: var(--surface-lowest);
    color: var(--text-secondary);
    font-size: var(--font-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .editor-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  .sticky-section {
    position: sticky;
    top: calc(-1 * var(--space-16));
    z-index: 10;
    margin: calc(-1 * var(--space-16));
    margin-bottom: 0;
    padding: var(--space-16);
    padding-bottom: var(--space-8);
    background: var(--empty);
  }

  .editor-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .section-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-8);
  }
</style>
