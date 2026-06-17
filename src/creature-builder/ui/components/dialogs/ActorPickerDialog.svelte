<script lang="ts">
   import { type Snippet, untrack } from 'svelte';
   import PickerDialog from '../baseComponents/PickerDialog.svelte';
   import ActorPreview from './ActorPreview.svelte';
   import {
      isBestiaryBrowserAvailable,
      initializeBestiaryTab,
      searchBestiary,
      isCreatureMember
   } from '@/creature-builder/services';
   import { logger } from '@/creature-builder/services/logger';
   import type { Source } from './actorPickerSources';
   import { SourceListLoader } from './sourceListLoader';

   let {
      show = $bindable(false),
      title = 'Pick Actor',
      icon = 'fa-user',
      confirmLabel = 'Select',
      enabledSources = ['world', 'bestiary'],
      defaultSource = 'world',
      excludeCreaturesFolder = false,
      onClose,
      onConfirm
   }: {
      show?: boolean;
      title?: string;
      icon?: string;
      confirmLabel?: string;
      enabledSources?: Source[];
      defaultSource?: Source;
      excludeCreaturesFolder?: boolean;
      onClose?: () => void;
      onConfirm?: (detail: { source: Source; id: string }) => void;
   } = $props();

   // Seeded to a literal, not the reactive `defaultSource` prop; initDialog()
   // authoritatively applies `defaultSource` when the dialog opens.
   let currentSource = $state<Source>('world');
   let searchTerm = $state('');
   let selectedId = $state('');
   let isLoading = $state(false);
   let bestiaryAvailable = $state(false);
   let includeLegacy = $state(false);

   let items = $state<Array<{ id: string; name: string; level?: number }>>([]);

   let searchTimeout: ReturnType<typeof setTimeout> | null = null;

   // Owns the load ordering so a slow bestiary fetch can't write back after the
   // user switched source — a stale write leaves `items` (compendium UUIDs) out of
   // sync with `currentSource`, which mis-routes the import to the world-actor path.
   const loader = new SourceListLoader({
      setItems: (next) => (items = next),
      setLoading: (loading) => (isLoading = loading)
   });

   $effect(() => {
      // Run init once when the dialog opens. untrack() so initDialog's synchronous reads (notably
      // currentSource, via `prevSource = currentSource`) don't make this effect a dependency of
      // currentSource — otherwise switching source tabs re-fires init and snaps back to defaultSource.
      if (show) untrack(() => initDialog());
   });

   let prevSource: Source | null = null;
   $effect(() => {
      if (show && currentSource !== prevSource) {
         prevSource = currentSource;
         searchTerm = '';
         selectedId = '';
         loadCurrentSource();
      }
   });

   async function initDialog(): Promise<void> {
      bestiaryAvailable = isBestiaryBrowserAvailable();
      if (defaultSource === 'bestiary' && !bestiaryAvailable) {
         currentSource = enabledSources.find((s) => s !== 'bestiary') ?? 'world';
      } else {
         currentSource = defaultSource;
      }
      prevSource = currentSource;
      searchTerm = '';
      selectedId = '';
      await loadCurrentSource();
   }

   async function loadCurrentSource(): Promise<void> {
      if (currentSource === 'bestiary') {
         await loadBestiary();
      } else {
         loader.loadSync(getWorldActors());
      }
   }

   async function loadBestiary(): Promise<void> {
      await loader.loadAsync(
         async () => {
            await initializeBestiaryTab();
            const entries = await searchBestiary(
               { search: searchTerm || undefined, includeLegacy },
               200
            );
            return entries.map((e) => ({ id: e.uuid, name: e.name, level: e.level }));
         },
         {
            available: bestiaryAvailable,
            stillCurrent: () => currentSource === 'bestiary',
            onError: (error) => logger.error('[ActorPickerDialog] Failed to search bestiary:', error)
         }
      );
   }

   function getWorldActors(): Array<{ id: string; name: string; level: number }> {
      const all = game.actors?.contents ?? [];

      return all
         .filter((a) => {
            if (a.type !== 'npc') return false;
            if (excludeCreaturesFolder && isCreatureMember(a)) return false;
            return true;
         })
         .map((a) => ({
            id: a.id,
            name: a.name || 'Unknown',
            level: a.system?.details?.level?.value ?? 0
         }))
         .sort((a, b) => a.name.localeCompare(b.name));
   }

   function handleSearchInput(detail: { value: string }): void {
      searchTerm = detail.value;
      if (currentSource === 'bestiary') {
         if (searchTimeout) clearTimeout(searchTimeout);
         searchTimeout = setTimeout(() => loadBestiary(), 250);
      }
   }

   const visibleItems = $derived(
      currentSource === 'bestiary'
         ? items
         : items.filter(
              (i) => !searchTerm.trim() || i.name.toLowerCase().includes(searchTerm.toLowerCase())
           )
   );

   function toggleLegacy(): void {
      includeLegacy = !includeLegacy;
      if (currentSource === 'bestiary') loadBestiary();
   }

   function handleConfirm(detail: { id: string }): void {
      onConfirm?.({ source: currentSource, id: detail.id });
   }

   function handleClose(): void {
      show = false;
      searchTerm = '';
      selectedId = '';
      onClose?.();
   }

   function sourceLabel(s: Source): string {
      switch (s) {
         case 'bestiary': return 'Bestiary';
         case 'world': return 'World Actors';
      }
   }

   function sourceIcon(s: Source): string {
      switch (s) {
         case 'bestiary': return 'fa-book';
         case 'world': return 'fa-globe';
      }
   }

   function visibleSources(): Source[] {
      return enabledSources.filter((s) => s !== 'bestiary' || bestiaryAvailable);
   }
