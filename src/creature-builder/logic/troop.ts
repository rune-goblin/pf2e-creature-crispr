import type { DamageModifier, Immunity } from './models';
import { getTroopWeaknessValues } from './creatureStatTables';

// PF2e represents a troop with the `troop` trait, area/splash-damage weaknesses, and immunity to the
// effects that target individuals (see any core troop statblock). These derive from the creature's
// troop flag + level rather than being stored as editable entries, so the editor shows them read-only
// and a save target stamps them at persist time.

const TROOP_TRAIT = 'troop';
const TROOP_WEAKNESS_TYPES = ['area-damage', 'splash-damage'];
const TROOP_IMMUNITY_TYPES = ['death-effects', 'disease', 'paralyzed', 'poison', 'unconscious'];

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

/** The effects every troop is immune to: a formation shrugs off what would fell one of its members. */
export function troopImmunities(): Immunity[] {
  return TROOP_IMMUNITY_TYPES.map((type) => ({ type }));
}

/** Overlay the standard troop immunities onto the creature's own, dropping duplicates. */
export function withTroopImmunities(existing: Immunity[]): Immunity[] {
  const kept = existing.filter((i) => !TROOP_IMMUNITY_TYPES.includes(i.type));
  return [...kept, ...troopImmunities()];
}

/** The subset of a creature the troop derivation reads; `EditableCreature` satisfies it structurally. */
export interface TroopAdjustable {
  isTroop?: boolean;
  level: number;
  traits: string[];
  weaknesses: DamageModifier[];
  immunities: Immunity[];
}

/**
 * Everything a save target must stamp for a troop, in one call: the trait, the level-derived
 * area/splash weaknesses, and the standard immunities. Non-troops pass through untouched, so this
 * is safe to call unconditionally. Idempotent — re-running on an already-stamped troop is a no-op.
 */
export function troopAdjusted(creature: TroopAdjustable): {
  traits: string[];
  weaknesses: DamageModifier[];
  immunities: Immunity[];
} {
  if (!creature.isTroop) {
    return { traits: creature.traits, weaknesses: creature.weaknesses, immunities: creature.immunities };
  }
  return {
    traits: withTroopTrait(creature.traits),
    weaknesses: withTroopWeaknesses(creature.weaknesses, creature.level),
    immunities: withTroopImmunities(creature.immunities)
  };
}
