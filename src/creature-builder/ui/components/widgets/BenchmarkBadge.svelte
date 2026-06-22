<script lang="ts">
  import type { BenchmarkLabel } from '@/creature-builder/logic/models';

  let {
    tier,
    label,
    active = false,
    approximate = false,
    interactive = false,
    compact = false,
    title,
    onclick
  }: {
    tier: BenchmarkLabel;
    label: string;
    active?: boolean;
    approximate?: boolean;
    interactive?: boolean;
    compact?: boolean;
    title?: string;
    onclick?: () => void;
  } = $props();

  // Static badges always wear their tier colour; interactive ones only once selected.
  const colored = $derived(active || !interactive);
</script>

{#if interactive}
  <button
    type="button"
    class="cc-benchmark-badge cc-benchmark-btn"
    class:compact
    class:colored
    data-bm={tier}
    {title}
    onclick={() => onclick?.()}
  >
    {#if active && approximate}~{/if}{label}
  </button>
{:else}
  <span class="cc-benchmark-badge" class:compact class:colored data-bm={tier} {title}>
    {#if approximate}~{/if}{label}
  </span>
{/if}

<style lang="scss">
  .cc-benchmark-badge {
    box-sizing: border-box;
    display: inline-block;
    width: 2.75rem;
    padding: var(--space-4) 0;
    background: var(--surface-lowest);
    border: 1px solid var(--border-faint);
    border-radius: var(--radius-md);
    color: var(--text-disabled);
    font-size: var(--font-sm);
    font-weight: var(--font-weight-medium);
    text-align: center;
    outline: none;
    transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
  }

  button.cc-benchmark-badge {
    cursor: pointer;
  }

  .compact {
    width: 2.5rem;
    font-size: var(--font-xs);
    padding: var(--space-2) 0;
  }

  button.cc-benchmark-badge:not(.colored):hover {
    background: var(--surface-low);
    color: var(--text-secondary);
  }

  /* Heat ramp: weak→strong reads cool→warm, so a creature's build shape is visible at a glance. */
  .colored {
    color: var(--text-primary);
    font-weight: var(--font-weight-bold);
  }
  .colored[data-bm='terrible'] { background: var(--surface-info-lowest); border-color: var(--border-info-darker);   color: var(--text-info-muted); }
  .colored[data-bm='low']      { background: var(--surface-info-low);    border-color: var(--border-info-subtle);   color: var(--text-info); }
  .colored[data-bm='moderate'] { background: var(--surface-success-low); border-color: var(--border-success-subtle); color: var(--text-success); }
  .colored[data-bm='high']     { background: var(--surface-accent);      border-color: var(--border-accent-subtle); color: var(--text-accent-primary); }
  .colored[data-bm='extreme']  { background: var(--surface-primary);     border-color: var(--border-primary);       color: var(--text-brand); }
</style>