</script>

<PickerDialog
   bind:show
   {title}
   {icon}
   items={visibleItems}
   bind:selectedId
   bind:searchTerm
   searchPlaceholder={currentSource === 'bestiary' ? 'Search bestiary...' : 'Search actors...'}
   {confirmLabel}
   emptyMessage={currentSource === 'bestiary' ? 'No creatures found' : 'No NPC actors available.'}
   {isLoading}
   onSearchInput={handleSearchInput}
   onConfirm={handleConfirm}
   onClose={handleClose}
>
   {#snippet topbar()}
      <div class="source-tabs">
         {#each visibleSources() as src (src)}
            <button
               class="source-tab"
               class:active={currentSource === src}
               onclick={() => (currentSource = src)}
            >
               <i class="fas {sourceIcon(src)}"></i>
               {sourceLabel(src)}
            </button>
         {/each}
      </div>
   {/snippet}

   {#snippet controls()}
      {#if currentSource === 'bestiary' && bestiaryAvailable}
         <label class="legacy-toggle">
            <input type="checkbox" checked={includeLegacy} onchange={toggleLegacy} />
            <span>Include Legacy Content</span>
         </label>
      {/if}
   {/snippet}

   {#snippet preview(selectedId: string)}
      <ActorPreview id={selectedId} source={currentSource} />
   {/snippet}
</PickerDialog>

<style lang="scss">
   .source-tabs {
      display: flex;
      gap: var(--space-4);
   }

   .source-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-6);
      padding: var(--space-10) var(--space-12);
      background: var(--surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-size: var(--font-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
         background: var(--hover);
      }

      &.active {
         background: var(--color-primary);
         border-color: var(--color-primary);
         color: white;
      }

      i {
         font-size: var(--font-sm);
      }
   }

   .legacy-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-8);
      font-size: var(--font-sm);
      color: var(--text-secondary);
      cursor: pointer;

      input[type='checkbox'] {
         width: 1rem;
         height: 1rem;
         cursor: pointer;
      }

      span {
         user-select: none;
      }

      &:hover {
         color: var(--text-primary);
      }
   }
</style>
