import type { NPCPF2e } from 'foundry-pf2e';
import { getDefaultBenchmarks } from '../logic/models';
import { calculateCreatureStats } from '../logic/creatureStatTables';
import type { CreatureActorData } from './types';
import { ensureCreatureFolder, requireActor } from './folderManager';
import { logger } from './logger';
import { readActorStatsAndBenchmarks } from './actorStatsExtractor';
import { addBenchmarkFlagsToMeleeItems, addBenchmarkFlagsToAbilityItems } from './strikes';
import { CREATURE_FLAG, CREATURE_DATA_KEY } from './constants';

/**
 * Import an existing world actor: back-solve its benchmarks and mark it CRISPR-managed.
 * Membership is the `creatureData` flag, so the actor stays wherever it lives — pass
 * `moveToFolder` only for the explicit "Move to CRISPR folder" action.
 */
export async function importCreatureFromActor(
  actorId: string,
  { moveToFolder = false }: { moveToFolder?: boolean } = {}
): Promise<string> {
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  if (!actor) throw new Error(`Actor not found: ${actorId}`);

  const level = actor.system?.details?.level?.value ?? 1;

  const { baseStats, benchmarks } = readActorStatsAndBenchmarks(actor, level);

  if (moveToFolder) {
    const folderId = await ensureCreatureFolder();
    await actor.update({ folder: folderId });
  }
  await addBenchmarkFlagsToMeleeItems(actor, level);
  await addBenchmarkFlagsToAbilityItems(actor, level);

  await actor.setFlag(CREATURE_FLAG, CREATURE_DATA_KEY, {
    benchmarks,
    baseLevel: level,
    baseStats,
    importedFrom: actor.name,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  logger.info(`Added actor to CRISPR: ${actor.name}`);
  return actor.id;
}

/** Import a compendium NPC via Foundry's importFromCompendium (preserves embedded items). */
export async function importCreatureFromCompendium(uuid: string): Promise<string> {
  // fromUuidSync returns a broad document|index union; we read only the two locator fields.
  const indexData = fromUuidSync(uuid) as { pack?: string; _id?: string } | null;
  if (!indexData?.pack || !indexData?._id) {
    throw new Error(`Invalid compendium UUID: ${uuid}`);
  }

  const packCollection = game.packs.get(indexData.pack, { strict: true });
  const worldCollection = game.collections.get(packCollection.documentName, { strict: true });

  const folderId = await ensureCreatureFolder();

  // Force keepId: false — in v14 the default flipped to true, which silently routes to the
  // "replace existing" path when a compendium _id collides with a world doc (common for legacy
  // bestiary entries duplicated across packs), so no new creature would appear.
  const actor = (await worldCollection.importFromCompendium(
    packCollection,
    indexData._id,
    { folder: folderId },
    { renderSheet: false, keepId: false }
  )) as NPCPF2e | null;

  if (!actor) throw new Error('Failed to import actor from compendium');
  if (actor.type !== 'npc') {
    await actor.delete();
    throw new Error(`Entry is not an NPC: ${actor.type}`);
  }

  const level = actor.system?.details?.level?.value ?? 1;

  const { baseStats, benchmarks } = readActorStatsAndBenchmarks(actor, level);

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
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  if (!actor) throw new Error(`Actor not found: ${actorId}`);

  const creatureData = actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  const level = actor.system?.details?.level?.value ?? 1;
  const benchmarks = creatureData?.benchmarks || getDefaultBenchmarks();
  const stats = calculateCreatureStats(level, benchmarks);

  const exportData = {
    name: actor.name,
    level,
    creatureType: (actor.system?.details as { creatureType?: string }).creatureType || 'creature',
    size: actor.system?.traits?.size?.value || 'medium',
    traits: actor.system?.traits?.value || [],
    benchmarks,
    stats,
    portraitImage: actor.img,
    tokenImage: actor.prototypeToken?.texture?.src,
    exportedAt: Date.now()
  };

  await saveJsonToFile(JSON.stringify(exportData, null, 2), `${slugFilename(actor.name)}.json`);
}

/**
 * Full actor source for packaging into a consumer's compendium: `system`, `items`,
 * `prototypeToken`, `img` and flags — the CRISPR flag kept, so a shipped actor stays
 * CRISPR-editable when reimported. `toObject()` yields the whole source; don't hand-assemble.
 */
export async function exportActorSource(actorId: string): Promise<Record<string, unknown>> {
  const actor = requireActor(actorId);
  return actor.toObject() as Record<string, unknown>;
}

export async function exportActorSourceToFile(actorId: string): Promise<void> {
  const source = await exportActorSource(actorId);
  const jsonString = JSON.stringify(source, null, 2);
  await saveJsonToFile(jsonString, `${slugFilename(String(source.name ?? actorId))}.json`);
}

function slugFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function saveJsonToFile(jsonString: string, filename: string): Promise<void> {
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
    } catch (err) {
      // User cancelled the picker — not an error worth surfacing.
      if ((err as { name?: string }).name === 'AbortError') return;
    }
  }

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
