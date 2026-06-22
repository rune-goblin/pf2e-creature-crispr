<script lang="ts">
  import type { EditableCreature } from '@/creature-builder/editor';
  import type { CreatureSense, CreatureSpeeds, SenseAcuity, SenseType } from '@/creature-builder/logic/models';
  import { SENSE_ACUITIES } from '@/creature-builder/logic/models';
  import { humanizeIwrType } from '@/creature-builder/logic/iwrTypes';
  import { getLanguageGroups, getSenseGroups } from '@/creature-builder/ui/vocab';
  import CollapsibleSection from '../widgets/CollapsibleSection.svelte';
  import TypeFilterMenu from '../widgets/TypeFilterMenu.svelte';

  let {
    creature,
    expanded,
    onToggle,
    onUpdateSpeed,
    onAddLanguage,
    onRemoveLanguage,
    onAddSense,
    onUpdateSense,
    onRemoveSense
  }: {
    creature: EditableCreature;
    expanded: boolean;
    onToggle?: () => void;
    onUpdateSpeed?: (type: keyof CreatureSpeeds, value: number | undefined) => void;
    onAddLanguage?: (language: string) => void;
    onRemoveLanguage?: (language: string) => void;
    onAddSense?: (type: SenseType) => void;
    onUpdateSense?: (index: number, updates: Partial<CreatureSense>) => void;
    onRemoveSense?: (index: number) => void;
  } = $props();

  const SPEED_FIELDS: { key: keyof CreatureSpeeds; label: string }[] = [
    { key: 'land', label: 'Land' },
    { key: 'fly', label: 'Fly' },
    { key: 'swim', label: 'Swim' },
    { key: 'climb', label: 'Climb' },
    { key: 'burrow', label: 'Burrow' }
  ];

  const languageGroups = getLanguageGroups();
  const senseGroups = getSenseGroups();

  const speedParts = $derived(
    SPEED_FIELDS
      .filter(({ key }) => key === 'land' || (creature.speeds[key] ?? 0) > 0)
      .map(({ key, label }) => ({ label, value: creature.speeds[key] ?? 0 }))
  );
  const senseSummary = $derived(creature.senses.map((s) => humanizeIwrType(s.type)).join(', '));
  const langSummary = $derived.by(() => {
    const total = creature.languages.length;
    if (total === 0) return '';
    if (creature.languages.includes('common')) {
      const others = total - 1;
      return others > 0 ? `Common +${others} lang` : 'Common';
    }
    return `${total} lang`;
  });

  function handleSpeed(key: keyof CreatureSpeeds, raw: string): void {
    const n = parseInt(raw, 10);
    if (key === 'land') {
      onUpdateSpeed?.('land', Number.isFinite(n) ? Math.max(0, n) : 0);
    } else {
      onUpdateSpeed?.(key, Number.isFinite(n) && n > 0 ? n : undefined);
    }
  }

  function handleSenseRange(index: number, raw: string): void {
    const n = parseInt(raw, 10);
    onUpdateSense?.(index, { range: Number.isFinite(n) && n > 0 ? n : undefined });
  }
</script>

