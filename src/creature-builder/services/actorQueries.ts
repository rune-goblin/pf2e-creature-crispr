/**
 * Creature Service - Actor query helpers
 *
 * Read-only views over a Foundry actor's items and attributes used by the
 * creature editor and import flows.
 */

import type { NPCPF2e, MeleePF2e } from 'foundry-pf2e';
import type { CreatureStrike, SpecialAbility, ScalableValue, DamageModifier, Immunity, CreatureSpeeds, CreatureSense, SenseType, SenseAcuity } from '../logic/models';
import { createDefaultStrike, BENCHMARK_VALUES_3 } from '../logic/models';
import { getStatRangesForLevel, statToScalar4 } from '../logic/creatureStatTables';
import { logger } from './logger';
import {
  parseAbilityDescription,
  damageToBenchmark,
  parseDiceFormulaAverage,
  readFastHealingRule,
  healingToBenchmark
} from '../logic/abilityScaling';
import { findCreaturesFolder, isCreatureMember } from './crud';
import {
  CREATURE_FLAG,
  CREATURE_DATA_KEY,
  ITEM_BENCHMARK_KEY,
  ABILITY_BENCHMARK_KEY
} from './constants';
import type { ItemBenchmarkData, AbilityBenchmarkData, CreatureActorData } from './types';

/** World NPCs that aren't already CRISPR members — the import-an-existing-actor candidates. */
export function getAvailableNPCActors(): Array<{ id: string; name: string; level: number }> {
  const actors = game.actors?.contents ?? [];
  const folderId = findCreaturesFolder()?.id ?? null;

  return actors
    .filter((a) => a.type === 'npc' && !isCreatureMember(a, folderId))
    .map((a) => ({
      id: a.id,
      name: a.name || 'Unknown',
      level: a.system?.details?.level?.value ?? 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Open a creature's actor sheet
 */
export function openCreatureActorSheet(actorId: string): void {
  const actor = game.actors?.get(actorId);
  if (actor) {
    actor.sheet?.render(true);
  }
}

/** Open the Actors sidebar, expand the actor's folder ancestry, and flash its entry. */
export async function revealCreatureInSidebar(actorId: string): Promise<void> {
  const actor = game.actors?.get(actorId);
  const directory = ui.actors;
  if (!actor || !directory) return;

  directory.activate();

  // Foundry hides entries under collapsed folders; force the chain open before rendering.
  const folders = game.folders as unknown as { _expanded?: Record<string, boolean> } | undefined;
  if (folders?._expanded) {
    for (let folder = actor.folder; folder; folder = folder.folder) {
      if (folder.uuid) folders._expanded[folder.uuid] = true;
    }
  }
  await directory.render();

  const entry = directory.element?.querySelector<HTMLElement>(`.directory-item[data-entry-id="${actorId}"]`);
  if (!entry) return;
  entry.scrollIntoView({ block: 'center', behavior: 'smooth' });
  entry.animate(
    [{ backgroundColor: 'rgba(107, 33, 168, 0.45)' }, { backgroundColor: 'transparent' }],
    { duration: 1400, easing: 'ease-out' }
  );
}

/**
 * Open the PF2e item sheet for a specific melee/strike item on an actor.
 * This allows using the native PF2e editor for attack configuration.
 * @param actorId The actor's ID
 * @param strikeName The name of the strike to edit
 * @returns true if the sheet was opened, false if not found
 */
export function openStrikeItemSheet(actorId: string, strikeName: string): boolean {
  const actor = game.actors?.get(actorId);
  if (!actor) {
    logger.warn(`Actor ${actorId} not found`);
    return false;
  }

  // Find the melee item with the matching name
  const items = actor.items?.contents ?? [];
  const meleeItem = items.find((i) =>
    (i.type === 'melee' || (i.type as string) === 'strike') && i.name === strikeName
  );

  if (meleeItem) {
    meleeItem.sheet?.render(true);
    return true;
  }

  logger.warn(`Strike "${strikeName}" not found on actor ${actor.name}`);
  return false;
}

/**
 * Get all melee items from an actor for potential editing.
 * Returns basic info about each strike that can be used to open the item sheet.
 */
export function getActorMeleeItems(actorId: string): Array<{ id: string; name: string; type: string }> {
  const actor = game.actors?.get(actorId);
  if (!actor) return [];

  const items = actor.items?.contents ?? [];
  return items
    .filter((i) => i.type === 'melee' || (i.type as string) === 'strike')
    .map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type
    }));
}

/** Exceptions/doubleVs are arrays of type slugs; PF2e also allows custom predicate objects, which we drop (slug-only editor). */
function readSlugList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const slugs = raw.filter((e): e is string => typeof e === 'string');
  return slugs.length ? slugs : undefined;
}

