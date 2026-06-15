<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import PickerList from './PickerList.svelte';

  let {
    show = $bindable(false),
    title = '',
    icon = 'fa-list',
    items = [],
    selectedId = $bindable(''),
    searchTerm = $bindable(''),
    searchPlaceholder = 'Search...',
    confirmLabel = 'Select',
    cancelLabel = 'Cancel',
    emptyMessage = 'No items found.',
    width = '48rem',
    isLoading = false,
    isDragOver = false,
    disabled = false,
    onClose,
    onConfirm,
    onSearchInput,
    ondragover,
    ondragleave,
    ondrop,
    topbar,
    controls,
    footerHint,
    footerLeft,
    preview
  }: {
    show?: boolean;
    title?: string;
    icon?: string;
    items?: Array<{ id: string; name: string; level?: number }>;
    selectedId?: string;
    searchTerm?: string;
    searchPlaceholder?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    emptyMessage?: string;
    width?: string;
    isLoading?: boolean;
    isDragOver?: boolean;
    disabled?: boolean;
    onClose?: () => void;
    onConfirm?: (detail: { id: string }) => void;
    onSearchInput?: (detail: { value: string }) => void;
    ondragover?: (event: DragEvent) => void;
    ondragleave?: (event: DragEvent) => void;
    ondrop?: (event: DragEvent) => void;
    topbar?: Snippet;
    controls?: Snippet;
    footerHint?: Snippet;
    footerLeft?: Snippet;
    preview?: Snippet<[string]>;
  } = $props();

  let searchInputRef: HTMLInputElement | null = $state(null);
  let pickerListEl: ReturnType<typeof PickerList> | undefined = $state();

  // Auto-select first item — but only when the LIST itself changes.
  // Tracking by signature prevents resetting selection when the user hovers
  // or clicks a row (which only mutates selectedId, not items).
  let lastListSig = '';
  $effect(() => {
    const sig = items.map((i) => i.id).join('|');
    if (sig !== lastListSig) {
      lastListSig = sig;
      if (items.length === 0) {
        selectedId = '';
      } else if (!items.some((i) => i.id === selectedId)) {
        selectedId = items[0].id;
      }
    }
  });

  $effect(() => {
    if (show) {
      tick().then(() => searchInputRef?.focus());
    }
  });

  function close(): void {
    show = false;
    searchTerm = '';
    selectedId = '';
    lastListSig = '';
    onClose?.();
  }

  function confirm(): void {
    if (!selectedId || disabled) return;
    onConfirm?.({ id: selectedId });
  }

  function handleSearchKeydown(event: KeyboardEvent): void {
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      pickerListEl?.navigate('down');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      pickerListEl?.navigate('up');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      confirm();
    }
  }

  function handleSearchInput(): void {
    onSearchInput?.({ value: searchTerm });
  }
</script>

