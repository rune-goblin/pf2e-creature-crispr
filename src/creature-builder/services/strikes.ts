/**
 * Creature Service - Strike & ability item sync
 *
 * Read-time benchmark flag stamping and editor-driven update operations for
 * melee strike items and special-ability items (actions / creature feats).
 */

import type { CreatureStrike, SpecialAbility } from '../models';
import { calculateStrikeStats, getStatRangesForLevel, statToScalar4 } from '../config/creatureStatTables';
import { logger } from './logger';
import {
  damageToBenchmark,
  parseDiceFormulaAverage,
  parseAbilityDescription,
  renderAbilityDescription
} from './abilityScaling';
import { composeStrikeItemData } from './strikeItemBuilder';
import { composeAbilityItemData } from './abilityItemBuilder';
import {
  CREATURE_FLAG,
  CREATURE_DATA_KEY,
  ITEM_BENCHMARK_KEY,
  ABILITY_BENCHMARK_KEY
} from './constants';
import type { ItemBenchmarkData, AbilityBenchmarkData, CreatureActorData } from './types';

/**
 * Analyze melee items on an actor and add benchmark flags to them.
 * Call this after importing a creature to set up scaling data.
 */
export async function addBenchmarkFlagsToMeleeItems(actor: any, level: number): Promise<void> {
  const meleeItems = actor.items.contents.filter((i: any) => i.type === 'melee');

  if (meleeItems.length === 0) {
    return;
  }

  const updates: any[] = [];

  for (const item of meleeItems) {
    const attackBonus = item.system?.bonus?.value ?? 0;
    const damageRolls = item.system?.damageRolls || {};

    // Extract damage info
    let damageFormula = '';
    let persistentDamageFormula = '';
    let persistentDamageType = '';

    const rollEntries = Object.values(damageRolls) as any[];
    for (const rollEntry of rollEntries) {
      const formula = rollEntry.damage || '';
      const isPersistent = rollEntry.category === 'persistent';

      if (isPersistent) {
        persistentDamageFormula = formula;
        persistentDamageType = rollEntry.damageType || 'untyped';
      } else if (!damageFormula) {
        damageFormula = formula;
      }
    }

    // Calculate benchmarks
    const ranges = getStatRangesForLevel(level);
    const attackBenchmark = statToScalar4(attackBonus, ranges.strikeAttack);
    const avgDamage = parseDiceFormulaAverage(damageFormula);
    const damageBenchmark = damageToBenchmark(avgDamage, level);

    // Build benchmark data
    const benchmarkData: ItemBenchmarkData = {
      attackBenchmark,
      damageBenchmark
    };

    // Add persistent damage info if present
    if (persistentDamageFormula) {
      benchmarkData.customPersistentFormula = persistentDamageFormula;
      benchmarkData.persistentDamageType = persistentDamageType;
    }

    updates.push({
      _id: item.id,
      [`flags.${CREATURE_FLAG}.${ITEM_BENCHMARK_KEY}`]: benchmarkData
    });

    logger.info(`[CreatureService] Added benchmarks to "${item.name}": attack=${attackBenchmark.toFixed(2)}, damage=${damageBenchmark.toFixed(2)}`);
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
  }
}

/**
 * Update melee items on an actor based on strike data from the editor.
 * Updates benchmark flags and recalculates stats.
 * Also handles adding/removing strikes.
 */
