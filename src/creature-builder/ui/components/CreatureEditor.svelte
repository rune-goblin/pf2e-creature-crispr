<script lang="ts">
  import type { ActorPF2e } from 'foundry-pf2e';
  import { editorStore } from '@/creature-builder/editor';
  import { getActiveSaveTarget, defaultEditorEnvironment, getActiveProviders } from '@/creature-builder/services';
  import {
    getStatRangesForLevel,
    statToScalar,
    statToScalar4,
    hpToScalar,
    type StatRange
  } from '@/creature-builder/logic/creatureStatTables';
  import { type StatType, getStatRangeForType } from '@/creature-builder/editor/creatureEditorUtils';
  import Dialog from './baseComponents/Dialog.svelte';
  import BasicInfoSection from './sections/BasicInfoSection.svelte';
  import AbilitiesSection from './sections/AbilitiesSection.svelte';
  import DefensesSection from './sections/DefensesSection.svelte';
  import SkillsSection from './sections/SkillsSection.svelte';
  import OffenseSection from './sections/OffenseSection.svelte';
  import SpellcastingSection from './sections/SpellcastingSection.svelte';
  import SpecialAbilitiesSection from './sections/SpecialAbilitiesSection.svelte';

  const creature = $derived(editorStore.creature);
  const mode = $derived(editorStore.mode);
  const computedStats = $derived(editorStore.computedStats);
  const expandedSections = $derived(editorStore.expandedSections);

  // All actor I/O flows through the active save target; UI side-effects (notify/pick/ability drop)
  // through the injected env. Read the target per-action so a Phase-3 editCreate() switch is honoured.
  const env = defaultEditorEnvironment;
  // Registered providers' abilities drive the picker; empty (CRISPR default) → no picker button.
  const abilityProviders = getActiveProviders();

  let isSaving = $state(false);
  let isExporting = $state(false);
  let showSaveAsDialog = $state(false);
  let saveAsName = $state('');
  let isSavingAs = $state(false);

  async function handleSave(): Promise<void> {
    const c = editorStore.getCreatureForSave();
    if (!c) {
      env.notify.error('Please fix validation errors before saving');
      return;
    }
    const target = getActiveSaveTarget();
    isSaving = true;
    try {
      if (mode === 'create' || mode === 'import') {
        const actorId = await target.createActor(c);
        await target.onAfterSave?.(actorId, c, 'create');
      } else if (c.actorId) {
        await target.updateActor(c.actorId, c);
        await target.onAfterSave?.(c.actorId, c, 'update');
      }
      env.notify.info(`Saved creature: ${c.name}`);
      editorStore.resetEditor();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to save creature:', error);
      env.notify.error('Failed to save creature');
    } finally {
      isSaving = false;
    }
  }

  function handleOpenSaveAs(): void {
    const c = editorStore.creature;
    if (!c?.actorId) {
      env.notify.error('Save As is only available for existing creatures');
      return;
    }
    saveAsName = `Copy of ${c.name}`;
    showSaveAsDialog = true;
  }

  function handleSaveAsCancel(): void {
    showSaveAsDialog = false;
  }

  async function handleSaveAsConfirm(): Promise<void> {
    const c = editorStore.getCreatureForSave();
    if (!c || !c.actorId) {
      env.notify.error('Please fix validation errors before saving');
      return;
    }
    const trimmedName = saveAsName.trim();
    if (!trimmedName) {
      env.notify.error('Please provide a name for the copy');
      return;
    }
    const target = getActiveSaveTarget();
    isSavingAs = true;
    try {
      const newActorId = await target.cloneActor(c.actorId, trimmedName, c);
      await target.onAfterSave?.(newActorId, c, 'clone');
      env.notify.info(`Saved creature copy: ${trimmedName}`);
      showSaveAsDialog = false;
      editorStore.resetEditor();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to save creature copy:', error);
      env.notify.error('Failed to save creature copy');
    } finally {
      isSavingAs = false;
    }
  }

  async function handleExport(): Promise<void> {
    const c = editorStore.getCreatureForSave();
    if (!c || !c.actorId) {
      env.notify.error('Save the creature first before exporting');
      return;
    }
    const target = getActiveSaveTarget();
    isExporting = true;
    try {
      await target.exportActor?.(c.actorId);
      env.notify.info(`Exported creature: ${c.name}`);
    } catch (error) {
      console.error('[Creature CRISPR] Failed to export creature:', error);
      env.notify.error('Failed to export creature');
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
      const actor = (await fromUuid(c.sourceActorUuid)) as ActorPF2e | null;
      actor?.sheet?.render(true);
      return;
    }
    const saveable = editorStore.getCreatureForSave();
    if (!saveable) {
      env.notify.error('Please fix validation errors before opening actor');
      return;
    }
    const target = getActiveSaveTarget();
    isSaving = true;
    try {
      const actorId = await target.createActor(saveable);
      const actor = game.actors?.get(actorId);
      actor?.sheet?.render(true);
      editorStore.updateCreature({ actorId, sourceActorUuid: actor?.uuid });
      env.notify.info(`Created creature: ${saveable.name}`);
    } catch (error) {
      console.error('[Creature CRISPR] Failed to create creature:', error);
      env.notify.error('Failed to create creature');
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
          {env}
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
            onAddResistance={(type) => editorStore.addResistance(type)}
            onRemoveResistance={(i) => editorStore.removeResistance(i)}
            onUpdateResistance={(d) => editorStore.updateResistance(d.index, d.updates)}
            onAddWeakness={(type) => editorStore.addWeakness(type)}
            onRemoveWeakness={(i) => editorStore.removeWeakness(i)}
            onUpdateWeakness={(d) => editorStore.updateWeakness(d.index, d.updates)}
            onAddImmunity={(type) => editorStore.addImmunity(type)}
            onRemoveImmunity={(i) => editorStore.removeImmunity(i)}
            onUpdateImmunity={(d) => editorStore.updateImmunity(d.index, d.updates)}
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
          {env}
          {abilityProviders}
          expanded={expandedSections.has('specialAbilities')}
          onToggle={() => editorStore.toggleSection('specialAbilities')}
          onUpdateAbilityScalableOverride={(d) => editorStore.updateAbilityScalableOverride(d.abilityIndex, d.valueIndex, d.override)}
          onUpdateAbilityScalableCustomValue={(d) => editorStore.updateAbilityScalableCustomValue(d.abilityIndex, d.valueIndex, d.customValue)}
          onUpdateAbilityCustomDescriptionTemplate={(d) => editorStore.updateAbilityCustomDescriptionTemplate(d.abilityIndex, d.customTemplate)}
          onAddAbility={(a) => editorStore.addSpecialAbility(a)}
        />
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
    flex: 1 1 auto;
    min-height: 0;
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
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
    /* Establishes the responsive context for .section-row (responds to the window
       width, not the viewport — the window is resizable). */
    container-type: inline-size;
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
    /* minmax(0,…) lets columns shrink below their content so wide section
       contents don't blow the grid out and force horizontal scroll. */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-8);
  }

  /* Stack the side-by-side sections once the editor gets narrow (responds to the
     resizable window, not the viewport — see container-type on .editor-body). */
  @container (max-width: 40rem) {
    .section-row {
      grid-template-columns: 1fr;
    }
  }
</style>
