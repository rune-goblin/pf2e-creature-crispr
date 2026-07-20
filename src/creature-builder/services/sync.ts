import type { NPCPF2e, MeleePF2e } from 'foundry-pf2e';
import type { CreatureBenchmarks, CreatureSense, CreatureSpeeds, CreatureStats, DamageModifier, Immunity } from '../logic/models';
import { getDefaultBenchmarks } from '../logic/models';
import { sizeToPf2e } from '../logic/sizes';
import { calculateCreatureStats, calculateStrikeStats } from '../logic/creatureStatTables';
import { logger } from './logger';
import { requireActor } from './folderManager';
import { buildActorSystemFromStats, buildIwrSystem, buildSpeedSystem, buildSensesSystem } from './crud';
import { syncSpellcastingEntriesForLevel } from './spells';
import { syncAbilityItemsForLevel } from './strikes';
import { CREATURE_FLAG, CREATURE_DATA_KEY, ITEM_BENCHMARK_KEY } from './constants';
import type { CreatureActorData, ItemBenchmarkData } from './types';

// D1: mirror the editor's display rule — at baseLevel with captured baseStats, write them verbatim
// rather than recomputing (back-solve→forward clamps out-of-table values to the table boundary).
// Shared so the save target selects the same stats object for its skill sync as updateCreature does.
export function selectSaveStats(
  level: number,
  benchmarks: CreatureBenchmarks,
  baseStats: CreatureStats | undefined,
  baseLevel: number | undefined
): CreatureStats {
  return baseStats && baseLevel === level ? baseStats : calculateCreatureStats(level, benchmarks);
}