/**
 * Get resistances from an actor's system attributes.
 * PF2e stores these in actor.system.attributes.resistances
 */
export function getResistancesFromActor(actorId: string): DamageModifier[] {
  const actor = game.actors?.get(actorId);
  if (!actor) return [];

  const resistances = actor.system?.attributes?.resistances ?? [];
  return resistances.map((r) => {
    const mod: DamageModifier = { type: r.type || 'untyped', value: r.value ?? 0 };
    const exceptions = readSlugList(r.exceptions);
    const doubleVs = readSlugList(r.doubleVs);
    if (exceptions) mod.exceptions = exceptions;
    if (doubleVs) mod.doubleVs = doubleVs;
    return mod;
  });
}

/**
 * Get weaknesses from an actor's system attributes.
 * PF2e stores these in actor.system.attributes.weaknesses
 */
export function getWeaknessesFromActor(actorId: string): DamageModifier[] {
  const actor = game.actors?.get(actorId);
  if (!actor) return [];

  const weaknesses = actor.system?.attributes?.weaknesses ?? [];
  return weaknesses.map((w) => {
    const mod: DamageModifier = { type: w.type || 'untyped', value: w.value ?? 0 };
    const exceptions = readSlugList(w.exceptions);
    if (exceptions) mod.exceptions = exceptions;
    return mod;
  });
}

/**
 * Get immunities from an actor's system attributes.
 * PF2e stores these in actor.system.attributes.immunities (type + optional exceptions, no value).
 */
export function getImmunitiesFromActor(actorId: string): Immunity[] {
  const actor = game.actors?.get(actorId);
  if (!actor) return [];

  const immunities = actor.system?.attributes?.immunities ?? [];
  return immunities.map((i) => {
    const imm: Immunity = { type: i.type || 'untyped' };
    const exceptions = readSlugList(i.exceptions);
    if (exceptions) imm.exceptions = exceptions;
    return imm;
  });
}

/** Narrow view of the stored NPC source's movement fields (not on the exported source types). */
type ActorSpeedSourceView = {
  _source?: { system?: { attributes?: { speed?: { value?: number; otherSpeeds?: Array<{ type?: string; value?: number }> } } } };
};

/**
 * Get movement speeds from an actor: land off `speed.value`, the rest off `otherSpeeds`.
 * Must read `_source`: PF2e v8 prepares movement onto `system.movement.speeds` and *deletes* the
 * prepared `system.attributes.speed`, so the prepared read silently yields the land-25 default —
 * the bug that stripped every converted troop's fly/swim and flattened land to 25. The stored
 * source keeps this shape and is where `buildSpeedSystem` writes, so it is the lossless location.
 */
export function getSpeedsFromActor(actorId: string): CreatureSpeeds {
  const actor = game.actors?.get(actorId) as unknown as ActorSpeedSourceView | undefined;
  const speed = actor?._source?.system?.attributes?.speed;
  const speeds: CreatureSpeeds = { land: speed?.value ?? 25 };
  for (const other of speed?.otherSpeeds ?? []) {
    if (other.type && other.value != null) {
      (speeds as unknown as Record<string, number>)[other.type] = other.value;
    }
  }
  return speeds;
}

