import type { CreatureSaveTarget } from '../logic/contracts';
import { defaultSaveTarget } from './defaultSaveTarget';

// The save target the editor persists through. Defaults to CRISPR's built-in target; Phase 3's
// editCreature() will switch it per launch. A holder (not a prop) so the editor core never has to
// know which backend is active — it just asks the host.
let activeTarget: CreatureSaveTarget = defaultSaveTarget;

export function getActiveSaveTarget(): CreatureSaveTarget {
  return activeTarget;
}

export function setActiveSaveTarget(target: CreatureSaveTarget): void {
  activeTarget = target;
}
