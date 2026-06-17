import { logger } from './logger';

export interface BestiaryEntry {
  uuid: string;
  name: string;
  level: number;
  remaster: boolean;
  traits: string[];
  source: string;
}

export interface BestiaryFilterOptions {
  search?: string;
  includeLegacy?: boolean; // include pre-remaster content (default: false)
}

/** The compendium index fields requested below; index entries are loosely typed. */
interface BestiaryIndexEntry {
  _id?: string;
  type?: string;
  name?: string;
  system?: {
    details?: { level?: { value?: number }; publication?: { remaster?: boolean } };
    traits?: { value?: string[] };
  };
}

let cachedEntries: BestiaryEntry[] | null = null;
let cacheLoading: Promise<BestiaryEntry[]> | null = null;

export function isBestiaryBrowserAvailable(): boolean {
  return !!game.packs;
}

export async function initializeBestiaryTab(): Promise<boolean> {
  if (cachedEntries !== null) return true;
  if (cacheLoading) {
    await cacheLoading;
    return true;
  }
  cacheLoading = loadAllNPCEntries();
  cachedEntries = await cacheLoading;
  cacheLoading = null;
  logger.info(`Loaded ${cachedEntries.length} creatures from compendiums`);
  return true;
}

async function loadAllNPCEntries(): Promise<BestiaryEntry[]> {
  if (!game.packs) return [];

  const entries: BestiaryEntry[] = [];

  for (const pack of game.packs) {
    if (pack.metadata?.type !== 'Actor') continue;
    try {
      const index = await pack.getIndex({
        fields: ['type', 'system.details.level.value', 'system.traits.value', 'system.details.publication.remaster']
      });
      for (const entry of index) {
        const e = entry as BestiaryIndexEntry;
        if (e.type && e.type !== 'npc') continue;
        entries.push({
          uuid: `Compendium.${pack.metadata.id}.Actor.${e._id}`,
          name: e.name || 'Unknown',
          level: e.system?.details?.level?.value ?? 0,
          remaster: e.system?.details?.publication?.remaster ?? false,
          traits: e.system?.traits?.value ?? [],
          source: pack.metadata?.label || pack.metadata?.id || ''
        });
      }
    } catch (error) {
      logger.warn(`Failed to load pack ${pack.metadata?.id}:`, error);
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function searchBestiary(
  options: BestiaryFilterOptions = {},
  limit: number = 200
): Promise<BestiaryEntry[]> {
  await initializeBestiaryTab();
  if (!cachedEntries) return [];

  let results = cachedEntries;
  if (!options.includeLegacy) {
    results = results.filter((entry) => entry.remaster);
  }
  if (options.search && options.search.trim()) {
    const searchTerm = options.search.trim().toLowerCase();
    results = results.filter((entry) => entry.name.toLowerCase().includes(searchTerm));
  }
  return results.slice(0, limit);
}

export async function getBestiaryStats(): Promise<{ total: number; remaster: number; legacy: number }> {
  await initializeBestiaryTab();
  if (!cachedEntries) return { total: 0, remaster: 0, legacy: 0 };
  const remaster = cachedEntries.filter((e) => e.remaster).length;
  return { total: cachedEntries.length, remaster, legacy: cachedEntries.length - remaster };
}

export async function getBestiaryCount(): Promise<number> {
  await initializeBestiaryTab();
  return cachedEntries?.length || 0;
}