/** Get spoken languages from an actor's `system.details.languages.value`. */
export function getLanguagesFromActor(actorId: string): string[] {
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  const languages = (actor?.system?.details as { languages?: { value?: string[] } } | undefined)?.languages?.value;
  return Array.isArray(languages) ? [...languages] : [];
}

/** Get senses from an actor's `system.perception.senses`, dropping empty acuity/range. */
export function getSensesFromActor(actorId: string): CreatureSense[] {
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  const raw = (actor?.system?.perception as { senses?: Array<{ type?: string; acuity?: string; range?: number | null }> } | undefined)?.senses ?? [];
  const out: CreatureSense[] = [];
  for (const s of raw) {
    if (!s.type) continue;
    const sense: CreatureSense = { type: s.type as SenseType };
    if (s.acuity) sense.acuity = s.acuity as SenseAcuity;
    if (typeof s.range === 'number' && Number.isFinite(s.range) && s.range > 0) sense.range = s.range;
    out.push(sense);
  }
  return out;
}

/** The fields of a PF2e melee item we read — satisfied by embedded items and by the temporary
 *  documents `Item.fromDropData` builds from a dropped payload alike. */
export interface MeleeItemView {
  id: string | null;
  name: string | null;
  type: string;
  system: {
    bonus?: { value?: number };
    damageRolls?: Record<string, { damage?: string; damageType?: string; category?: string | null }>;
    traits?: { value?: string[] };
    range?: { increment?: number | null; max?: number | null } | null;
  };
  getFlag(scope: string, key: string): unknown;
}

/** Every PF2e NPC strike is item-type `melee` — a literal `ranged` trait occurs on 0 of 12,627
 *  system strikes (it survives here only as this module's own legacy convention). Real ranged-ness
 *  lives in trait prefixes (`volley-30`, `thrown-10`, `range-increment-N`, bare `thrown`) and/or
 *  `system.range`, where either field may be null: shortbows are increment-only (1,730 items),
 *  the Wild Hunt Archer's bow is max-only (303). Both halves are load-bearing — 1,887 ranged
 *  strikes carry range data but no ranged trait, ~950 the reverse. */
function isRangedStrike(system: MeleeItemView['system']): boolean {
  const traits = system?.traits?.value ?? [];
  return (
    traits.some((t) => t === 'ranged' || t === 'thrown' || /^(volley|thrown|range)-/.test(t)) ||
    system?.range?.increment != null ||
    system?.range?.max != null
  );
}

/** Convert one PF2e melee item into our CreatureStrike model, preferring stored benchmark data
 *  and falling back to reverse-deriving benchmarks from the item's actual values at `level`. */
