import { editorStore } from './editor';
import { CreatureCrisprApp } from './ui/CreatureCrisprApp';
import { defaultSaveTarget, setActiveSaveTarget, setActiveProviderFilter, loadCreatureForEdit } from './services';

export interface EditCreatureOptions {
  actorId?: string; // edit this actor; omitted → start a new creature
  saveTargetId?: string; // persistence backend; omitted → CRISPR's built-in default
  abilityProviderIds?: string[]; // providers to surface in the picker; omitted → all registered
}

/**
 * Public entry: bind the editor to a save target + provider filter, then open it editing the given
 * actor (or creating new). Target/filter are set before the load + render so the host load reads the
 * right flag scope and the editor mounts already bound.
 */
export function editCreature(opts: EditCreatureOptions = {}): void {
  setActiveSaveTarget(opts.saveTargetId ?? defaultSaveTarget.id);
  setActiveProviderFilter(opts.abilityProviderIds);

  if (opts.actorId) {
    const creature = loadCreatureForEdit(opts.actorId);
    if (!creature) return; // loadCreatureForEdit already logged the missing actor
    editorStore.startEdit(creature);
  } else {
    editorStore.startCreate();
  }

  CreatureCrisprApp.open();
}

/** The plain entry point — opens CRISPR in its unbound default state (built-in target, all providers). */
export function openEditor(): void {
  setActiveSaveTarget(defaultSaveTarget.id);
  setActiveProviderFilter(undefined);
  CreatureCrisprApp.open();
}
