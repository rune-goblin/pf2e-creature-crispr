import type { CreatureBenchmarks, CreatureStats } from '../models';
import { getDefaultBenchmarks } from '../models';
import { analyzeStatsForBenchmarks, calculateCreatureStats } from '../config/creatureStatTables';
import { ensureCreatureFolder } from './folderManager';
import { logger } from './logger';
import { parseDiceFormulaAverage } from './abilityScaling';
import { extractStatsFromActor } from './actorStatsExtractor';
import { extractSpellcastingStats, extractSpellcastingProgression } from './spells';
import { addBenchmarkFlagsToMeleeItems, addBenchmarkFlagsToAbilityItems } from './strikes';
import { CREATURE_FLAG, CREATURE_DATA_KEY } from './constants';

/** Import an existing world actor: move it into the folder and back-solve its benchmarks. */
export async function importCreatureFromActor(actorId: string): Promise<string> {
  const actor: any = game.actors?.get(actorId);
  if (!actor) throw new Error(`Actor not found: ${actorId}`);

  const folderId = await ensureCreatureFolder();
  const level = actor.system?.details?.level?.value ?? 1;

  const { spellDC, spellAttack } = extractSpellcastingStats(actor);
  const { progression: spellProgression, tradition: spellTradition, font: spellFont } =
    extractSpellcastingProgression(actor);

  const actorStats: Partial<CreatureStats> = {
    ...extractStatsFromActor(actor),
    spellDC,
    spellAttack
  };

  const analyzedBenchmarks = analyzeStatsForBenchmarks(level, actorStats);
  const benchmarks: CreatureBenchmarks = {
    ...getDefaultBenchmarks(),
    ...analyzedBenchmarks,
    abilities: { ...getDefaultBenchmarks().abilities, ...(analyzedBenchmarks.abilities || {}) },
    saves: { ...getDefaultBenchmarks().saves, ...(analyzedBenchmarks.saves || {}) },
    ...(spellProgression !== 'none' ? { spellProgression } : {}),
    ...(spellTradition ? { spellTradition } : {}),
    ...(spellFont ? { spellFont } : {})
  };

  await actor.update({ folder: folderId });
  await addBenchmarkFlagsToMeleeItems(actor, level);
  await addBenchmarkFlagsToAbilityItems(actor, level);

  await actor.setFlag(CREATURE_FLAG, CREATURE_DATA_KEY, {
    benchmarks,
    baseLevel: level,
    baseStats: actorStats as CreatureStats,
    importedFrom: actor.name,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  logger.info(`Imported actor into folder: ${actor.name}`);
  return actor.id;
}

/** Import a compendium NPC via Foundry's importFromCompendium (preserves embedded items). */
export async function importCreatureFromCompendium(uuid: string): Promise<string> {
  const indexData: any = fromUuidSync(uuid);
  if (!indexData?.pack || !indexData?._id) {
    throw new Error(`Invalid compendium UUID: ${uuid}`);
  }

  const packCollection: any = game.packs.get(indexData.pack, { strict: true });
  const worldCollection: any = game.collections.get(packCollection.documentName, { strict: true });

  const folderId = await ensureCreatureFolder();

  // Force keepId: false — in v14 the default flipped to true, which silently routes to the
  // "replace existing" path when a compendium _id collides with a world doc (common for legacy
  // bestiary entries duplicated across packs), so no new creature would appear.
  const actor: any = await worldCollection.importFromCompendium(
    packCollection,
    indexData._id,
    { folder: folderId },
    { renderSheet: false, keepId: false }
  );

  if (!actor) throw new Error('Failed to import actor from compendium');
  if (actor.type !== 'npc') {
    await actor.delete();
    throw new Error(`Entry is not an NPC: ${actor.type}`);
  }

  const level = actor.system?.details?.level?.value ?? 1;

  const skills: Record<string, number> = {};
  const actorSkills = actor.system?.skills || {};
  for (const [skillName, skillData] of Object.entries(actorSkills)) {
    const value = (skillData as any)?.base ?? (skillData as any)?.value ?? 0;
    if (value !== 0) skills[skillName] = value;
  }

  const { spellDC, spellAttack } = extractSpellcastingStats(actor);
  const { progression: spellProgression, tradition: spellTradition, font: spellFont } =
    extractSpellcastingProgression(actor);

  const meleeItems = actor.items.contents.filter((i: any) => i.type === 'melee');
  let strikeAttackBonus = 0;
  let strikeDamage = '1d4';
  let strikeDamageAverage = 2.5;

  if (meleeItems.length > 0) {
    const firstMelee = meleeItems[0];
    strikeAttackBonus = firstMelee.system?.bonus?.value ?? 0;
    const damageRolls = firstMelee.system?.damageRolls || {};
    for (const rollEntry of Object.values(damageRolls) as any[]) {
      if (rollEntry.category !== 'persistent' && rollEntry.damage) {
        strikeDamage = rollEntry.damage;
        strikeDamageAverage = parseDiceFormulaAverage(strikeDamage);
        break;
      }
    }
  }

  const baseStats: CreatureStats = {
    ...extractStatsFromActor(actor),
    strikeAttackBonus,
    strikeDamage,
    strikeDamageAverage,
    skills,
    spellDC,
    spellAttack
  };

  const analyzedBenchmarks = analyzeStatsForBenchmarks(level, baseStats);
  const benchmarks: CreatureBenchmarks = {
    ...getDefaultBenchmarks(),
    ...analyzedBenchmarks,
    abilities: { ...getDefaultBenchmarks().abilities, ...(analyzedBenchmarks.abilities || {}) },
    saves: { ...getDefaultBenchmarks().saves, ...(analyzedBenchmarks.saves || {}) },
    ...(spellProgression !== 'none' ? { spellProgression } : {}),
    ...(spellTradition ? { spellTradition } : {}),
    ...(spellFont ? { spellFont } : {})
  };

  await addBenchmarkFlagsToMeleeItems(actor, level);
  await addBenchmarkFlagsToAbilityItems(actor, level);

  await actor.setFlag(CREATURE_FLAG, CREATURE_DATA_KEY, {
    benchmarks,
    baseLevel: level,
    baseStats,
    importedFrom: `${actor.name} (Compendium)`,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  logger.info(`Imported from compendium: ${actor.name}`);
  return actor.id;
}

/** Export a creature's benchmark/stat snapshot to a JSON file. */
export async function exportCreatureToFile(actorId: string): Promise<void> {
  const actor: any = game.actors?.get(actorId);
  if (!actor) throw new Error(`Actor not found: ${actorId}`);

  const creatureData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY);
  const level = actor.system?.details?.level?.value ?? 1;
  const benchmarks = creatureData?.benchmarks || getDefaultBenchmarks();
  const stats = calculateCreatureStats(level, benchmarks);

  const exportData = {
    name: actor.name,
    level,
    creatureType: actor.system?.details?.creatureType || 'creature',
    size: actor.system?.traits?.size?.value || 'medium',
    traits: actor.system?.traits?.value || [],
    benchmarks,
    stats,
    portraitImage: actor.img,
    tokenImage: actor.prototypeToken?.texture?.src,
    exportedAt: Date.now()
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });

  const sanitizedName = actor.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const filename = `${sanitizedName}.json`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