export async function updateCreature(
  actorId: string,
  updates: {
    name?: string;
    level?: number;
    benchmarks?: CreatureBenchmarks;
    baseStats?: CreatureStats;
    baseLevel?: number;
    size?: string;
    creatureType?: string;
    traits?: string[];
    portraitImage?: string;
    tokenImage?: string;
    immunities?: Immunity[];
    resistances?: DamageModifier[];
    weaknesses?: DamageModifier[];
    speeds?: CreatureSpeeds;
    languages?: string[];
    senses?: CreatureSense[];
  }
): Promise<void> {
  // requireActor yields a world actor (ActorPF2e<null>); normalize to NPCPF2e for the
  // creature-domain sync helpers — the module only ever edits NPCs.
  const actor = requireActor(actorId) as unknown as NPCPF2e;

  const currentData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  const benchmarks = updates.benchmarks || currentData?.benchmarks || getDefaultBenchmarks();
  const previousLevel = actor.system?.details?.level?.value;
  const level = updates.level ?? previousLevel ?? 1;

  const stats = selectSaveStats(level, benchmarks, updates.baseStats, updates.baseLevel);

  // Deeply-nested PF2e update payload assembled dynamically and validated by Foundry at
  // runtime; `any` here is construction-side, not an actor read.
  const actorUpdate: Record<string, any> = {
    system: {
      ...buildActorSystemFromStats(stats),
      details: { level: { value: level } }
    }
  };

  // D3: raise/lower max but keep the creature's current damage — an uninjured creature stays full,
  // an injured one stays injured (clamped to the new max).
  const oldValue = actor.system?.attributes?.hp?.value;
  const oldMax = actor.system?.attributes?.hp?.max;
  const hpValue = oldValue === undefined
    ? stats.hp
    : oldValue === oldMax ? stats.hp : Math.min(oldValue, stats.hp);
  actorUpdate.system.attributes.hp = { value: hpValue, max: stats.hp };

  if (updates.name) actorUpdate.name = updates.name;
  if (updates.creatureType) actorUpdate.system.details.creatureType = updates.creatureType;
  if (updates.size) actorUpdate.system.traits = { size: { value: sizeToPf2e(updates.size) } };
  if (updates.traits) {
    actorUpdate.system.traits = actorUpdate.system.traits || {};
    actorUpdate.system.traits.value = updates.traits;
  }
  if (updates.languages) actorUpdate.system.details.languages = { value: updates.languages };
  if (updates.speeds) actorUpdate.system.attributes.speed = buildSpeedSystem(updates.speeds);
  if (updates.senses) actorUpdate.system.perception.senses = buildSensesSystem(updates.senses);
  if (updates.portraitImage) actorUpdate.img = updates.portraitImage;
  if (updates.tokenImage) actorUpdate.prototypeToken = { texture: { src: updates.tokenImage } };
  if (updates.immunities || updates.resistances || updates.weaknesses) {
    Object.assign(actorUpdate.system.attributes, buildIwrSystem(updates));
  }

  await actor.update(actorUpdate);

  // D4: levelChanged is measured against the level captured BEFORE the update (reading it after would
  // always see the freshly-written value and never fire). Creature-level benchmarks scale items only
  // through a level change; spell DC/attack/slots benchmarks also move when the benchmarks themselves
  // change — so gate each sync on the input it actually depends on. A true no-op save writes no items.
  const levelChanged = updates.level !== undefined && updates.level !== previousLevel;
  const benchmarksChanged = updates.benchmarks !== undefined && !deepEqual(updates.benchmarks, currentData?.benchmarks);
  if (levelChanged) {
    await syncMeleeItemsForLevel(actor, level);
    await syncAbilityItemsForLevel(actor, level);
  }
  if (levelChanged || benchmarksChanged) {
    await syncSpellcastingEntriesForLevel(actor, level, benchmarks, { previousLevel });
  }

  await actor.setFlag(CREATURE_FLAG, CREATURE_DATA_KEY, {
    benchmarks,
    // baseLevel is the import anchor for lazy-parsing legacy ability descriptions — never rebased on save.
    baseLevel: currentData?.baseLevel ?? level,
    // D2: store exactly what the editor holds — undefined once a benchmark edit cleared it.
    baseStats: updates.baseStats,
    importedFrom: currentData?.importedFrom,
    createdAt: currentData?.createdAt || Date.now(),
    updatedAt: Date.now()
  });
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Re-derive attack bonus and damage for managed melee items at a new level from their
 * stored benchmark flags. Preserves all native PF2e item data and the damageRolls shape.
 */
async function syncMeleeItemsForLevel(actor: NPCPF2e, level: number): Promise<void> {
  const meleeItems = actor.items.contents.filter((i): i is MeleePF2e<NPCPF2e> => i.type === 'melee');
  if (meleeItems.length === 0) return;

  const updates: EmbeddedDocumentUpdateData[] = [];

  for (const item of meleeItems) {
    const benchmarks: ItemBenchmarkData = (item.getFlag(CREATURE_FLAG, ITEM_BENCHMARK_KEY) as ItemBenchmarkData) || {};

    // Skip items we don't manage (no benchmark flags).
    if (benchmarks.attackBenchmark === undefined && benchmarks.damageBenchmark === undefined) {
      continue;
    }

    const computed = calculateStrikeStats(
      level,
      benchmarks.attackBenchmark ?? 0.5,
      benchmarks.damageBenchmark ?? 0.33,
      benchmarks.customDamageFormula,
      benchmarks.persistentBenchmark,
      benchmarks.customPersistentFormula
    );

    const existingRolls = item.system?.damageRolls ?? {};
    const updatedRolls: Record<string, unknown> = {};

    for (const [key, rollData] of Object.entries(existingRolls)) {
      if (rollData.category === 'persistent') {
        updatedRolls[key] = computed.persistentDamage
          ? { ...rollData, damage: computed.persistentDamage }
          : rollData;
      } else if (!updatedRolls._primaryUpdated) {
        updatedRolls[key] = { ...rollData, damage: computed.damage };
        updatedRolls._primaryUpdated = true;
      } else {
        updatedRolls[key] = rollData;
      }
    }
    delete updatedRolls._primaryUpdated;

    updates.push({
      _id: item.id,
      'system.bonus.value': computed.attackBonus,
      'system.damageRolls': updatedRolls
    });
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
    logger.info(`Updated ${updates.length} melee items for level ${level}`);
  }
}
