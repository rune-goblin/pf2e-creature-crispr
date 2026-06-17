import type { NPCPF2e, MeleePF2e } from 'foundry-pf2e';
import type { CreatureBenchmarks, DamageModifier, Immunity } from '../models';
import { getDefaultBenchmarks } from '../models';
import { calculateCreatureStats, calculateStrikeStats } from '../config/creatureStatTables';
import { logger } from './logger';
import { requireActor } from './folderManager';
import { buildActorSystemFromStats, buildIwrSystem } from './crud';
import { syncSpellcastingEntriesForLevel } from './spells';
import { syncAbilityItemsForLevel } from './strikes';
import { CREATURE_FLAG, CREATURE_DATA_KEY, ITEM_BENCHMARK_KEY } from './constants';
import type { CreatureActorData, ItemBenchmarkData } from './types';

export async function updateCreature(
  actorId: string,
  updates: {
    name?: string;
    level?: number;
    benchmarks?: CreatureBenchmarks;
    size?: string;
    creatureType?: string;
    traits?: string[];
    portraitImage?: string;
    tokenImage?: string;
    immunities?: Immunity[];
    resistances?: DamageModifier[];
    weaknesses?: DamageModifier[];
  }
): Promise<void> {
  // requireActor yields a world actor (ActorPF2e<null>); normalize to NPCPF2e for the
  // creature-domain sync helpers — the module only ever edits NPCs.
  const actor = requireActor(actorId) as unknown as NPCPF2e;

  const currentData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  const benchmarks = updates.benchmarks || currentData?.benchmarks || getDefaultBenchmarks();
  const level = updates.level ?? actor.system?.details?.level?.value ?? 1;
  const stats = calculateCreatureStats(level, benchmarks);

  // Deeply-nested PF2e update payload assembled dynamically and validated by Foundry at
  // runtime; `any` here is construction-side, not an actor read.
  const actorUpdate: Record<string, any> = {
    system: {
      ...buildActorSystemFromStats(stats),
      details: { level: { value: level } }
    }
  };

  if (updates.name) actorUpdate.name = updates.name;
  if (updates.creatureType) actorUpdate.system.details.creatureType = updates.creatureType;
  if (updates.size) actorUpdate.system.traits = { size: { value: updates.size } };
  if (updates.traits) {
    actorUpdate.system.traits = actorUpdate.system.traits || {};
    actorUpdate.system.traits.value = updates.traits;
  }
  if (updates.portraitImage) actorUpdate.img = updates.portraitImage;
  if (updates.tokenImage) actorUpdate.prototypeToken = { texture: { src: updates.tokenImage } };
  if (updates.immunities || updates.resistances || updates.weaknesses) {
    Object.assign(actorUpdate.system.attributes, buildIwrSystem(updates));
  }

  await actor.update(actorUpdate);

  const levelChanged = updates.level !== undefined && updates.level !== actor.system?.details?.level?.value;
  if (levelChanged || updates.benchmarks) {
    await syncMeleeItemsForLevel(actor, level);
    await syncSpellcastingEntriesForLevel(actor, level, benchmarks);
    await syncAbilityItemsForLevel(actor, level);
  }

  await actor.setFlag(CREATURE_FLAG, CREATURE_DATA_KEY, {
    benchmarks,
    baseLevel: currentData?.baseLevel ?? level,
    baseStats: currentData?.baseStats,
    importedFrom: currentData?.importedFrom,
    createdAt: currentData?.createdAt || Date.now(),
    updatedAt: Date.now()
  });
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
