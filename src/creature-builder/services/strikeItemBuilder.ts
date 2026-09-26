/**
 * Strike item builder
 *
 * Builds PF2e melee `itemData` objects and their benchmark flag for creature strikes. Used by
 * creature creation (`_createCreatureActorInternal`), the create branch of `updateMeleeItems`, and
 * the import flag stamp.
 *
 * The returned object is suitable for `actor.createEmbeddedDocuments('Item', ...)`.
 * The caller is responsible for performing the create call.
 */

import type { CreatureStrike } from '../logic/models';
import { calculateStrikeStats } from '../logic/creatureStatTables';
import { composeDamageRolls, type DamageRollSource } from '../logic/strikeDamage';
import { CREATURE_FLAG, ITEM_BENCHMARK_KEY } from './constants';
import type { ItemBenchmarkData } from './types';

/** PF2e melee item-create payload; Foundry fills the remaining NPC-template defaults at create time. */
export interface StrikeItemData {
  name: string;
  type: 'melee';
  system: {
    action: string;
    bonus: { value: number };
    damageRolls: Record<string, DamageRollSource>;
    traits: { value: string[] };
    range?: { increment: number };
  };
  flags: Record<string, Record<string, ItemBenchmarkData>>;
}

/** A detached copy the writer can key without touching editor state (Svelte proxies don't structuredClone). */
export function cloneStrike(strike: CreatureStrike): CreatureStrike {
  return { ...strike, extraDamage: strike.extraDamage?.map((part) => ({ ...part })) };
}

/**
 * The benchmark flag for a strike whose roll keys are assigned (run `composeDamageRolls` first).
 * Carries the first persistent roll in the legacy fields for consumers that still read them.
 */
export function strikeBenchmarkFlag(strike: CreatureStrike, level: number): ItemBenchmarkData {
  const data: ItemBenchmarkData = {
    attackBenchmark: strike.attackBenchmark,
    damageBenchmark: strike.damageBenchmark,
    damageVersion: 2,
    damageOrigin: {
      main: strike.damage,
      mainLevel: strike.damageBaseLevel ?? level,
      ...(strike.mainRollKey ? { mainRollKey: strike.mainRollKey } : {}),
      parts: Object.fromEntries(
        (strike.extraDamage ?? [])
          .filter((part) => part.rollKey)
          .map((part) => [part.rollKey!, { formula: part.formula, level: part.baseLevel }])
      )
    }
  };
  if (strike.customDamageFormula) data.customDamageFormula = strike.customDamageFormula;
  const persistent = strike.extraDamage?.find((part) => part.category === 'persistent');
  if (persistent) {
    data.persistentBenchmark = 0.5;
    data.customPersistentFormula = persistent.formula;
    data.persistentDamageType = persistent.damageType;
  }
  return data;
}

/**
 * v14 whole-value replacement for an update key; Foundry otherwise deep-merges objects, so keys the
 * new value drops (a deleted damage roll, a cleared custom formula) would survive the update.
 */
export function replaceValue<T>(value: T): T {
  const operators = (foundry.data as unknown as {
    operators: { ForcedReplacement: { create(v: unknown): unknown } };
  }).operators;
  return operators.ForcedReplacement.create(value) as T;
}

/** Compose a single PF2e melee `itemData` object from a creature strike + level. */
export function composeStrikeItemData(source: CreatureStrike, level: number): StrikeItemData {
  const strike = cloneStrike(source);
  const computed = calculateStrikeStats(level, strike.attackBenchmark, strike.damageBenchmark);
  const { rolls } = composeDamageRolls(strike, level);

  const itemData: StrikeItemData = {
    name: strike.name,
    type: 'melee',
    system: {
      action: 'strike',
      bonus: { value: computed.attackBonus },
      damageRolls: rolls,
      traits: {
        value: strike.traits || []
      }
    },
    flags: {
      [CREATURE_FLAG]: {
        [ITEM_BENCHMARK_KEY]: strikeBenchmarkFlag(strike, level)
      }
    }
  };

  if (strike.isRanged) {
    itemData.system.range = { increment: strike.range || 30 };
  }

  return itemData;
}
