<script lang="ts">
  import BenchmarkButtons from './BenchmarkButtons.svelte';
  import type { BenchmarkLabel, BenchmarkLabel4, BenchmarkLabel3 } from '@/creature-builder/logic/models';

  let {
    label,
    value,
    computedValue = undefined,
    benchmarks = ['terrible', 'low', 'moderate', 'high', 'extreme'],
    use4Benchmark = false,
    use3Benchmark = false,
    subtext = undefined,
    formatValue = (val: number | string | undefined): string => {
      if (val === undefined) return '-';
      if (typeof val === 'string') return val;
      return val >= 0 ? `+${val}` : `${val}`;
    },
    compact = false,
    showRemove = false,
    onselect,
    onedit,
    onremove
  }: {
    label: string;
    value: number;
    computedValue?: number | string | undefined;
    benchmarks?: BenchmarkLabel[] | BenchmarkLabel4[] | BenchmarkLabel3[];
    use4Benchmark?: boolean;
    use3Benchmark?: boolean;
    subtext?: string | undefined;
    formatValue?: (val: number | string | undefined) => string;
    compact?: boolean;
    showRemove?: boolean;
    onselect?: (detail: { value: number }) => void;
    onedit?: (detail: { value: number }) => void;
    onremove?: () => void;
  } = $props();

  let isEditing = $state(false);
  let editValue = $state('');

  function focusOnMount(node: HTMLInputElement) {
    node.focus();
  }

  function startEditing(): void {
    if (computedValue === undefined) return;
    isEditing = true;
    editValue = String(computedValue).replace(/^\+/, '');
  }

  function commitEdit(): void {
    const numValue = parseInt(editValue, 10);
    if (!isNaN(numValue)) onedit?.({ value: numValue });
    isEditing = false;
    editValue = '';
  }

  function cancelEdit(): void {
    isEditing = false;
    editValue = '';
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') cancelEdit();
  }
</script>

<div class="benchmark-selector" class:compact>
  <span class="label">{label}</span>

  <div class="value-container">
    <div class="value" role="button" tabindex="0" onclick={startEditing} onkeydown={(e) => e.key === 'Enter' && startEditing()}>
      {#if isEditing}
        <input
          type="number"
          class="inline-input"
          bind:value={editValue}
          onblur={commitEdit}
          onkeydown={handleKeydown}
          {@attach focusOnMount}
        />
      {:else}
        {formatValue(computedValue)}
      {/if}
    </div>
    {#if subtext}
      <span class="subtext">{subtext}</span>
    {/if}
  </div>

  <BenchmarkButtons {value} {benchmarks} {use4Benchmark} {use3Benchmark} {compact} onselect={(d) => onselect?.(d)} />

  {#if showRemove}
    <button class="remove-btn" aria-label="Remove" title="Remove" onclick={() => onremove?.()}>
      <i class="fas fa-times"></i>
    </button>
  {/if}
</div>

<style lang="scss">
  .benchmark-selector {
    display: flex;
    align-items: center;
    gap: var(--space-10);

    &.compact {
      gap: var(--space-8);
    }
  }

  .label {
    width: 6.5rem;
    font-size: var(--font-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    flex-shrink: 0;
    white-space: nowrap;

    .compact & {
      width: 6.5rem;
    }
  }

  .value-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .subtext {
    font-size: var(--font-xs);
    color: var(--text-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .value {
    width: 3.25rem;
    height: 2.125rem;
    padding: 0 var(--space-6);
    background: var(--surface-lowest);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-size: var(--font-md);
    font-weight: var(--font-weight-bold);
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      border-color: var(--color-primary);
    }

    .compact & {
      width: 3rem;
    }

    .inline-input {
      width: 100%;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-size: inherit;
      font-weight: inherit;
      text-align: center;
      outline: none;
      appearance: textfield;
      -moz-appearance: textfield;

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: var(--text-danger);
    }
  }
</style>
