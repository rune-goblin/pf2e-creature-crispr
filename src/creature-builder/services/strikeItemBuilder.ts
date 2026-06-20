/**
 * Strike item builder
 *
 * Builds PF2e melee `itemData` objects for creature strikes. Used by both
 * creature creation (`_createCreatureActorInternal`) and the create branch of
 * `updateMeleeItems`. Both call sites previously inlined the same ~80 LOC
 * `.map(strike => { ... })` body — this module owns the canonical shape.
 *
 * The returned object is suitable for `actor.createEmbeddedDocuments('Item', ...)`.
 * The caller is responsible for performing the create call.
 */

import type { CreatureStrike } from '../logic/models';
import { calculateStrikeStats } from '../logic/creatureStatTables';
import { CREATURE_FLAG, ITEM_BENCHMARK_KEY } from './constants';
import type { ItemBenchmarkData } from './types';

interface StrikeDamageRoll {
  damage: string;
  damageType: string;
  category: string | null;
}

/** PF2e melee item-create payload; Foundry fills the remaining NPC-template defaults at create time. */
export interface StrikeItemData {
  name: string;
  type: 'melee';
  system: {
    action: string;
    bonus: { value: number };
    damageRolls: Record<string, StrikeDamageRoll>;
    traits: { value: string[] };
    range?: { increment: number };
  };
  flags: Record<string, Record<string, ItemBenchmarkData>>;
}

/**
 * Compose a single PF2e melee `itemData` object from a creature strike + level.
 *
 * Produces:
 *   - `name`, `type: 'melee'`
 *   - `system.action: 'strike'`
 *   - `system.bonus.value` from computed attack bonus
 *   - `system.damageRolls` with primary damage and (optional) persistent damage
 *   - `system.traits.value` from `strike.traits` (defaults to [])
 *   - `system.range` if `strike.isRanged`
 *   - `flags[CREATURE_FLAG][ITEM_BENCHMARK_KEY]` containing benchmark data
 */
export function composeStrikeItemData(strike: CreatureStrike, level: number): StrikeItemData {
  // Calculate computed values from benchmarks
  const computed = calculateStrikeStats(
    level,
    strike.attackBenchmark,
    strike.damageBenchmark,
    strike.customDamageFormula,
    strike.persistentBenchmark,
    strike.customPersistentFormula
  );

  // Build damage rolls object matching PF2e structure
  const damageRolls: Record<string, StrikeDamageRoll> = {
    '0': {
      damage: computed.damage,
      damageType: strike.damageType || 'slashing',
      category: null
    }
  };

  // Add persistent damage if present
  if (computed.persistentDamage) {
    damageRolls['1'] = {
      damage: computed.persistentDamage,
      damageType: strike.persistentDamageType || 'fire',
      category: 'persistent'
    };
  }

  // Build benchmark data for the item flag
  const benchmarkData: ItemBenchmarkData = {
    attackBenchmark: strike.attackBenchmark,
    damageBenchmark: strike.damageBenchmark
  };
  if (strike.customDamageFormula) {
    benchmarkData.customDamageFormula = strike.customDamageFormula;
  }
  if (strike.persistentBenchmark !== undefined) {
    benchmarkData.persistentBenchmark = strike.persistentBenchmark;
  }
  if (strike.customPersistentFormula) {
    benchmarkData.customPersistentFormula = strike.customPersistentFormula;
  }
  if (strike.persistentDamageType) {
    benchmarkData.persistentDamageType = strike.persistentDamageType;
  }

  // Build melee item - only specify fields we need to set
  const itemData: StrikeItemData = {
    name: strike.name,
    type: 'melee',
    system: {
      action: 'strike',
      bonus: { value: computed.attackBonus },
      damageRolls,
      traits: {
        value: strike.traits || []
      }
    },
    flags: {
      [CREATURE_FLAG]: {
        [ITEM_BENCHMARK_KEY]: benchmarkData
      }
    }
  };

  // Add range for ranged attacks
  if (strike.isRanged) {
    itemData.system.range = { increment: strike.range || 30 };
  }

  return itemData;
}
