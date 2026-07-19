import { rescaleCreatureIwr } from '../logic/troop';
import { dropPlaceholderStrikes, loadCreatureForEdit } from './editorHost';
import { getActiveSaveTarget, getSaveTarget } from './saveTargetRegistry';
import { logger } from './logger';

/**
 * Headless level rescale: load the actor as an EditableCreature, move it to `level` exactly as the
 * editor's level stepper would (benchmark-driven stats recompute on save; raw IWR values keep their
 * position in the level's typical range; strikes/abilities/spells resync), and persist through a
 * save target. Fills the gap `convertActorToTroop` leaves open: its level bump is once-only and
 * skips already-troop actors, so an imported published troop needing a different level is moved
 * with this. Returns the actor id.
 */
export async function rescaleActorToLevel(
  actorId: string,
  level: number,
  opts: { saveTargetId?: string } = {}
): Promise<string> {
  if (!Number.isFinite(level)) {
    throw new Error(`rescaleActorToLevel: level must be a finite number (${level})`);
  }
  const target = (opts.saveTargetId && getSaveTarget(opts.saveTargetId)) || getActiveSaveTarget();
  const creature = loadCreatureForEdit(actorId, target);
  if (!creature) throw new Error(`rescaleActorToLevel: actor not found (${actorId})`);
  dropPlaceholderStrikes(creature);

  const next = Math.max(-1, Math.min(24, Math.round(level)));
  rescaleCreatureIwr(creature, creature.level, next);
  creature.level = next;

  await target.updateActor(actorId, creature);
  await target.onAfterSave?.(actorId, creature, 'update');
  logger.info(`Rescaled ${creature.name} to level ${next}`);
  return actorId;
}
