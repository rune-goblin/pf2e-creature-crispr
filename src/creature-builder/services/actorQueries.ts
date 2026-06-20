/**
 * Creature Service - Actor query helpers
 *
 * Read-only views over a Foundry actor's items and attributes used by the
 * creature editor and import flows.
 */

import type { NPCPF2e, MeleePF2e } from 'foundry-pf2e';
import type { CreatureStrike, SpecialAbility, DamageModifier, Immunity } from '../logic/models';
import { createDefaultStrike } from '../logic/models';
import { getStatRangesForLevel, statToScalar4 } from '../logic/creatureStatTables';
import { logger } from './logger';
import { parseAbilityDescription, damageToBenchmark, parseDiceFormulaAverage } from '../logic/abilityScaling';
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
  const ranges = getStatRangesForLevel(level);

  return meleeItems.map((item) => {
    const benchmarks: ItemBenchmarkData = (item.getFlag(CREATURE_FLAG, ITEM_BENCHMARK_KEY) as ItemBenchmarkData) || {};
    const damageRolls = item.system?.damageRolls ?? {};

    // Extract damage info from the item
    let damageType = 'slashing';
    let damage = '1d4';
    let persistentDamageType = '';

    const rollEntries = Object.values(damageRolls);
    for (const rollEntry of rollEntries) {
      if (rollEntry.category === 'persistent') {
        persistentDamageType = rollEntry.damageType || 'untyped';
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
      id: item.id,  // Include item ID for updates
      name: item.name || 'Strike',
      attackBenchmark: benchmarks.attackBenchmark ?? statToScalar4(attackBonus, ranges.strikeAttack),
      damageBenchmark: benchmarks.damageBenchmark ?? damageToBenchmark(parseDiceFormulaAverage(damage), level),
      attackBonus,
      damage,
      damageType,
      isRanged: (item.system?.traits?.value as string[] | undefined)?.includes('ranged') || false,
      // Melee range is `{ increment, max }`, not `{ value }`; this read predates the typing
      // pass and yields undefined at runtime — preserved verbatim to avoid a behavior change.
      range: (item.system?.range as { value?: number } | undefined)?.value,
      traits: item.system?.traits?.value || []
    };

    // Add persistent damage info if present
    if (benchmarks.customPersistentFormula) {
      strike.customPersistentFormula = benchmarks.customPersistentFormula;
      strike.persistentDamageType = benchmarks.persistentDamageType || persistentDamageType;
    }
    if (benchmarks.persistentBenchmark !== undefined) {
      strike.persistentBenchmark = benchmarks.persistentBenchmark;
    }

    // Add custom damage formula if present
    if (benchmarks.customDamageFormula) {
      strike.customDamageFormula = benchmarks.customDamageFormula;
    }

    return strike;
  });
}

/**
 * Map PF2e action types to our actionType enum
 */
function mapActionType(pf2eType: string, actionCost?: number): 'action' | 'reaction' | 'free' | 'passive' {
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
interface AbilityItemSystemView {
  description?: { value?: string };
  actionType?: { value?: string };
  actions?: { value?: number };
  category?: string;
  traits?: { value?: string[] };
}

/** The fields of a PF2e action/creature-feat item we read — satisfied by embedded items and by
 *  the temporary documents `Item.fromDropData` builds from a dropped payload alike. */
interface AbilityItemView {
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

interface ItemDropData {
  type?: string;
  uuid?: string;
  data?: unknown;
  crisprAbilityDrag?: boolean;
}

/**
 * Resolve a dropped Foundry Item payload into a SpecialAbility, or null if it isn't an action /
 * creature-ability item. Accepts both `{uuid}` (an item dragged off a sheet) and `{data}`
 * (synthetic source). When the item lives on an actor, its description is back-solved at that
 * actor's level rather than the target's, matching the import flow.
 */
export async function specialAbilityFromDrop(data: ItemDropData, level: number): Promise<SpecialAbility | null> {
  if (!data || data.type !== 'Item') return null;

  type DroppedItem = AbilityItemView & { actor?: { system?: { details?: { level?: { value?: number } } } } };
  let item: DroppedItem | null = null;
  try {
    item = (await Item.fromDropData(data as object)) as unknown as DroppedItem;
  } catch {
    return null;
  }
  if (!item) return null;

  const isAction = item.type === 'action';
  const isCreatureFeat = item.type === 'feat' && item.system?.category === 'creature';
  if (!isAction && !isCreatureFeat) return null;

  const parseLevel = item.actor?.system?.details?.level?.value ?? level;
  const ability = actionItemToSpecialAbility(item, parseLevel);
  // A dropped ability is new to this creature — never reuse the source item's id.
  ability.id = foundry.utils.randomID();
  return ability;
}
