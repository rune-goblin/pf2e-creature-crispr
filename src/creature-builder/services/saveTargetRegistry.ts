import type { CreatureSaveTarget } from '../logic/contracts';
import { defaultSaveTarget } from './defaultSaveTarget';

// Registered save targets keyed by id, seeded with CRISPR's built-in default. Consumers add their own
// (e.g. faction folders) via the public API; editCreature() selects which is active per launch. A
// holder (not a prop) so the editor core never has to know which backend persists — it asks the host.
const targets = new Map<string, CreatureSaveTarget>([[defaultSaveTarget.id, defaultSaveTarget]]);
let activeId = defaultSaveTarget.id;

export function registerSaveTarget(target: CreatureSaveTarget): void {
  targets.set(target.id, target);
}

export function getSaveTarget(id: string): CreatureSaveTarget | undefined {
  return targets.get(id);
}

export function getActiveSaveTarget(): CreatureSaveTarget {
  return targets.get(activeId) ?? defaultSaveTarget;
}

/** Select the active target by id; an unknown id falls back to the built-in default. */
export function setActiveSaveTarget(id: string): void {
  activeId = targets.has(id) ? id : defaultSaveTarget.id;
}

/** Test-support: drop consumer registrations and reselect the default. */
export function resetSaveTargets(): void {
  targets.clear();
  targets.set(defaultSaveTarget.id, defaultSaveTarget);
  activeId = defaultSaveTarget.id;
}
