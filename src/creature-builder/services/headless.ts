import type { EditableCreature } from '../logic/editableCreature';
import { validateCreature } from '../logic/editableCreature';
import { stampTroopDefaults } from '../logic/troop';
import { loadCreatureForEdit } from './editorHost';
import { getActiveSaveTarget, getSaveTarget } from './saveTargetRegistry';
import { logger } from './logger';

function resolveTarget(saveTargetId?: string) {
  return (saveTargetId && getSaveTarget(saveTargetId)) || getActiveSaveTarget();
}

/**
 * Headless read: the editor's load path without the UI. Returns a DEEP CLONE of the
 * `loadCreatureForEdit` result so a consumer can mutate it freely — the returned object shares no
 * reference with the store or the actor (a stored flag's benchmarks object, in particular, is not
 * aliased). Throws on a missing actor. Pair with {@link saveEditableCreature} for the submit→operate
 * →save loop the API documents.
 */
export function getEditableCreature(
  actorId: string,
  opts: { saveTargetId?: string } = {}
): EditableCreature {
  const creature = loadCreatureForEdit(actorId, resolveTarget(opts.saveTargetId));
  if (!creature) throw new Error(`getEditableCreature: actor not found (${actorId})`);
  return structuredClone(creature);
}

/**
 * Headless save: the twin of the editor's Save button. Validates via the kernel `validateCreature`
 * and THROWS before any write when invalid, stamps troop defaults, then creates (no `actorId`) or
 * updates through the save target and runs its `onAfterSave` hook. Resolves to the actor id.
 */
export async function saveEditableCreature(
  creature: EditableCreature,
  opts: { saveTargetId?: string } = {}
): Promise<string> {
  const errors = validateCreature(creature);
  if (errors.length) throw new Error(`saveEditableCreature: ${errors.join('; ')}`);

  const target = resolveTarget(opts.saveTargetId);
  stampTroopDefaults(creature);

  if (creature.actorId) {
    await target.updateActor(creature.actorId, creature);
    await target.onAfterSave?.(creature.actorId, creature, 'update');
    logger.info(`Saved creature (update): ${creature.name}`);
    return creature.actorId;
  }

  const actorId = await target.createActor(creature);
  await target.onAfterSave?.(actorId, creature, 'create');
  logger.info(`Saved creature (create): ${creature.name}`);
  return actorId;
}
