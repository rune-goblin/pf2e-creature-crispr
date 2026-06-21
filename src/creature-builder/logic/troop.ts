import type { DamageModifier } from './models';
import { getTroopWeaknessValues } from './creatureStatTables';

// PF2e represents a troop with the `troop` trait plus area/splash-damage weaknesses (see any core
// troop statblock). These derive from the creature's troop flag + level rather than being stored as
// editable entries, so the editor shows them read-only and a save target stamps them at persist time.

const TROOP_TRAIT = 'troop';
const TROOP_WEAKNESS_TYPES = ['area-damage', 'splash-damage'];

export function withTroopTrait(traits: string[]): string[] {
  return traits.includes(TROOP_TRAIT) ? [...traits] : [...traits, TROOP_TRAIT];
}

/** The area/splash weaknesses every troop carries at a given level (PF2e GMG guideline values). */
export function troopWeaknesses(level: number): DamageModifier[] {
  const { area, splash } = getTroopWeaknessValues(level);
  return [
    { type: 'area-damage', value: area },
    { type: 'splash-damage', value: splash }
  ];
}

/** Overlay the level-derived troop weaknesses onto the creature's own; troop values win for area/splash. */
export function withTroopWeaknesses(existing: DamageModifier[], level: number): DamageModifier[] {
  const kept = existing.filter((m) => !TROOP_WEAKNESS_TYPES.includes(m.type));
  return [...kept, ...troopWeaknesses(level)];
}
