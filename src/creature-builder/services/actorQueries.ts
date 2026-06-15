/**
 * Creature Service - Actor query helpers
 *
 * Read-only views over a Foundry actor's items and attributes used by the
 * creature editor and import flows.
 */

import type { CreatureStrike, SpecialAbility, DamageModifier } from '../models';
import { createDefaultStrike } from '../models';
import { getStatRangesForLevel, statToScalar4 } from '../config/creatureStatTables';
import { logger } from './logger';
import { parseAbilityDescription, damageToBenchmark, parseDiceFormulaAverage } from './abilityScaling';
import { findCreaturesFolder } from './crud';
import {
  CREATURE_FLAG,
  CREATURE_DATA_KEY,
  ITEM_BENCHMARK_KEY,
  ABILITY_BENCHMARK_KEY
} from './constants';
import type { ItemBenchmarkData, AbilityBenchmarkData, CreatureActorData } from './types';

/**
 * Get available NPC actors from the world (not in Creatures folder)
 */
export function getAvailableNPCActors(): Array<{ id: string; name: string; level: number }> {
  const game = (globalThis as any).game;
  const actors = game?.actors?.contents || [];
  const creaturesFolder = findCreaturesFolder();

  return actors
    .filter((a: any) => {
      if (a.type !== 'npc') return false;
      // Exclude actors already in Creatures folder
      if (creaturesFolder && a.folder?.id === creaturesFolder.id) return false;
      return true;
    })
    .map((a: any) => ({
      id: a.id,
      name: a.name || 'Unknown',
      level: a.system?.details?.level?.value ?? 0
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}

/**
 * Open a creature's actor sheet
 */
export function openCreatureActorSheet(actorId: string): void {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (actor) {
    actor.sheet?.render(true);
  }
}

/**
 * Open the PF2e item sheet for a specific melee/strike item on an actor.
 * This allows using the native PF2e editor for attack configuration.
 * @param actorId The actor's ID
 * @param strikeName The name of the strike to edit
 * @returns true if the sheet was opened, false if not found
 */
export function openStrikeItemSheet(actorId: string, strikeName: string): boolean {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) {
    logger.warn(`Actor ${actorId} not found`);
    return false;
  }

  // Find the melee item with the matching name
  const items = actor.items?.contents || [];
  const meleeItem = items.find((i: any) =>
    (i.type === 'melee' || i.type === 'strike') && i.name === strikeName
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
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) return [];

  const items = actor.items?.contents || [];
  return items
    .filter((i: any) => i.type === 'melee' || i.type === 'strike')
    .map((i: any) => ({
      id: i.id,
      name: i.name,
      type: i.type
    }));
}

/**
 * Get resistances from an actor's system attributes.
 * PF2e stores these in actor.system.attributes.resistances
 */
export function getResistancesFromActor(actorId: string): DamageModifier[] {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) return [];

  const resistances = actor.system?.attributes?.resistances || [];
  return resistances.map((r: any) => ({
    type: r.type || 'untyped',
    value: r.value ?? 0
  }));
}

/**
 * Get weaknesses from an actor's system attributes.
 * PF2e stores these in actor.system.attributes.weaknesses
 */
export function getWeaknessesFromActor(actorId: string): DamageModifier[] {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) return [];

  const weaknesses = actor.system?.attributes?.weaknesses || [];
  return weaknesses.map((w: any) => ({
    type: w.type || 'untyped',
    value: w.value ?? 0
  }));
}

/**
 * Get strikes from an actor's melee items, including their benchmark data.
 * This reads directly from the actor's embedded items and their flags.
 */
export function getStrikesFromActor(actorId: string): CreatureStrike[] {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) return [];

  const items = actor.items?.contents || [];
  const meleeItems = items.filter((i: any) => i.type === 'melee');

  if (meleeItems.length === 0) {
    return [createDefaultStrike('Melee Strike')];
  }

  const level = actor.system?.details?.level?.value ?? 1;
  const ranges = getStatRangesForLevel(level);

  return meleeItems.map((item: any) => {
    const benchmarks: ItemBenchmarkData = item.getFlag(CREATURE_FLAG, ITEM_BENCHMARK_KEY) || {};
    const damageRolls = item.system?.damageRolls || {};

    // Extract damage info from the item
    let damageType = 'slashing';
    let damage = '1d4';
    let persistentDamageType = '';

    const rollEntries = Object.values(damageRolls) as any[];
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
      isRanged: item.system?.traits?.value?.includes('ranged') || false,
      range: item.system?.range?.value,
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
export function getSpecialAbilitiesFromActor(actorId: string): SpecialAbility[] {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) return [];

  const currentLevel = actor.system?.details?.level?.value ?? 1;
  // Use the stored import-time baseLevel for lazy re-parsing so that
  // `ScalableValue.baseLevel` reflects the true import level — not the current
  // actor level, which may have drifted since import.
  const creatureData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  const parseLevel = creatureData?.baseLevel ?? currentLevel;
  const items = actor.items?.contents || [];

  // Filter for action items and creature feats
  const abilityItems = items.filter((i: any) => {
    if (i.type === 'action') return true;
    // Feats with category 'creature' are creature abilities
    if (i.type === 'feat' && i.system?.category === 'creature') return true;
    return false;
  });

  return abilityItems.map((item: any) => {
    // Get stored benchmark data if present
    const benchmarkData: AbilityBenchmarkData = item.getFlag(CREATURE_FLAG, ABILITY_BENCHMARK_KEY) || {};

    // Get description - either from system.description.value or other common locations
    const rawDescription = item.system?.description?.value || '';

    // Determine action type and action count
    const actionType = mapActionType(
      item.system?.actionType?.value || item.system?.category,
      item.system?.actions?.value
    );
    const actionCount = item.system?.actions?.value as 1 | 2 | 3 | undefined;

    const ability: SpecialAbility = {
      id: item.id,
      name: item.name || 'Unnamed Ability',
      description: rawDescription,
      actionType,
      actions: actionType === 'action' ? actionCount : undefined,
      traits: item.system?.traits?.value || []
    };

    // If we have stored benchmark data, use it
    if (benchmarkData.descriptionTemplate && benchmarkData.scalableValues) {
      ability.descriptionTemplate = benchmarkData.descriptionTemplate;
      ability.scalableValues = benchmarkData.scalableValues;
    } else if (rawDescription) {
      // Parse the description to find scalable values — use baseLevel so the
      // parsed ScalableValues remember the true import level.
      const parsed = parseAbilityDescription(rawDescription, parseLevel);
      if (parsed.scalableValues.length > 0) {
        ability.descriptionTemplate = parsed.template;
        ability.scalableValues = parsed.scalableValues;
      }
    }

    // User-edited template override round-trips independently of the parsed template.
    if (benchmarkData.customDescriptionTemplate) {
      ability.customDescriptionTemplate = benchmarkData.customDescriptionTemplate;
    }

    return ability;
  });
}
