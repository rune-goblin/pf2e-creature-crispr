import type { DamageModifier } from './models';
import type { EditableCreature } from './editableCreature';
import type { TroopConversionRecipe } from './contracts';
import { getTroopWeaknessValues, scaleResistanceWeakness } from './creatureStatTables';
import { customAbilityToSpecialAbility, mergeSpecialAbilitiesByName } from './customAbility';

// PF2e represents a troop with the `troop` trait plus authored area/splash-damage weaknesses (see any
// core troop statblock). There is no troop immunity rule — a sweep of all 162 published troops
// (2026-07-17) shows most carry zero immunities and the rest vary by creature, so the kernel seeds
// only missing area/splash weaknesses and stamps nothing else. Authored values always win.

export const TROOP_TRAIT = 'troop';
export const TROOP_WEAKNESS_TYPES: string[] = ['area-damage', 'splash-damage'];

export function withTroopTrait(traits: string[]): string[] {
  return traits.includes(TROOP_TRAIT) ? [...traits] : [...traits, TROOP_TRAIT];
}

/** The area/splash weaknesses a from-scratch troop gets at a given level (PF2e GMG guideline values). */
export function troopWeaknesses(level: number): DamageModifier[] {
  const { area, splash } = getTroopWeaknessValues(level);
  return [
    { type: 'area-damage', value: area },
    { type: 'splash-damage', value: splash }
  ];
}

/**
 * Seed the guideline area/splash weaknesses, but only for types the creature doesn't already author.
 * Published troops carry divergent authored values (e.g. Wolf Pack's splash 5 vs. the table's 4 at
 * level 6); those must survive, so troop-ness can be re-asserted idempotently without clobbering them.
 */
export function withTroopWeaknesses(existing: DamageModifier[], level: number): DamageModifier[] {
  const present = new Set(existing.map((m) => m.type));
  const seeded = troopWeaknesses(level).filter((m) => TROOP_WEAKNESS_TYPES.includes(m.type) && !present.has(m.type));
  return [...existing, ...seeded];
}

/** The subset of a creature the troop derivation reads; `EditableCreature` satisfies it structurally. */
export interface TroopAdjustable {
  isTroop?: boolean;
  level: number;
  traits: string[];
  weaknesses: DamageModifier[];
}

/**
 * Everything a save target must stamp for a troop, in one call: the trait and the seed-if-missing
 * area/splash weaknesses. Non-troops pass through untouched, so this is safe to call
 * unconditionally. Idempotent — re-running on an already-stamped troop is a no-op.
 */
export function troopAdjusted(creature: TroopAdjustable): {
  traits: string[];
  weaknesses: DamageModifier[];
} {
  if (!creature.isTroop) {
    return { traits: creature.traits, weaknesses: creature.weaknesses };
  }
  return {
    traits: withTroopTrait(creature.traits),
    weaknesses: withTroopWeaknesses(creature.weaknesses, creature.level)
  };
}

const clampLevel = (level: number): number => Math.max(-1, Math.min(24, level));

/** Resistances/weaknesses store raw numbers (not benchmarks), so unlike AC/HP/saves they don't
 *  recompute on their own — keep them in step with the level's typical range on a level change. */
export function rescaleCreatureIwr(creature: EditableCreature, fromLevel: number, toLevel: number): void {
  if (fromLevel === toLevel) return;
  for (const r of creature.resistances) r.value = scaleResistanceWeakness(r.value, fromLevel, toLevel);
  for (const w of creature.weaknesses) w.value = scaleResistanceWeakness(w.value, fromLevel, toLevel);
}

/**
 * Apply a provider's Convert-to-Troop recipe to an EditableCreature in place: flag it a troop, set the
 * formation size, bump + rescale the level, suffix the name, and merge in the recipe's generated troop
 * abilities (deduped by name, so re-running seeds nothing new). The single source of truth shared by the
 * editor's `store.convertToTroop` and the headless `convertActorToTroop` service. The trait itself and
 * the area/splash weaknesses are stamped downstream by `troopAdjusted` at save time.
 */
export function applyTroopConversion(creature: EditableCreature, recipe: TroopConversionRecipe = {}): void {
  creature.isTroop = true;
  creature.troopSize = recipe.defaultTroopSize ?? creature.troopSize ?? 'gargantuan';
  creature.size = creature.troopSize;
  if (recipe.levelDelta) {
    const next = clampLevel(creature.level + recipe.levelDelta);
    rescaleCreatureIwr(creature, creature.level, next);
    creature.level = next;
  }
  if (recipe.nameSuffix) creature.name = `${creature.name}${recipe.nameSuffix}`;
  if (recipe.generateAbilities) {
    const generated = recipe.generateAbilities(creature).map((def) => customAbilityToSpecialAbility(def, creature.level, def.slug));
    creature.specialAbilities = mergeSpecialAbilitiesByName(creature.specialAbilities, generated);
  }
}
