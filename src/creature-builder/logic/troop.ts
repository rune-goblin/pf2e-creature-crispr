import type { CreatureStrike, DamageModifier, SpecialAbility } from './models';
import type { EditableCreature } from './editableCreature';
import type { CustomAbilityDefinition, TroopConversionOptions, TroopConversionRecipe } from './contracts';
import { calculateEffectiveDamage, getTroopWeaknessValues, parseDiceFormulaAverage, scaleResistanceWeakness } from './creatureStatTables';
import { customAbilityToSpecialAbility, mergeSpecialAbilitiesByName } from './customAbility';
import { TROOP_ACTION_GROUP, buildTroopSweep, buildTroopVolley } from './troopActions';

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

const DEFAULT_LEVEL_DELTA = 5; // published troop = base + 5 (corpus fact 1)
const DEFAULT_NAME_SUFFIX = ' Troop';

// The universal glossary kit as pure @Localize abilities — same name/actionType/description the editor's
// `applyTroopToActor` embeds from the SRD glossary items, so the headless and editor paths converge.
const TROOP_DEFENSES_DEF: CustomAbilityDefinition = {
  slug: 'troop-defenses', name: 'Troop Defenses', img: 'systems/pf2e/icons/actions/Passive.webp',
  group: TROOP_ACTION_GROUP, description: '<p>@Localize[PF2E.NPC.Abilities.Glossary.TroopDefenses]</p>',
  actionType: 'passive', traits: []
};
const TROOP_MOVEMENT_DEF: CustomAbilityDefinition = {
  slug: 'troop-movement', name: 'Troop Movement', img: 'systems/pf2e/icons/actions/Passive.webp',
  group: TROOP_ACTION_GROUP, description: '<p>@Localize[PF2E.NPC.Abilities.Glossary.TroopMovement]</p>',
  actionType: 'passive', traits: []
};
const FORM_UP_DEF: CustomAbilityDefinition = {
  slug: 'form-up', name: 'Form Up', img: 'systems/pf2e/icons/actions/OneAction.webp',
  group: TROOP_ACTION_GROUP, description: '<p>@Localize[PF2E.NPC.Abilities.Glossary.FormUp]</p>',
  actionType: 'action', actions: 1, traits: []
};

function troopKitAbilities(formUp: boolean, level: number): SpecialAbility[] {
  const defs = formUp
    ? [TROOP_DEFENSES_DEF, TROOP_MOVEMENT_DEF, FORM_UP_DEF]
    : [TROOP_DEFENSES_DEF, TROOP_MOVEMENT_DEF];
  return defs.map((def) => customAbilityToSpecialAbility(def, level, def.slug));
}

function strikeEffectiveAverage(strike: CreatureStrike): number {
  const direct = parseDiceFormulaAverage(strike.customDamageFormula ?? strike.damage ?? '');
  return calculateEffectiveDamage(direct, strike.customPersistentFormula ?? strike.persistentDamage);
}

function bestStrike(strikes: CreatureStrike[]): CreatureStrike | undefined {
  return strikes.reduce<CreatureStrike | undefined>(
    (best, s) => (!best || strikeEffectiveAverage(s) > strikeEffectiveAverage(best) ? s : best),
    undefined
  );
}

// Form Up seeds the half-splash weakness variant now, so the divergent splash survives `withTroopWeaknesses`
// at save time (seed-if-missing keeps it). Seed after the level bump so it isn't rescaled.
function seedFormUpWeaknesses(creature: EditableCreature): void {
  const { area, splash } = getTroopWeaknessValues(creature.level, { formUp: true });
  const present = new Set(creature.weaknesses.map((w) => w.type));
  if (!present.has('area-damage')) creature.weaknesses.push({ type: 'area-damage', value: area });
  if (!present.has('splash-damage')) creature.weaknesses.push({ type: 'splash-damage', value: splash });
}

/**
 * Convert an EditableCreature to a troop in place: CRISPR's default engine. Flags it, sizes it, bumps +
 * rescales the level, suffixes the name, and — the v2 core — generates the two published attack actions
 * from the pre-conversion strikes (best melee → 1-to-3 sweep, best ranged → 2-action volley), removes the
 * now-converted strikes (published troops carry zero strike items — corpus fact 2), and seeds the standard
 * glossary kit. The recipe is an override/additive layer (decision 5): its `levelDelta`/`nameSuffix`/
 * `defaultTroopSize` tune the engine, its `generateAbilities` extras merge in by name. The `troop` trait and
 * the standard area/splash weaknesses stay save-time (`troopAdjusted`); Form Up alone pre-seeds its
 * half-splash weakness. Idempotent: re-running on an already-troop re-bumps nothing and duplicates nothing.
 */
export function applyTroopConversion(
  creature: EditableCreature,
  recipe: TroopConversionRecipe = {},
  opts: TroopConversionOptions = {}
): void {
  const alreadyTroop = creature.isTroop === true;

  creature.isTroop = true;
  creature.troopSize = opts.troopSize ?? recipe.defaultTroopSize ?? creature.troopSize ?? 'gargantuan';
  creature.size = creature.troopSize;

  // Level bump is a once-only transform: an already-troop carries the bumped level, so re-converting
  // must not stack another +5 (idempotence).
  if (!alreadyTroop) {
    const levelDelta = opts.levelDelta ?? recipe.levelDelta ?? DEFAULT_LEVEL_DELTA;
    const next = clampLevel(creature.level + levelDelta);
    rescaleCreatureIwr(creature, creature.level, next);
    creature.level = next;
  }

  const suffix = recipe.nameSuffix ?? DEFAULT_NAME_SUFFIX;
  if (suffix && !creature.name.endsWith(suffix)) creature.name = `${creature.name}${suffix}`;

  const generated: SpecialAbility[] = [];
  const melee = bestStrike(creature.strikes.filter((s) => !s.isRanged));
  const ranged = bestStrike(creature.strikes.filter((s) => s.isRanged));
  if (melee) {
    const def = buildTroopSweep(melee, creature.level, { name: opts.sweepName });
    generated.push(customAbilityToSpecialAbility(def, creature.level, def.slug));
  }
  if (ranged) {
    const def = buildTroopVolley(ranged, creature.level, { name: opts.volleyName });
    generated.push(customAbilityToSpecialAbility(def, creature.level, def.slug));
  }
  if (!opts.keepStrikes) creature.strikes = [];

  const formUp = opts.formUp ?? false;
  const kit = troopKitAbilities(formUp, creature.level);
  const extras = recipe.generateAbilities
    ? recipe.generateAbilities(creature).map((def) => customAbilityToSpecialAbility(def, creature.level, def.slug))
    : [];
  creature.specialAbilities = mergeSpecialAbilitiesByName(creature.specialAbilities, [...generated, ...kit, ...extras]);

  if (formUp) seedFormUpWeaknesses(creature);
}
