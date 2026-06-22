<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    expanded = false,
    ontoggle,
    summary,
    actions,
    addLabel,
    addTitle,
    onAdd
  }: {
    label: string;
    expanded?: boolean;
    ontoggle?: () => void;
    summary?: Snippet;
    /** Optional secondary controls rendered left of the standard Add button while expanded. */
    actions?: Snippet;
    /** Standard right-aligned "Add" button shown in the header while expanded. */
    addLabel?: string;
    addTitle?: string;
    onAdd?: () => void;
  } = $props();
</script>

<div
  class="section-header"
  class:expanded
  role="button"
  tabindex="0"
  onclick={() => ontoggle?.()}
  onkeydown={(e) => e.key === 'Enter' && ontoggle?.()}
>
  <div class="section-toggle">
    <i class="fas fa-chevron-right toggle-icon"></i>
    <span>{label}</span>
  </div>
  {#if !expanded && summary}
    <div class="section-summary">{@render summary()}</div>
  {/if}
  {#if expanded && (actions || addLabel)}
    <!-- Header controls sit outside the toggle's hit area; stop the click so it doesn't collapse. -->
    <div class="section-actions" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      {#if actions}{@render actions()}{/if}
      {#if addLabel}
        <button type="button" class="section-add-btn" title={addTitle ?? addLabel} onclick={() => onAdd?.()}>
          <i class="fas fa-plus"></i> {addLabel}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-4) var(--space-8);
    background: var(--section-header-bg);
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, white 6%, var(--section-header-bg));
    }

    &.expanded .toggle-icon {
      transform: rotate(90deg);
    }
  }

  .section-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    flex-shrink: 0;
    color: var(--text-primary);
    font-size: var(--font-lg);
    font-weight: var(--font-weight-semibold);

    span {
      font-family: var(--font-sans);
    }

    .toggle-icon {
      font-size: var(--font-xs);
      color: var(--text-muted);
      transition: transform 0.15s ease;
    }
  }

  .section-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-6);
    flex-shrink: 0;
  }

  /* Standard section-level "Add" — one home (header, top-right) and one look across every
     card-collection section (Offense, Special Abilities, …). */
  .section-add-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-8);
    background: var(--surface-lowest);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--font-xs);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
      background: var(--hover);
      border-color: var(--color-primary);
      color: var(--text-primary);
    }

    i {
      font-size: 0.6rem;
    }
  }

  /* Collapsed-only one-line digest, right-aligned, truncates rather than wrapping. */
  .section-summary {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding-left: var(--space-12);
    font-size: var(--font-sm);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;

    :global(strong) {
      color: var(--text-primary);
      font-weight: var(--font-weight-semibold);
    }
    :global(.sum-key) {
      color: var(--text-muted);
      margin-right: 1px;
    }
    :global(.sum-stat) {
      margin-right: var(--space-10);
    }
    :global(.sum-muted) {
      font-style: italic;
      opacity: 0.8;
    }
  }
</style>
