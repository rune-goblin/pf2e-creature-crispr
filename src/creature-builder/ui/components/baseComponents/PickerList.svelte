<script lang="ts">
  import { tick } from 'svelte';

  let {
    items = [],
    selectedId = $bindable(''),
    emptyMessage = 'No matches.',
    clickToCommit = false,
    onselect,
    oncommit
  }: {
    items?: Array<{ id: string; name: string; level?: number }>;
    selectedId?: string;
    emptyMessage?: string;
    clickToCommit?: boolean;
    onselect?: (detail: { id: string }) => void;
    oncommit?: (detail: { id: string }) => void;
  } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  const selectedIndex = $derived(items.findIndex((i) => i.id === selectedId));

  function handleClick(id: string) {
    selectedId = id;
    onselect?.({ id });
    if (clickToCommit) oncommit?.({ id });
  }

  function handleDblClick(id: string) {
    if (clickToCommit) return;
    selectedId = id;
    oncommit?.({ id });
  }

  export function navigate(direction: 'up' | 'down') {
    if (items.length === 0) return;
    const idx = selectedIndex >= 0 ? selectedIndex : 0;
    const next =
      direction === 'down'
        ? (idx + 1) % items.length
        : (idx - 1 + items.length) % items.length;
    selectedId = items[next].id;
    onselect?.({ id: items[next].id });
    scrollSelectedIntoView();
  }

  export function commitSelected() {
    if (selectedId) oncommit?.({ id: selectedId });
  }

  async function scrollSelectedIntoView() {
    await tick();
    const el = containerEl?.querySelector('.picker-item.selected') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }
</script>

<div class="picker-list" bind:this={containerEl}>
  {#if items.length === 0}
    <div class="picker-empty">{emptyMessage}</div>
  {:else}
    {#each items as item (item.id)}
      <button
        class="picker-item"
        class:selected={selectedId === item.id}
        onclick={() => handleClick(item.id)}
        ondblclick={() => handleDblClick(item.id)}
        onmousemove={() => (selectedId = item.id)}
      >
        <span class="picker-item-name">{item.name}</span>
        {#if item.level !== undefined}
          <span class="picker-item-level">Level {item.level}</span>
        {/if}
      </button>
    {/each}
  {/if}
</div>

<style lang="scss">
  .picker-list {
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default) transparent;

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-default);
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb:hover {
      background: var(--border-strong);
    }
  }

  .picker-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-8) var(--space-12);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border-faint);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: background 0.12s;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--hover-low, var(--hover));
    }

    &.selected {
      background: var(--hover);
    }
  }

  .picker-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-item-level {
    color: var(--text-secondary);
    font-size: var(--font-sm);
    font-feature-settings: 'tnum';
    font-variant-numeric: tabular-nums;
  }

  .picker-empty {
    padding: var(--space-24) var(--space-12);
    text-align: center;
    color: var(--color-text-dark-secondary, #7a7971);
    font-style: italic;
    font-size: var(--font-sm);
  }
</style>
