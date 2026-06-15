<script lang="ts">
   import ActorPickerDialog from './ActorPickerDialog.svelte';
   import type { Source } from './actorPickerSources';

   let {
      show = $bindable(false),
      onImportActor,
      onImportBestiary
   }: {
      show?: boolean;
      onImportActor?: (actorId: string) => void;
      onImportBestiary?: (uuid: string) => void;
   } = $props();

   function handleConfirm(detail: { source: Source; id: string }): void {
      const { source, id } = detail;
      if (source === 'bestiary') onImportBestiary?.(id);
      else onImportActor?.(id);
      show = false;
   }
</script>

<ActorPickerDialog
   bind:show
   title="Import Creature"
   icon="fa-file-import"
   confirmLabel="Import"
   enabledSources={['world', 'bestiary']}
   defaultSource="bestiary"
   excludeCreaturesFolder={true}
   onConfirm={handleConfirm}
/>