{#if show}
  <div
    class="dialog-overlay"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="button"
    tabindex="0"
  >
    <div
      class="dialog picker-dialog"
      style="width: {width};"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-label={title}
    >
      <header class="dialog-header">
        <h3><i class="fas {icon}"></i> {title}</h3>
        <button class="close-btn" onclick={close} aria-label="Close" title="Close">
          <i class="fas fa-times"></i>
        </button>
      </header>

      <div class="dialog-content">
        {@render topbar?.()}

        <div class="picker-body">
          <div
            class="picker-main"
            class:drag-over={isDragOver}
            role="region"
            aria-label="{title} search and content"
            ondragover={ondragover}
            ondragleave={ondragleave}
            ondrop={ondrop}
          >
            <input
              type="text"
              class="search-input rm-input"
              placeholder={searchPlaceholder}
              bind:value={searchTerm}
              bind:this={searchInputRef}
              {disabled}
              oninput={handleSearchInput}
              onkeydown={handleSearchKeydown}
            />

            {@render controls?.()}

            <div class="picker-list-wrapper">
              {#if isLoading}
                <div class="loading-placeholder">
                  <i class="fas fa-spinner fa-spin"></i>
                  <p>Loading…</p>
                </div>
              {:else}
                <PickerList
                  bind:this={pickerListEl}
                  {items}
                  bind:selectedId
                  {emptyMessage}
                  clickToCommit={false}
                  oncommit={(d) => {
                    selectedId = d.id;
                    confirm();
                  }}
                />
              {/if}
            </div>

            {@render footerHint?.()}
          </div>

          {#if preview}
            <div class="picker-preview-pane">
              {@render preview(selectedId)}
            </div>
          {/if}
        </div>
      </div>

      <div class="dialog-footer">
        <div class="dialog-footer-left">
          {@render footerLeft?.()}
        </div>
        <div class="dialog-footer-buttons">
          <button class="btn-secondary" onclick={close}>{cancelLabel}</button>
          <button
            class="btn-primary"
            disabled={!selectedId || disabled}
            onclick={confirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
   .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
   }

   .dialog {
      background: var(--surface-high);
      border: 2px solid var(--border-medium);
      border-radius: var(--radius-xl);
      max-width: 90vw;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 0.5rem 2rem var(--overlay-high);
   }

   .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-16);
      border-bottom: 1px solid var(--border-subtle);

      h3 {
         margin: 0;
         display: flex;
         align-items: center;
         gap: var(--space-8);
         font-size: var(--font-lg);
         color: var(--text-primary);

         i {
            color: var(--color-primary);
         }
      }

      .close-btn {
         background: none;
         border: none;
         color: var(--text-muted);
         cursor: pointer;
         padding: var(--space-4);

         &:hover {
            color: var(--text-primary);
         }
      }
   }

   .dialog-content {
      padding: var(--space-16);
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: var(--space-12);
   }

   .picker-body {
      display: flex;
      gap: var(--space-16);
      flex: 1;
      min-height: 0;
   }

   .picker-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      border-radius: var(--radius-md);
      transition: background 0.15s, box-shadow 0.15s;

      &.drag-over {
         background: color-mix(in srgb, var(--color-primary) 8%, transparent);
         box-shadow: inset 0 0 0 2px var(--color-primary);
      }
   }

   .search-input {
      width: 100%;
      padding: var(--space-10) var(--space-12);
      background: var(--overlay);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: var(--font-md);
      margin-bottom: var(--space-12);

      &:focus {
         outline: none;
         border-color: var(--color-primary);
      }

      &:disabled {
         opacity: 0.7;
         cursor: progress;
      }
   }

   .picker-list-wrapper {
      flex: 1;
      height: 24rem;
      min-height: 24rem;
      max-height: 24rem;
      display: flex;
      overflow: hidden;
   }

   .picker-list-wrapper :global(.picker-list) {
      flex: 1;
      width: 100%;
   }

   .loading-placeholder {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-32);
      color: var(--text-muted);

      i {
         font-size: var(--font-xl);
         margin-bottom: var(--space-8);
      }

      p {
         margin: 0;
      }
   }

   .picker-preview-pane {
      flex: 0 0 14rem;
      min-width: 0;
      display: flex;
   }

   .picker-preview-pane > :global(*) {
      flex: 1;
   }

   .dialog-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-16);
      padding: var(--space-16);
      border-top: 1px solid var(--border-subtle);
   }

   .dialog-footer-buttons {
      display: flex;
      gap: var(--space-8);
      margin-left: auto;
   }

   .btn-secondary,
   .btn-primary {
      padding: var(--space-8) var(--space-16);
      border-radius: var(--radius-md);
      font-size: var(--font-md);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: all 0.2s;
      min-width: 5rem;
   }

   .btn-secondary {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border-medium);

      &:hover {
         background: var(--hover-low);
         border-color: var(--border-strong);
      }
   }

   .btn-primary {
      background: var(--btn-secondary-bg);
      color: var(--text-primary);
      border: 1px solid var(--border-medium);

      &:hover:not(:disabled) {
         background: var(--btn-secondary-hover);
         border-color: var(--border-strong);
      }

      &:disabled {
         opacity: var(--opacity-disabled);
         cursor: not-allowed;
      }
   }
</style>
