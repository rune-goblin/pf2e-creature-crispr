<script lang="ts">
  import type { AbilityProvider, CustomAbilityDefinition } from '@/creature-builder/logic/contracts';
  import { customAbilityToSpecialAbility } from '@/creature-builder/logic/customAbility';
  import { getAbilityDescription, renderAbilityDescriptionHtml } from '@/creature-builder/logic/abilityScaling';
  import PickerDialog from '../baseComponents/PickerDialog.svelte';

  let {
    show = $bindable(false),
    providers,
    level,
    onPick
  }: {
    show?: boolean;
    providers: AbilityProvider[];
    level: number;
    onPick: (def: CustomAbilityDefinition) => void;
  } = $props();

  let searchTerm = $state('');
  let selectedId = $state('');
  let activeGroup = $state('all');

  // Composite id (providerId:slug) so slugs from different providers can't collide.
  const entries = $derived(
    providers.flatMap((p) =>
      p.abilities.map((def) => ({ id: `${p.id}:${def.slug}`, name: def.name, group: def.group, def }))
    )
  );

  const groupTabs = $derived.by(() => {
    const labels = new Map<string, string>();
    for (const p of providers) for (const g of p.groups ?? []) labels.set(g.key, g.label);
    const keys = [...new Set(entries.map((e) => e.group))];
    return keys.map((key) => ({ key, label: labels.get(key) ?? key }));
  });

  const items = $derived(
    entries
      .filter((e) => activeGroup === 'all' || e.group === activeGroup)
      .filter((e) => {
        const q = searchTerm.trim().toLowerCase();
        return !q || e.name.toLowerCase().includes(q);
      })
      .map((e) => ({ id: e.id, name: e.name }))
  );

  function defFor(id: string): CustomAbilityDefinition | undefined {
    return entries.find((e) => e.id === id)?.def;
  }

  function previewHtml(def: CustomAbilityDefinition): string {
    const ability = customAbilityToSpecialAbility(def, level, 'preview');
    if (ability.descriptionTemplate && ability.scalableValues && ability.scalableValues.length > 0) {
      return renderAbilityDescriptionHtml(ability.descriptionTemplate, ability.scalableValues, level);
    }
    return getAbilityDescription(ability, level);
  }

  const ACTION_LABEL: Record<CustomAbilityDefinition['actionType'], string> = {
    action: 'Action',
    reaction: 'Reaction',
    free: 'Free Action',
    passive: 'Passive'
  };

  function handleConfirm(detail: { id: string }): void {
    const def = defFor(detail.id);
    if (!def) return;
    onPick(def);
    show = false;
  }
</script>

<PickerDialog
  bind:show
  title="Add Special Ability"
  icon="fa-wand-magic-sparkles"
  {items}
  bind:selectedId
  bind:searchTerm
  searchPlaceholder="Search abilities…"
  confirmLabel="Add"
  emptyMessage="No abilities match."
  onConfirm={handleConfirm}
>
  {#snippet controls()}
    {#if groupTabs.length > 1}
      <div class="ability-group-tabs">
        <button type="button" class="group-tab" class:active={activeGroup === 'all'} onclick={() => (activeGroup = 'all')}>
          All
        </button>
        {#each groupTabs as tab (tab.key)}
          <button type="button" class="group-tab" class:active={activeGroup === tab.key} onclick={() => (activeGroup = tab.key)}>
            {tab.label}
          </button>
        {/each}
      </div>
    {/if}
  {/snippet}

  {#snippet preview(id)}
    {@const def = defFor(id)}
    {#if def}
      <div class="ability-preview">
        <div class="ability-preview-head">
          {#if def.img}<img class="ability-preview-img" src={def.img} alt="" />{/if}
          <div class="ability-preview-titles">
            <span class="ability-preview-name">{def.name}</span>
            <span class="ability-preview-type">
              {ACTION_LABEL[def.actionType]}{#if def.actionType === 'action' && def.actions} ({def.actions}){/if}
            </span>
          </div>
        </div>
        {#if def.traits && def.traits.length > 0}
          <div class="ability-preview-traits">
            {#each def.traits as trait (trait)}<span class="trait-tag">{trait}</span>{/each}
          </div>
        {/if}
        <!-- Trusted: kernel renderer output from a registered provider, not free user input. -->
        <div class="ability-preview-desc">{@html previewHtml(def)}</div>
      </div>
    {/if}
  {/snippet}
</PickerDialog>

<style lang="scss">
  .ability-group-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-bottom: var(--space-12);
  }

  .group-tab {
    padding: var(--space-4) var(--space-10);
    background: var(--surface-lowest);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--font-sm);
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
      background: var(--hover);
      color: var(--text-primary);
    }

    &.active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: white;
    }
  }

  .ability-preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    width: 100%;
    overflow-y: auto;
  }

  .ability-preview-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }

  .ability-preview-img {
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-sm);
    object-fit: contain;
    flex-shrink: 0;
  }

  .ability-preview-titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .ability-preview-name {
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .ability-preview-type {
    font-size: var(--font-xs);
    color: var(--text-muted);
  }

  .ability-preview-traits {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);

    .trait-tag {
      padding: var(--space-2) var(--space-6);
      background: var(--surface-low);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-sm);
      font-size: var(--font-xs);
      color: var(--text-secondary);
      text-transform: capitalize;
    }
  }

  .ability-preview-desc {
    font-size: var(--font-sm);
    color: var(--text-secondary);
    line-height: 1.5;

    :global(.scalable-inline) {
      color: var(--color-primary);
      font-weight: var(--font-weight-semibold);
    }
  }
</style>