<section class="editor-section">
  <CollapsibleSection label="Movement, Senses & Languages" {expanded} ontoggle={() => onToggle?.()}>
    {#snippet summary()}
      {#each speedParts as { label, value } (label)}<span class="sum-stat">{label} <strong>{value}</strong></span>{/each}
      {#if senseSummary}<span class="sum-stat">{senseSummary}</span>{/if}
      {#if langSummary}<span class="sum-stat">{langSummary}</span>{/if}
    {/snippet}
  </CollapsibleSection>
  {#if expanded}
    <div class="section-body">
      <div class="field-block">
        <span class="field-label">Speed (feet)</span>
        <div class="speed-grid">
          {#each SPEED_FIELDS as { key, label } (key)}
            <label class="speed-field">
              <span>{label}</span>
              <input
                class="cc-input speed-input"
                type="number"
                min="0"
                step="5"
                value={creature.speeds[key] ?? ''}
                placeholder={key === 'land' ? '0' : '—'}
                oninput={(e) => handleSpeed(key, e.currentTarget.value)}
              />
            </label>
          {/each}
        </div>
      </div>

      <div class="field-block">
        <span class="field-label">Senses</span>
        <div class="sense-list">
          {#each creature.senses as sense, index (sense.type)}
            <div class="sense-row">
              <span class="sense-name">{humanizeIwrType(sense.type)}</span>
              <select
                class="cc-select sense-acuity"
                value={sense.acuity ?? 'imprecise'}
                onchange={(e) => onUpdateSense?.(index, { acuity: e.currentTarget.value as SenseAcuity })}
                aria-label={`${humanizeIwrType(sense.type)} acuity`}
              >
                {#each SENSE_ACUITIES as acuity (acuity)}
                  <option value={acuity}>{acuity}</option>
                {/each}
              </select>
              <input
                class="cc-input sense-range"
                type="number"
                min="0"
                step="5"
                value={sense.range ?? ''}
                placeholder="∞ ft"
                oninput={(e) => handleSenseRange(index, e.currentTarget.value)}
                aria-label={`${humanizeIwrType(sense.type)} range in feet`}
              />
              <button class="row-remove" title="Remove sense" aria-label={`Remove ${humanizeIwrType(sense.type)}`} onclick={() => onRemoveSense?.(index)}>
                <i class="fas fa-times"></i>
              </button>
            </div>
          {/each}
          <TypeFilterMenu
            variant="button"
            groups={senseGroups}
            disabledValues={creature.senses.map((s) => s.type)}
            label={creature.senses.length ? 'add' : 'add a sense'}
            searchPlaceholder="Filter senses…"
            triggerTitle="Add a sense"
            onSelect={(value) => onAddSense?.(value as SenseType)}
          />
        </div>
      </div>

      <div class="field-block">
        <span class="field-label">Languages</span>
        <div class="chip-cloud">
          {#each creature.languages as language (language)}
            <span class="chip">
              {humanizeIwrType(language)}
              <button class="chip-x" title="Remove language" aria-label={`Remove ${humanizeIwrType(language)}`} onclick={() => onRemoveLanguage?.(language)}>
                <i class="fas fa-times"></i>
              </button>
            </span>
          {/each}
          <TypeFilterMenu
            variant="button"
            groups={languageGroups}
            disabledValues={creature.languages}
            label={creature.languages.length ? 'add' : 'add a language'}
            searchPlaceholder="Filter languages…"
            triggerTitle="Add a language"
            onSelect={(value) => onAddLanguage?.(value)}
          />
        </div>
      </div>
    </div>
  {/if}
</section>

<style lang="scss">
  .editor-section {
    background: var(--section-body-bg);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .section-body {
    padding: var(--space-16);
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--space-16);
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .field-block + .field-block {
    border-top: 1px solid var(--border-subtle);
    padding-top: var(--space-16);
  }

  .field-label {
    font-size: var(--font-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }

  .speed-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
    gap: var(--space-8);
  }

  .speed-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);

    span {
      font-size: var(--font-xs);
      color: var(--text-muted);
    }
  }

  :global(.speed-input),
  :global(.sense-range) {
    width: 100%;
    appearance: textfield;
    -moz-appearance: textfield;
    text-align: center;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  }

  .sense-list {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-6);
  }

  .sense-row {
    display: flex;
    align-items: center;
    gap: var(--space-8);
    width: 100%;
    padding: var(--space-4) var(--space-8);
    background: var(--surface-high);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }

  .sense-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--font-md);
    color: var(--text-primary);
  }

  :global(.sense-acuity) {
    flex: 0 0 auto;
    width: auto;
  }

  :global(.sense-range) {
    flex: 0 0 auto;
    width: 4.5rem;
  }

  .chip-cloud {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-6);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4) var(--space-2) var(--space-10);
    background: var(--surface-high);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: var(--font-sm);
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .chip-x,
  .row-remove {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    border-radius: var(--radius-sm);

    &:hover {
      color: var(--text-danger);
    }
  }

  .row-remove {
    flex: 0 0 auto;
  }
</style>
