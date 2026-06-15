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
    type CreatureEntry
  } from '@/creature-builder/services';
  import Dialog from './baseComponents/Dialog.svelte';
  import ImportCreatureDialog from './dialogs/ImportCreatureDialog.svelte';

  let creatures = $state<CreatureEntry[]>([]);

  let showImportDialog = $state(false);
  let showDeleteDialog = $state(false);
  let deletingCreature = $state<CreatureEntry | null>(null);
  let isDragOver = $state(false);

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
    editorStore.startEditActor(creature.actorId);
  }

  function handleOpenSheet(creature: CreatureEntry): void {
    openCreatureActorSheet(creature.actorId);
  }

  async function handleDuplicate(creature: CreatureEntry): Promise<void> {
    try {
      const newActorId = await duplicateCreature(creature.actorId);
      ui.notifications?.info('Duplicated creature');
      refreshCreatures();
      editorStore.startEditActor(newActorId);
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
    try {
      await importCreatureFromCompendium(data.uuid);
      ui.notifications?.info('Creature imported');
      refreshCreatures();
    } catch (error) {
      console.error('[Creature CRISPR] Failed to import dropped creature:', error);
      ui.notifications?.error('Failed to import creature');
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
            <th>Name</th>
            <th class="center">Level</th>
            <th>Type</th>
            <th class="center">AC</th>
            <th class="center">HP</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each creatures as creature (creature.actorId)}
            <tr>
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
                <button class="action-btn" onclick={() => handleEdit(creature)} aria-label="Edit creature" title="Edit creature">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn" onclick={() => handleDuplicate(creature)} aria-label="Duplicate creature" title="Duplicate creature">
                  <i class="fas fa-copy"></i>
                </button>
                <button class="action-btn" onclick={() => handleOpenSheet(creature)} aria-label="Open actor sheet" title="Open actor sheet">
                  <i class="fas fa-user"></i>
                </button>
                <button class="action-btn danger" onclick={() => confirmDelete(creature)} aria-label="Delete creature" title="Delete creature">
                  <i class="fas fa-trash"></i>
                </button>
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

<style lang="scss">
  .creature-list-view {
    display: flex;
    flex-direction: column;
    height: 100%;
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
    flex: 1;
    overflow: auto;
    border: 2px dashed transparent;
    border-radius: var(--radius-md);
    transition: border-color 0.15s, background 0.15s;

    &.drag-over {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    }
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
    display: flex;
    gap: var(--space-4);
  }

  .action-btn {
    padding: var(--space-6) var(--space-8);
    background: var(--hover);
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    &.danger {
      color: var(--color-danger);

      &:hover {
        background: rgba(255, 107, 107, 0.2);
      }
    }
  }

  .warning-text {
    color: var(--color-warning);
    font-size: var(--font-sm);
  }
</style>
