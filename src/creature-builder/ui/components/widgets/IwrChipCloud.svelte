<script lang="ts">
  import { humanizeIwrType, type IwrTypeGroup } from '@/creature-builder/logic/iwrTypes';
  import TypeFilterMenu from './TypeFilterMenu.svelte';

  type IwrField = 'exceptions' | 'doubleVs';
  interface IwrEntry {
    type: string;
    value?: number;
    exceptions?: string[];
    doubleVs?: string[];
  }

  let {
    items,
    typeGroups,
    exceptionGroups,
    addLabel,
    valued = false,
    showDoubleVs = false,
    valueRange,
    onAdd,
    onRemove,
    onUpdate
  }: {
    items: IwrEntry[];
    typeGroups: IwrTypeGroup[];
    exceptionGroups: IwrTypeGroup[];
    addLabel: string;
    valued?: boolean;
    showDoubleVs?: boolean;
    valueRange?: { min: number; max: number };
    onAdd: (type: string) => void;
    onRemove: (index: number) => void;
    onUpdate: (index: number, updates: Partial<IwrEntry>) => void;
  } = $props();

  const present = $derived(items.map((i) => i.type));

  function addItem(type: string): void {
    if (!type || present.includes(type)) return;
    onAdd(type);
  }

  function setValue(index: number, raw: string): void {
    onUpdate(index, { value: Math.max(1, parseInt(raw) || 1) });
  }

  function addQual(index: number, field: IwrField, value: string): void {
    const current = items[index][field] ?? [];
    if (!value || current.includes(value)) return;
    onUpdate(index, { [field]: [...current, value] });
  }

  function removeQual(index: number, field: IwrField, value: string): void {
    const next = (items[index][field] ?? []).filter((v) => v !== value);
    onUpdate(index, { [field]: next.length ? next : undefined });
  }

  const has = (entry: IwrEntry, field: IwrField): boolean => (entry[field]?.length ?? 0) > 0;
</script>

{#snippet qualLine(index: number, field: IwrField, label: string, lineClass: string)}
  <div class="chip-qual {lineClass}">
    <span class="qual-label">{label}</span>
    {#each items[index][field] ?? [] as q (q)}
      <span class="subchip">
        {humanizeIwrType(q)}
        <button class="subchip-x" onclick={() => removeQual(index, field, q)} aria-label={`Remove ${label} ${humanizeIwrType(q)}`}>
          <i class="fas fa-times"></i>
        </button>
      </span>
    {/each}
    <TypeFilterMenu
      groups={exceptionGroups}
      disabledValues={items[index][field] ?? []}
      searchPlaceholder="Filter qualities…"
      triggerClass="qual-add {lineClass}"
      triggerTitle={`Add ${label}`}
      onSelect={(value) => addQual(index, field, value)}
    />
  </div>
{/snippet}

<div class="iwr-cloud">
  {#each items as entry, index (index)}
    <div
      class="iwr-chip"
      class:has-except={has(entry, 'exceptions')}
      class:has-double={!has(entry, 'exceptions') && has(entry, 'doubleVs')}
    >
      <div class="iwr-chip-head">
        <span class="iwr-name">{humanizeIwrType(entry.type)}</span>

        {#if valued}
          <input
            class="cc-input iwr-value"
            type="number"
            min="1"
            value={entry.value ?? 1}
            title={valueRange ? `Typical ${valueRange.min}–${valueRange.max} at this level` : undefined}
            onchange={(e) => setValue(index, e.currentTarget.value)}
            aria-label={`${humanizeIwrType(entry.type)} value`}
          />
        {/if}

        <div class="iwr-head-actions">
          {#if !has(entry, 'exceptions')}
            <TypeFilterMenu
              groups={exceptionGroups}
              searchPlaceholder="Filter qualities…"
              triggerClass="add-first except"
              triggerTitle={`Add an exception to ${humanizeIwrType(entry.type)}`}
              onSelect={(value) => addQual(index, 'exceptions', value)}
            />
          {/if}

          {#if showDoubleVs && !has(entry, 'doubleVs')}
            <TypeFilterMenu
              groups={exceptionGroups}
              icon="fa-angles-up"
              searchPlaceholder="Filter qualities…"
              triggerClass="add-first double"
              triggerTitle={`Add a ‘double vs’ quality to ${humanizeIwrType(entry.type)}`}
              onSelect={(value) => addQual(index, 'doubleVs', value)}
            />
          {/if}

          <button
            class="iwr-remove"
            onclick={() => onRemove(index)}
            title="Remove"
            aria-label={`Remove ${humanizeIwrType(entry.type)}`}
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      {#if has(entry, 'exceptions')}
        {@render qualLine(index, 'exceptions', 'except', 'except')}
      {/if}
      {#if showDoubleVs && has(entry, 'doubleVs')}
        {@render qualLine(index, 'doubleVs', 'double vs', 'double')}
      {/if}
    </div>
  {/each}

  <TypeFilterMenu
    variant="button"
    groups={typeGroups}
    disabledValues={present}
    label={items.length ? 'add' : addLabel}
    searchPlaceholder="Filter types…"
    triggerTitle={addLabel}
    onSelect={addItem}
  />
</div>

<style lang="scss">
  .iwr-cloud {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-6);
  }

  .iwr-chip {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--surface-high);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
    animation: chip-in var(--transition-fast);

    &.has-except {
      border-color: var(--border-accent-subtle);
    }

    &.has-double {
      border-color: var(--border-info-darker);
    }
  }

  .iwr-chip-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-6) var(--space-8) var(--space-6) var(--space-12);
  }

  .iwr-name {
    font-size: var(--font-md);
    color: var(--text-primary);
    white-space: nowrap;
  }

  .iwr-value {
    width: 3.25rem;
    min-height: auto;
    padding: var(--space-2) var(--space-4);
    text-align: center;
    font-size: var(--font-sm);
    appearance: textfield;
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }

  .iwr-head-actions {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    margin-left: auto;
  }

  .iwr-remove {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    border-radius: var(--radius-sm);

    &:hover {
      color: var(--text-danger);
    }
  }

  /* The add-first "+" / "⇈" triggers live in a child component (TypeFilterMenu); keep them
     quiet until the row is hovered/focused so the rare exception/double-vs actions don't shout. */
  .iwr-chip :global(.tfm-trigger.add-first) {
    opacity: 0.28;
    transition: opacity var(--transition-fast), color var(--transition-fast);
  }

  .iwr-chip:hover :global(.tfm-trigger.add-first),
  .iwr-chip:focus-within :global(.tfm-trigger.add-first) {
    opacity: 1;
  }

  .chip-qual {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-6);
    padding: var(--space-6) var(--space-8) var(--space-8) var(--space-12);
    border-top: 1px solid var(--border-faint);

    &.except {
      background: var(--surface-accent-lower);
    }

    &.double {
      background: var(--surface-info-lower);
    }
  }

  .qual-label {
    font-size: var(--font-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: var(--space-2);
  }

  .except .qual-label {
    color: var(--text-accent-tertiary);
  }

  .double .qual-label {
    color: var(--text-info-tertiary);
  }

  .subchip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4) var(--space-2) var(--space-8);
    background: var(--surface-lowest);
    border: 1px solid var(--border-faint);
    border-radius: var(--radius-sm);
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }

  .subchip-x {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.65rem;

    &:hover {
      color: var(--text-danger);
    }
  }

  @keyframes chip-in {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .iwr-chip {
      animation: none;
    }
  }
</style>
