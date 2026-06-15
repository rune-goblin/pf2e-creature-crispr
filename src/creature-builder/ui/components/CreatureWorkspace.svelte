<script lang="ts">
  import type { CreatureCrisprApp } from '@/creature-builder/ui/CreatureCrisprApp';
  import { editorStore } from '@/creature-builder/editor';
  import CreatureEditor from './CreatureEditor.svelte';
  import CreatureListView from './CreatureListView.svelte';

  // The app shell passes itself in (mount contract); the workspace doesn't need it yet.
  let { app: _app }: { app: CreatureCrisprApp } = $props();
</script>

<div class="creature-workspace">
  {#if editorStore.active}
    <CreatureEditor />
  {:else}
    <CreatureListView />
  {/if}
</div>

<style lang="scss">
  .creature-workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
</style>
