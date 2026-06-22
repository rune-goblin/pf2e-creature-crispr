<script lang="ts">
  import { onMount } from 'svelte';
  import { editorStore } from '@/creature-builder/editor';
  import {
    getAllCreatures,
    deleteCreature,
    duplicateCreature,
    openCreatureActorSheet,
    importCreatureFromActor,
    importCreatureFromCompendium,
    removeCreatureFromCrispr,
    moveCreatureToCrisprFolder,
    revealCreatureInSidebar,
    isCreatureMember,
    loadCreatureForEdit,
    type CreatureEntry
  } from '@/creature-builder/services';
  import Dialog from './baseComponents/Dialog.svelte';
  import ImportCreatureDialog from './dialogs/ImportCreatureDialog.svelte';
  import RowActionsMenu from './widgets/RowActionsMenu.svelte';

  let creatures = $state<CreatureEntry[]>([]);
  let searchTerm = $state('');

  const filteredCreatures = $derived.by(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return creatures;
    return creatures.filter(
      (c) => c.name.toLowerCase().includes(q) || c.creatureType.toLowerCase().includes(q)
    );
  });

  let showImportDialog = $state(false);
  let showDeleteDialog = $state(false);
  let deletingCreature = $state<CreatureEntry | null>(null);
  let showRemoveDialog = $state(false);
  let removingCreature = $state<CreatureEntry | null>(null);
  let isDragOver = $state(false);
  let flashActorId = $state<string | null>(null);

  function flashRow(actorId: string): void {
    flashActorId = actorId;
    requestAnimationFrame(() => {
      document
        .querySelector(`tr[data-actor-id="${actorId}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    window.setTimeout(() => {
      if (flashActorId === actorId) flashActorId = null;
    }, 1400);
  }

  function refreshCreatures(): void {
    creatures = getAllCreatures();
  }

  onMount(() => {
    refreshCreatures();
    Hooks.on('createActor', refreshCreatures);
    Hooks.on('updateActor', refreshCreatures);
    Hooks.on('deleteActor', refreshCreatures);
    return () => {
      Hooks.off('createActor', refreshCreatures);
      Hooks.off('updateActor', refreshCreatures);
      Hooks.off('deleteActor', refreshCreatures);
    };
  });

  function handleCreate(): void {
    editorStore.startCreate();
  }

  function handleEdit(creature: CreatureEntry): void {
    const loaded = loadCreatureForEdit(creature.actorId);
    if (loaded) editorStore.startEdit(loaded);
  }

  function handleOpenSheet(creature: CreatureEntry): void {
    openCreatureActorSheet(creature.actorId);
  }

  async function handleDuplicate(creature: CreatureEntry): Promise<void> {
    try {
      const newActorId = await duplicateCreature(creature.actorId);
      ui.notifications?.info('Duplicated creature');
      refreshCreatures();
      const loaded = loadCreatureForEdit(newActorId);
      if (loaded) editorStore.startEdit(loaded);
    } catch (error) {
      console.error('[Creature CRISPR] Failed to duplicate creature:', error);
      ui.notifications?.error('Failed to duplicate creature');
    }
  }

  function confirmDelete(creature: CreatureEntry): void {
    deletingCreature = creature;
    showDeleteDialog = true;
  }

  async function handleDelete(): Promise<void> {
    if (!deletingCreature) return;
    try {
      await deleteCreature(deletingCreature.actorId);
      ui.notifications?.info(`Deleted creature: ${deletingCreature.name}`);
      refreshCreatures();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to delete creature:', error);
      ui.notifications?.error('Failed to delete creature');
    }
    deletingCreature = null;
    showDeleteDialog = false;
  }

  function cancelDelete(): void {
    deletingCreature = null;
    showDeleteDialog = false;
  }

  function handleReveal(creature: CreatureEntry): void {
    void revealCreatureInSidebar(creature.actorId);
  }

  async function handleMoveToFolder(creature: CreatureEntry): Promise<void> {
    try {
      await moveCreatureToCrisprFolder(creature.actorId);
      ui.notifications?.info(`Moved "${creature.name}" to the Creature CRISPR folder`);
    } catch (error) {
      console.error('[Creature CRISPR] Failed to move creature to folder:', error);
      ui.notifications?.error('Failed to move creature to folder');
    }
  }

  function confirmRemove(creature: CreatureEntry): void {
    removingCreature = creature;
    showRemoveDialog = true;
  }

  async function handleRemove(): Promise<void> {
    if (!removingCreature) return;
    try {
      await removeCreatureFromCrispr(removingCreature.actorId);
      ui.notifications?.info(`Removed "${removingCreature.name}" from Creature CRISPR`);
      refreshCreatures();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to remove creature from CRISPR:', error);
      ui.notifications?.error('Failed to remove creature from CRISPR');
    }
    removingCreature = null;
    showRemoveDialog = false;
  }

  function cancelRemove(): void {
    removingCreature = null;
    showRemoveDialog = false;
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    isDragOver = true;
  }

  function handleDragLeave(): void {
    isDragOver = false;
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    isDragOver = false;
    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return;
    let data: { type?: string; uuid?: string };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type !== 'Actor' || !data.uuid) return;

    // Reject non-NPC drops up front; the resolved entry carries `type`, so we can
    // warn without an import-then-delete round trip that would log a console error.
    const dropped = fromUuidSync(data.uuid) as { type?: string; id?: string } | null;
    if (dropped && dropped.type !== 'npc') {
      ui.notifications?.warn('Creature CRISPR only works with NPC actor types.');
      return;
    }

    try {
      // Compendium entries are copied in (each drop is a new copy); world actors are linked
      // in place via the data flag, leaving their folder untouched.
      if (data.uuid.startsWith('Compendium.')) {
        await importCreatureFromCompendium(data.uuid);
        ui.notifications?.info('Creature added to Creature CRISPR');
        refreshCreatures();
        return;
      }
      const actorId = (dropped?.id ?? foundry.utils.parseUuid(data.uuid)?.documentId)!;
      const existing = game.actors?.get(actorId);
      if (existing && isCreatureMember(existing)) {
        ui.notifications?.info(`"${existing.name}" is already in Creature CRISPR`);
        flashRow(actorId);
        return;
      }
      await importCreatureFromActor(actorId);
      ui.notifications?.info('Creature added to Creature CRISPR');
      refreshCreatures();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to add dropped creature:', error);
      ui.notifications?.error('Failed to add creature');
    }
  }

  async function handleImportActor(actorId: string): Promise<void> {
    try {
      await importCreatureFromActor(actorId);
      ui.notifications?.info('Creature imported successfully');
      refreshCreatures();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to import creature:', error);
      ui.notifications?.error('Failed to import creature');
    }
  }

  async function handleImportBestiary(uuid: string): Promise<void> {
    try {
      await importCreatureFromCompendium(uuid);
      ui.notifications?.info('Creature imported from bestiary');
      refreshCreatures();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to import from bestiary:', error);
      ui.notifications?.error('Failed to import from bestiary');
    }
  }
</script>

<div class="creature-list-view">
  <header class="list-header">
    <h2><i class="fas fa-dragon"></i> Creatures</h2>
    <div class="header-actions">
      <button class="btn-import" onclick={() => (showImportDialog = true)}>
        <i class="fas fa-file-import"></i>
        Import
      </button>
      <button class="btn-create" onclick={handleCreate}>
        <i class="fas fa-plus"></i>
        Create New
      </button>
    </div>
  </header>

  {#if creatures.length === 0}
    <div
      class="empty-state"
      class:drag-over={isDragOver}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      role="region"
      aria-label="Drop a Pathfinder creature here to import"
    >
      <i class="fas fa-dragon empty-icon"></i>
      <p>No creatures yet</p>
      <p class="hint">Create a new creature, import from the PF2e Bestiary, or drag one from the Compendium browser.</p>
      <div class="empty-actions">
        <button class="btn-create" onclick={handleCreate}>
          <i class="fas fa-plus"></i>
          Create New
        </button>
        <button class="btn-import" onclick={() => (showImportDialog = true)}>
          <i class="fas fa-file-import"></i>
          Import from Bestiary
        </button>
      </div>
    </div>
  {:else}
    <div class="list-toolbar">
      <div class="search-box">
        <i class="fas fa-search search-icon" aria-hidden="true"></i>
        <input
          type="search"
          class="search-input"
          placeholder="Search by name or type…"
          bind:value={searchTerm}
          aria-label="Search creatures by name or type"
        />
      </div>
      <span class="result-count">
        {filteredCreatures.length === creatures.length
          ? `${creatures.length} creature${creatures.length === 1 ? '' : 's'}`
          : `${filteredCreatures.length} of ${creatures.length}`}
      </span>
    </div>
    <div
      class="creatures-table-container"
      class:drag-over={isDragOver}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      role="region"
      aria-label="Drop a Pathfinder creature here to import"
    >
      <table class="creatures-table">
        <thead>
          <tr>
            <th class="thumb-col" aria-label="Portrait"></th>
            <th>Name</th>
            <th class="center">Level</th>
            <th>Type</th>
            <th class="center">AC</th>
            <th class="center">HP</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if filteredCreatures.length === 0}
            <tr class="no-matches-row">
              <td colspan="7">No creatures match “{searchTerm.trim()}”.</td>
            </tr>
          {/if}
          {#each filteredCreatures as creature (creature.actorId)}
            <tr data-actor-id={creature.actorId} class:flash={creature.actorId === flashActorId}>
              <td class="thumb-cell">
                <span class="thumb">
                  <img src={creature.img} alt="" loading="lazy" />
                </span>
              </td>
              <td class="name-cell">
                <button class="name-link" onclick={() => handleOpenSheet(creature)} title="Open actor sheet">
                  {creature.name}
                  <i class="fas fa-external-link-alt link-icon"></i>
                </button>
              </td>
              <td class="center level-cell">{creature.level}</td>
              <td class="type-cell">{creature.creatureType}</td>
              <td class="center stat-cell">{creature.ac}</td>
              <td class="center stat-cell">{creature.hp}</td>
              <td class="actions-cell">
                <div class="row-actions">
                  <button
                    type="button"
                    class="edit-btn"
                    title="Edit creature"
                    aria-label="Edit creature"
                    onclick={() => handleEdit(creature)}
                  >
                    <i class="fas fa-edit"></i>
                  </button>
                  <RowActionsMenu
                    triggerTitle="Creature actions"
                    actions={[
                      { label: 'Duplicate', icon: 'fa-copy', onSelect: () => handleDuplicate(creature) },
                      { label: 'Open actor sheet', icon: 'fa-user', onSelect: () => handleOpenSheet(creature) },
                      { label: 'Reveal in sidebar', icon: 'fa-folder-tree', onSelect: () => handleReveal(creature) },
                      { label: 'Move to CRISPR folder', icon: 'fa-arrow-up-from-bracket', onSelect: () => handleMoveToFolder(creature) },
                      { label: 'Remove from CRISPR', icon: 'fa-minus-circle', onSelect: () => confirmRemove(creature) },
                      { label: 'Delete actor', icon: 'fa-trash', onSelect: () => confirmDelete(creature), danger: true, dividerBefore: true }
                    ]}
                  />
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<ImportCreatureDialog bind:show={showImportDialog} onImportActor={handleImportActor} onImportBestiary={handleImportBestiary} />

<Dialog
  bind:show={showDeleteDialog}
  title="Delete Creature"
  confirmLabel="Delete"
  cancelLabel="Cancel"
  width="400px"
  onConfirm={handleDelete}
  onCancel={cancelDelete}
>
  {#if deletingCreature}
    <p>Are you sure you want to delete <strong>{deletingCreature.name}</strong>?</p>
    <p class="warning-text">This will permanently delete the actor from your world.</p>
  {/if}
</Dialog>

<Dialog
  bind:show={showRemoveDialog}
  title="Remove from Creature CRISPR"
  confirmLabel="Remove"
  cancelLabel="Cancel"
  width="420px"
  onConfirm={handleRemove}
  onCancel={cancelRemove}
>
  {#if removingCreature}
    <p>Remove <strong>{removingCreature.name}</strong> from Creature CRISPR?</p>
    <p class="hint-text">The actor stays in your world — this only takes it off the CRISPR list and discards its saved benchmarks.</p>
  {/if}
</Dialog>

<style lang="scss">
  .creature-list-view {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    padding: var(--space-16);
    overflow: hidden;
  }

  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-16);

    h2 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--space-8);
      color: var(--text-primary);
      font-size: var(--font-xl);

      i {
        color: var(--color-primary);
      }
    }

    .header-actions {
      display: flex;
      gap: var(--space-8);
    }
  }

  .btn-create,
  .btn-import {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-8) var(--space-16);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all 0.2s;

    i {
      font-size: var(--font-sm);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .btn-create {
    background: var(--color-primary);
    color: white;

    &:hover:not(:disabled) {
      background: var(--color-primary-dark);
      transform: translateY(-1px);
    }
  }

  .btn-import {
    background: var(--surface);
    color: var(--text-primary);
    border: 1px solid var(--border-default);

    &:hover:not(:disabled) {
      background: var(--surface-lowest);
    }
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--text-secondary);
    border: 2px dashed transparent;
    border-radius: var(--radius-md);
    transition: border-color 0.15s, background 0.15s;

    &.drag-over {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    }

    .empty-icon {
      font-size: 4rem;
      color: var(--text-tertiary);
      margin-bottom: var(--space-16);
    }

    p {
      margin: 0;
      font-size: var(--font-lg);
    }

    .hint {
      font-size: var(--font-sm);
      color: var(--text-muted);
      margin-top: var(--space-8);
    }

    .empty-actions {
      display: flex;
      gap: var(--space-12);
      margin-top: var(--space-24);
    }
  }

  .creatures-table-container {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    border: 2px dashed transparent;
    border-radius: var(--radius-md);
    transition: border-color 0.15s, background 0.15s;

    &.drag-over {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    }
  }

  .list-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    margin-bottom: var(--space-12);
  }

  .search-box {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
  }

  .search-icon {
    position: absolute;
    left: var(--space-10);
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    font-size: var(--font-sm);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-8) var(--space-10) var(--space-8) var(--space-32);
    background: var(--surface-lowest);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: var(--font-sm);
    transition: border-color var(--transition-fast);

    &::placeholder {
      color: var(--text-muted);
    }

    &:hover {
      border-color: var(--border-strong);
    }

    &:focus {
      outline: none;
      border-color: var(--color-primary);
    }
  }

  .result-count {
    flex: none;
    color: var(--text-muted);
    font-size: var(--font-sm);
    white-space: nowrap;
  }

  .creatures-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: var(--font-md);

    th,
    td {
      padding: var(--space-12) var(--space-16);
      text-align: left;
      border-bottom: 1px solid var(--border-subtle);

      &.center {
        text-align: center;
      }
    }

    th {
      background: var(--overlay);
      color: var(--text-primary);
      font-weight: var(--font-weight-semibold);
      position: sticky;
      top: 0;
      z-index: 1;
    }

    tbody tr {
      transition: background 0.2s;

      &:hover {
        background: var(--hover);
      }

      &.flash {
        animation: crispr-row-flash 1.4s ease-out;
      }
    }

    .thumb-col {
      width: 1%;
    }

    .thumb-cell {
      width: 1%;
      padding: var(--space-6) var(--space-12);
    }

    .thumb {
      display: block;
      width: 36px;
      height: 36px;
      overflow: hidden; // fixed square frame; clips the bottom of the full-width portrait
      border-radius: var(--radius-sm);
      background: var(--surface-low);
    }

    .thumb img {
      display: block;
      width: 36px;
      // Pin width against Foundry's global `img { max-width: 100% }`, which auto-layout would
      // otherwise collapse to a sliver; height stays auto so the portrait keeps its aspect ratio.
      min-width: 36px;
      max-width: 36px;
      height: auto;
    }

    .no-matches-row td {
      text-align: center;
      color: var(--text-muted);
      padding: var(--space-24) var(--space-16);
    }
  }

  @keyframes crispr-row-flash {
    0% {
      background: color-mix(in srgb, var(--color-primary) 45%, transparent);
    }
    100% {
      background: transparent;
    }
  }

  .name-cell {
    .name-link {
      background: none;
      border: none;
      color: var(--text-primary);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      text-decoration: underline;
      text-decoration-style: dotted;
      text-underline-offset: 0.1875rem;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: var(--space-6);

      &:hover {
        text-decoration-style: solid;
        color: var(--color-primary);
      }
    }

    .link-icon {
      font-size: var(--font-xs);
      opacity: 0.7;
    }
  }

  .level-cell {
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
  }

  .type-cell {
    color: var(--text-secondary);
  }

  .stat-cell {
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
  }

  .actions-cell {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .edit-btn {
    all: unset;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: var(--hover);
    }
  }

  .warning-text {
    color: var(--color-warning);
    font-size: var(--font-sm);
  }

  .hint-text {
    color: var(--text-muted);
    font-size: var(--font-sm);
  }
</style>