export function meleeItemToStrike(
  item: MeleeItemView,
  level: number,
  opts: { recoverUnflaggedPersistent?: boolean } = {}
): CreatureStrike {
  const ranges = getStatRangesForLevel(level);
  const benchmarks: ItemBenchmarkData = (item.getFlag(CREATURE_FLAG, ITEM_BENCHMARK_KEY) as ItemBenchmarkData) || {};
  const damageRolls = item.system?.damageRolls ?? {};

  // Extract damage info from the item
  let damageType = 'slashing';
  let damage = '1d4';
  let persistentDamageType = '';
  let persistentDamageFormula = '';

  const rollEntries = Object.values(damageRolls);
  for (const rollEntry of rollEntries) {
    if (rollEntry.category === 'persistent') {
      persistentDamageType = rollEntry.damageType || 'untyped';
      if (rollEntry.damage) persistentDamageFormula = rollEntry.damage;
    } else {
      if (rollEntry.damage) {
        damage = rollEntry.damage;
      }
      if (rollEntry.damageType) {
        damageType = rollEntry.damageType;
      }
    }
  }

  // Get attack bonus from the item
  const attackBonus = item.system?.bonus?.value ?? 0;

  // No flag (e.g. army NPC strikes) → reverse-engineer the benchmark from the
  // item's actual attack/damage so a save preserves it instead of resetting.
  const strike: CreatureStrike = {
    id: item.id ?? undefined,  // Include item ID for updates
    name: item.name || 'Strike',
    attackBenchmark: benchmarks.attackBenchmark ?? statToScalar4(attackBonus, ranges.strikeAttack),
    damageBenchmark: benchmarks.damageBenchmark ?? damageToBenchmark(parseDiceFormulaAverage(damage), level),
    attackBonus,
    damage,
    damageType,
    isRanged: isRangedStrike(item.system),
    range: item.system?.range?.increment ?? item.system?.range?.max ?? undefined,
    traits: item.system?.traits?.value || []
  };

  // Add persistent damage info if present. The formula (customPersistentFormula) is the source
  // of truth; legacy creatures stored only a persistent scalar, so recover the formula from the
  // saved roll to keep persistent damage from being dropped on the next re-save.
  if (benchmarks.customPersistentFormula) {
    strike.customPersistentFormula = benchmarks.customPersistentFormula;
    strike.persistentDamageType = benchmarks.persistentDamageType || persistentDamageType;
  } else if (benchmarks.persistentBenchmark !== undefined && persistentDamageFormula) {
    strike.customPersistentFormula = persistentDamageFormula;
    strike.persistentDamageType = benchmarks.persistentDamageType || persistentDamageType;
  } else if (opts.recoverUnflaggedPersistent && persistentDamageFormula) {
    // Foreign item (a drop) with no CRISPR flags: keep the persistent rider rather than dropping
    // it. The benchmark is only the "rider enabled" flag — the formula is the source of truth.
    strike.customPersistentFormula = persistentDamageFormula;
    strike.persistentDamageType = persistentDamageType;
    strike.persistentBenchmark = BENCHMARK_VALUES_3.moderate;
  }
  if (benchmarks.persistentBenchmark !== undefined) {
    strike.persistentBenchmark = benchmarks.persistentBenchmark;
  }

  // Add custom damage formula if present
  if (benchmarks.customDamageFormula) {
    strike.customDamageFormula = benchmarks.customDamageFormula;
  }

  return strike;
}

/**
 * Get strikes from an actor's melee items, including their benchmark data.
 * This reads directly from the actor's embedded items and their flags.
 */
export function getStrikesFromActor(actorId: string): CreatureStrike[] {
  // Module only operates on NPCs; narrow so melee items carry their PF2e item type.
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  if (!actor) return [];

  const items = actor.items?.contents ?? [];
  const meleeItems = items.filter((i): i is MeleePF2e<NPCPF2e> => i.type === 'melee');

  if (meleeItems.length === 0) {
    return [createDefaultStrike('Melee Strike')];
  }

  const level = actor.system?.details?.level?.value ?? 1;
  return meleeItems.map((item) => meleeItemToStrike(item as unknown as MeleeItemView, level));
}

/**
 * Map PF2e action types to our actionType enum
 */
export function mapActionType(pf2eType: string, actionCost?: number): 'action' | 'reaction' | 'free' | 'passive' {
  switch (pf2eType) {
    case 'action':
      return 'action';
    case 'reaction':
      return 'reaction';
    case 'free':
      return 'free';
    case 'passive':
      return 'passive';
    default:
      // If no action cost, it's passive
      if (actionCost === undefined || actionCost === null) return 'passive';
      return 'action';
  }
}

/**
 * Get special abilities from an actor's items (actions, creature feats)
 * Includes benchmark data from flags if present, otherwise parses descriptions
 */
/** Tolerant superset of the action/feat `system` fields read below — these item types are heterogeneous and read uniformly. */
export interface AbilityItemSystemView {
  description?: { value?: string };
  actionType?: { value?: string };
  actions?: { value?: number };
  category?: string;
  traits?: { value?: string[] };
  rules?: Array<Record<string, unknown>>;
}

/** The fields of a PF2e action/creature-feat item we read — satisfied by embedded items and by
 *  the temporary documents `Item.fromDropData` builds from a dropped payload alike. */