export async function updateMeleeItems(
  actorId: string,
  strikes: CreatureStrike[],
  level: number
): Promise<void> {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${actorId}`);
  }

  const existingItems = actor.items.contents.filter((i: any) => i.type === 'melee');
  const existingIds = new Set(existingItems.map((i: any) => i.id));
  const strikeIds = new Set(strikes.filter(s => s.id).map(s => s.id));

  // Items to delete (existing items not in strikes)
  const toDelete = existingItems
    .filter((i: any) => !strikeIds.has(i.id))
    .map((i: any) => i.id);

  // Strikes to create (no id = new strike)
  const toCreate = strikes.filter(s => !s.id);

  // Strikes to update (have id and it exists)
  const toUpdate = strikes.filter(s => s.id && existingIds.has(s.id));

  // Delete removed items
  if (toDelete.length > 0) {
    await actor.deleteEmbeddedDocuments('Item', toDelete);
  }

  // Create new items with PF2e-compliant structure
  if (toCreate.length > 0) {
    const itemsToCreate = toCreate.map(strike => composeStrikeItemData(strike, level));

    await actor.createEmbeddedDocuments('Item', itemsToCreate);
  }

  // Update existing items
  if (toUpdate.length > 0) {
    const updates = toUpdate.map(strike => {
      const computed = calculateStrikeStats(
        level,
        strike.attackBenchmark,
        strike.damageBenchmark,
        strike.customDamageFormula,
        strike.persistentBenchmark,
        strike.customPersistentFormula
      );

      // Find existing item to preserve its damage roll structure
      const existingItem = existingItems.find((i: any) => i.id === strike.id);
      const existingRolls = existingItem?.system?.damageRolls || {};
      const rollEntries = Object.entries(existingRolls);
      const updatedRolls: Record<string, any> = {};
      let primaryUpdated = false;

      for (const [key, roll] of rollEntries) {
        const rollData = roll as any;
        if (rollData.category === 'persistent') {
          if (computed.persistentDamage) {
            updatedRolls[key] = { ...rollData, damage: computed.persistentDamage };
          } else {
            updatedRolls[key] = rollData;
          }
        } else if (!primaryUpdated) {
          updatedRolls[key] = {
            ...rollData,
            damage: computed.damage,
            damageType: strike.damageType || rollData.damageType || 'slashing'
          };
          primaryUpdated = true;
        } else {
          updatedRolls[key] = rollData;
        }
      }

      const benchmarkData: ItemBenchmarkData = {
        attackBenchmark: strike.attackBenchmark,
        damageBenchmark: strike.damageBenchmark
      };
      if (strike.customDamageFormula) benchmarkData.customDamageFormula = strike.customDamageFormula;
      if (strike.persistentBenchmark !== undefined) benchmarkData.persistentBenchmark = strike.persistentBenchmark;
      if (strike.customPersistentFormula) benchmarkData.customPersistentFormula = strike.customPersistentFormula;
      if (strike.persistentDamageType) benchmarkData.persistentDamageType = strike.persistentDamageType;

      return {
        _id: strike.id,
        name: strike.name,
        'system.bonus.value': computed.attackBonus,
        'system.damageRolls': updatedRolls,
        'system.traits.value': strike.traits || [],
        [`flags.${CREATURE_FLAG}.${ITEM_BENCHMARK_KEY}`]: benchmarkData
      };
    });

    await actor.updateEmbeddedDocuments('Item', updates);
  }

  logger.info(`[CreatureService] Updated melee items: ${toDelete.length} deleted, ${toCreate.length} created, ${toUpdate.length} updated`);
}

/**
 * Update ability items on an actor based on special-ability data from the editor.
 *
 * Persists any in-memory edits to scalable-value overrides back to each item's
 * benchmark flag, then re-renders `system.description.value` at the current level.
 * For abilities with no scalable values, this is a no-op.
 * For abilities whose descriptionTemplate was lazily parsed at read time but never
 * persisted (legacy creatures), this migrates them to the flag-based format on save.
 */
export async function updateAbilityItems(
  actorId: string,
  specialAbilities: SpecialAbility[],
  level: number
): Promise<void> {
  const game = (globalThis as any).game;
  const actor = game?.actors?.get(actorId);
  if (!actor) {
    throw new Error(`Actor not found: ${actorId}`);
  }

  // First pass: abilities whose synthetic id isn't on the actor yet (e.g.
  // those seeded by Convert to Troop in edit mode) need to be created. Their
  // scalable values get stamped at creation time by composeAbilityItemData,
  // so subsequent level changes will rescale them via syncAbilityItemsForLevel.
  const newAbilities = specialAbilities.filter(a => !a.id || !actor.items.get(a.id));
  if (newAbilities.length > 0) {
    const itemsToCreate = newAbilities.map(a => composeAbilityItemData(a, level));
    await actor.createEmbeddedDocuments('Item', itemsToCreate);
  }

  // Pull baseLevel from the creature's flag so legacy re-parsing stamps the correct
  // import-time baseLevel onto ScalableValues — not the current editor level, which
  // may have drifted since import.
  const creatureData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  const parseLevel = creatureData?.baseLevel ?? level;

  const updates: any[] = [];

  for (const ability of specialAbilities) {
    if (!ability.id) continue;

    // Find the corresponding embedded item
    const item = actor.items.get(ability.id);
    if (!item) continue;

    // Resolve template + scalable values, parsing on the fly for legacy items
    let template = ability.descriptionTemplate;
    let scalableValues = ability.scalableValues;

    if (!template || !scalableValues || scalableValues.length === 0) {
      const rawDescription = item.system?.description?.value || '';
      const parsed = parseAbilityDescription(rawDescription, parseLevel);
      if (parsed.scalableValues.length === 0) {
        // Nothing scalable to persist — leave the item alone
        continue;
      }
      // Merge any in-memory overrides/customValues onto freshly-parsed values
      // (index-aligned) so user edits survive the migration.
      const merged = parsed.scalableValues.map((sv, i) => {
        const inMemory = scalableValues?.[i];
        if (!inMemory) return sv;
        return {
          ...sv,
          ...(inMemory.override !== undefined ? { override: inMemory.override } : {}),
          ...(inMemory.customValue !== undefined ? { customValue: inMemory.customValue } : {})
        };
      });
      template = parsed.template;
      scalableValues = merged;
    }

    const benchmarkData: AbilityBenchmarkData = {
      descriptionTemplate: template,
      scalableValues,
      originalDescription: (item.getFlag(CREATURE_FLAG, ABILITY_BENCHMARK_KEY) as AbilityBenchmarkData | undefined)?.originalDescription
        ?? item.system?.description?.value
        ?? ''
    };

    // Carry over the user-edited template override if set — it takes precedence
    // when rendering the final description, but the parsed `descriptionTemplate`
    // is preserved alongside so Reset can restore it.
    if (ability.customDescriptionTemplate) {
      benchmarkData.customDescriptionTemplate = ability.customDescriptionTemplate;
    }

    const renderTemplate = ability.customDescriptionTemplate ?? template;
    const scaledDescription = renderAbilityDescription(renderTemplate, scalableValues, level);

    updates.push({
      _id: item.id,
      'system.description.value': scaledDescription,
      [`flags.${CREATURE_FLAG}.${ABILITY_BENCHMARK_KEY}`]: benchmarkData
    });
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
    logger.info(`[CreatureService] Updated ${updates.length} ability items for actor ${actor.name}`);
  }
}

/**
 * Analyze ability items on an actor and add benchmark flags to them.
 * Call this after importing a creature to set up scaling data.
 */
export async function addBenchmarkFlagsToAbilityItems(actor: any, level: number): Promise<void> {
  const items = actor.items?.contents || [];

  // Filter for action items and creature feats
  const abilityItems = items.filter((i: any) => {
    if (i.type === 'action') return true;
    if (i.type === 'feat' && i.system?.category === 'creature') return true;
    return false;
  });

  if (abilityItems.length === 0) {
    return;
  }

  const updates: any[] = [];

  for (const item of abilityItems) {
    const description = item.system?.description?.value || '';

    // Parse the description to find scalable values
    const parsed = parseAbilityDescription(description, level);

    // Only add flags if we found scalable values
    if (parsed.scalableValues.length > 0) {
      const benchmarkData: AbilityBenchmarkData = {
        descriptionTemplate: parsed.template,
        scalableValues: parsed.scalableValues,
        originalDescription: description
      };

      updates.push({
        _id: item.id,
        [`flags.${CREATURE_FLAG}.${ABILITY_BENCHMARK_KEY}`]: benchmarkData
      });

      logger.info(`[CreatureService] Added ability benchmarks to "${item.name}": ${parsed.scalableValues.length} scalable values`);
    }
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
  }
}

/**
 * Update ability items on an actor for a new level using their stored benchmark flags.
 * Re-renders descriptions with scaled damage/DC values.
 */
export async function syncAbilityItemsForLevel(actor: any, level: number): Promise<void> {
  const items = actor.items?.contents || [];

  // Filter for action items and creature feats with benchmark data
  const abilityItems = items.filter((i: any) => {
    if (i.type !== 'action' && !(i.type === 'feat' && i.system?.category === 'creature')) {
      return false;
    }
    // Only sync items that have benchmark data
    const benchmarkData = i.getFlag(CREATURE_FLAG, ABILITY_BENCHMARK_KEY);
    return benchmarkData?.descriptionTemplate && benchmarkData?.scalableValues?.length > 0;
  });

  if (abilityItems.length === 0) {
    return;
  }

  const updates: any[] = [];

  for (const item of abilityItems) {
    const benchmarkData: AbilityBenchmarkData = item.getFlag(CREATURE_FLAG, ABILITY_BENCHMARK_KEY);

    if (!benchmarkData?.descriptionTemplate || !benchmarkData?.scalableValues) {
      continue;
    }

    // Render the description with scaled values for the new level
    const scaledDescription = renderAbilityDescription(
      benchmarkData.descriptionTemplate,
      benchmarkData.scalableValues,
      level
    );

    updates.push({
      _id: item.id,
      'system.description.value': scaledDescription
    });
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
    logger.info(`[CreatureService] Updated ${updates.length} ability items for level ${level}`);
  }
}
