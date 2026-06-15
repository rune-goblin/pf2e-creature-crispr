<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    expanded = false,
    ontoggle,
    summary
  }: {
    label: string;
    expanded?: boolean;
    ontoggle?: () => void;
    summary?: Snippet;
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
  {@render summary?.()}
</div>

<style lang="scss">
  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    padding: var(--space-4) var(--space-8);
    cursor: pointer;

    &:hover {
      background: var(--hover-low);
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
    font-size: var(--font-md);
    font-weight: var(--font-weight-semibold);

    .toggle-icon {
      font-size: var(--font-xs);
      color: var(--text-muted);
      transition: transform 0.15s ease;
    }
  }
</style>