export interface AbilityItemView {
  id: string | null;
  name: string | null;
  type: string;
  system: AbilityItemSystemView;
  getFlag(scope: string, key: string): unknown;
}

/** Convert one PF2e action/creature-feat item into our SpecialAbility model, preferring stored
 *  benchmark data and falling back to parsing the description at `parseLevel`. */
export function actionItemToSpecialAbility(item: AbilityItemView, parseLevel: number): SpecialAbility {
  const sys = item.system;
  const benchmarkData: AbilityBenchmarkData = (item.getFlag(CREATURE_FLAG, ABILITY_BENCHMARK_KEY) as AbilityBenchmarkData) || {};
  const rawDescription = sys.description?.value || '';
  const actionType = mapActionType(sys.actionType?.value || sys.category || '', sys.actions?.value);
  const actionCount = sys.actions?.value as 1 | 2 | 3 | undefined;

  const ability: SpecialAbility = {
    id: item.id ?? foundry.utils.randomID(),
    name: item.name || 'Unnamed Ability',
    description: rawDescription,
    actionType,
    actions: actionType === 'action' ? actionCount : undefined,
    traits: sys.traits?.value || []
  };

  if (benchmarkData.descriptionTemplate && benchmarkData.scalableValues) {
    ability.descriptionTemplate = benchmarkData.descriptionTemplate;
    ability.scalableValues = benchmarkData.scalableValues;
  } else if (rawDescription) {
    const parsed = parseAbilityDescription(rawDescription, parseLevel);
    if (parsed.scalableValues.length > 0) {
      ability.descriptionTemplate = parsed.template;
      ability.scalableValues = parsed.scalableValues;
    }
  }

  if (benchmarkData.customDescriptionTemplate) {
    ability.customDescriptionTemplate = benchmarkData.customDescriptionTemplate;
  }

  // Fast healing / regeneration: the amount lives on a FastHealing rule element + the item name,
  // not in the description, so it's surfaced as a stand-alone 'healing' scalable value. Prefer a
  // stored healing scalable (carries the user's edits + true import baseLevel) over re-reading the
  // rule. A formula-valued rule (value === null) self-scales in Foundry — mark it but don't edit it.
  const fastHealing = readFastHealingRule(sys.rules);
  if (fastHealing) {
    ability.fastHealing = {
      kind: fastHealing.kind,
      ...(fastHealing.deactivatedBy.length ? { deactivatedBy: fastHealing.deactivatedBy } : {})
    };
    if (fastHealing.value !== null) {
      const stored = (benchmarkData.scalableValues ?? ability.scalableValues)?.find((v) => v.type === 'healing');
      const healingValue: ScalableValue = stored ?? {
        type: 'healing',
        benchmark: healingToBenchmark(fastHealing.value, parseLevel),
        originalValue: String(fastHealing.value),
        baseLevel: parseLevel
      };
      const others = (ability.scalableValues ?? []).filter((v) => v.type !== 'healing');
      ability.scalableValues = [...others, healingValue];
    }
  }

  return ability;
}

/**
 * Get special abilities from an actor's items (actions, creature feats).
 * Includes benchmark data from flags if present, otherwise parses descriptions.
 */
export function getSpecialAbilitiesFromActor(actorId: string): SpecialAbility[] {
  const actor = game.actors?.get(actorId);
  if (!actor) return [];

  const currentLevel = actor.system?.details?.level?.value ?? 1;
  // Use the stored import-time baseLevel for lazy re-parsing so that
  // `ScalableValue.baseLevel` reflects the true import level — not the current
  // actor level, which may have drifted since import.
  const creatureData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  const parseLevel = creatureData?.baseLevel ?? currentLevel;
  const items = actor.items?.contents ?? [];

  const abilityItems = items.filter((i) => {
    if (i.type === 'action') return true;
    if (i.type === 'feat' && (i.system as AbilityItemSystemView).category === 'creature') return true;
    return false;
  });

  return abilityItems.map((item) => actionItemToSpecialAbility(item as unknown as AbilityItemView, parseLevel));
}

