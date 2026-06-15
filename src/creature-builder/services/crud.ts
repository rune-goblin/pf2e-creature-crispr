import type { CreatureBenchmarks, CreatureStrike, SpecialAbility, CreatureStats } from '../models';
import { getDefaultBenchmarks } from '../models';
import { calculateCreatureStats } from '../config/creatureStatTables';
import { createNPCInFolder, ensureCreatureFolder, requireActor } from './folderManager';
import { logger } from './logger';
import { composeStrikeItemData } from './strikeItemBuilder';
import { composeAbilityItemData } from './abilityItemBuilder';
import { CREATURE_FOLDER, CREATURE_FLAG, CREATURE_DATA_KEY, DEFAULT_NPC_IMAGE } from './constants';
import type { CreatureActorData, CreatureEntry } from './types';

const PF2E_SIZE: Record<string, string> = {
  tiny: 'tiny',
  small: 'sm',
  medium: 'med',
  large: 'lg',
  huge: 'huge',
  gargantuan: 'grg'
};

/**
 * Map computed stats onto the PF2e NPC `system.*` shape shared by create and update.
 * Perception lives at `system.perception.mod` (the modern NPC location) in both paths.
 */
export function buildActorSystemFromStats(stats: CreatureStats): Record<string, unknown> {
  return {
    abilities: {
      str: { mod: stats.str },
      dex: { mod: stats.dex },
      con: { mod: stats.con },
      int: { mod: stats.int },
      wis: { mod: stats.wis },
      cha: { mod: stats.cha }
    },
    attributes: {
      ac: { value: stats.ac },
      hp: { value: stats.hp, max: stats.hp }
    },
    perception: { mod: stats.perception },
    saves: {
      fortitude: { value: stats.fortitude },
      reflex: { value: stats.reflex },
      will: { value: stats.will }
    }
  };
}

function toCreatureEntry(actor: any): CreatureEntry {
  const s = actor.system ?? {};
  return {
    actorId: actor.id,
    name: actor.name || 'Unknown',
    level: s.details?.level?.value ?? 0,
    creatureType: s.details?.creatureType || 'creature',
    size: s.traits?.size?.value || 'medium',
    ac: s.attributes?.ac?.value ?? 10,
    hp: s.attributes?.hp?.max ?? 10
  };
}

export function getAllCreatures(): CreatureEntry[] {
  if (!game.actors || !game.folders) return [];
  const folder = findCreaturesFolder();
  if (!folder) return [];
  return game.actors
    .filter((a) => a.folder?.id === folder.id)
    .map((a) => toCreatureEntry(a))
    .sort((x, y) => x.name.localeCompare(y.name));
}

export function getCreatureById(actorId: string): CreatureEntry | undefined {
  const actor = game.actors?.get(actorId);
  if (!actor) return undefined;
  return toCreatureEntry(actor);
}

export function getCreatureData(actorId: string): CreatureActorData | undefined {
  const actor = game.actors?.get(actorId);
  return actor?.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
}

export function getCreatureBenchmarks(actorId: string): CreatureBenchmarks {
  return getCreatureData(actorId)?.benchmarks ?? getDefaultBenchmarks();
}

/** The single top-level "Creature CRISPR" Actor folder, or null if it doesn't exist yet. */
export function findCreaturesFolder() {
  if (!game.folders) return null;
  return game.folders.find((f) => f.type === 'Actor' && f.name === CREATURE_FOLDER && !f.folder) ?? null;
}

export async function deleteCreature(actorId: string): Promise<void> {
  const actor = requireActor(actorId);
  await actor.delete();
  logger.info(`Deleted creature actor: ${actorId}`);
}

// Snapshot a source actor via toObject() (carries flags + embedded items), strip its id so
// Foundry assigns a fresh one, and create the copy under the given folder with bumped timestamps.
async function cloneActorInto(source: any, name: string, folderId: string | null): Promise<any> {
  const snapshot = source.toObject() as Record<string, unknown>;
  delete snapshot._id;
  snapshot.name = name;
  snapshot.folder = folderId;

  const newActor = await Actor.create(snapshot as any);
  if (!newActor) throw new Error('Failed to create actor copy');

  const flag = newActor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY) as CreatureActorData | undefined;
  if (flag) {
    await newActor.setFlag(CREATURE_FLAG, CREATURE_DATA_KEY, {
      ...flag,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  return newActor;
}

export async function duplicateCreature(actorId: string): Promise<string> {
  const source = requireActor(actorId);
  const copy = await cloneActorInto(source, `${source.name} (Copy)`, source.folder?.id ?? null);
  logger.info(`Duplicated creature: ${source.name} → ${copy.name}`);
  return copy.id;
}

/**
 * Clone an existing creature into the Creature CRISPR folder under a new name.
 * Produces a standalone, independently-editable copy (system data, flags, prototype token,
 * and all embedded items). Apply in-memory editor edits afterward via updateCreature.
 */
export async function cloneCreatureActor(sourceActorId: string, newName: string): Promise<string> {
  const source = requireActor(sourceActorId);
  const folderId = await ensureCreatureFolder();
  const copy = await cloneActorInto(source, newName, folderId);
  logger.info(`Cloned ${source.name} → ${newName}`);
  return copy.id;
}

export async function createCreatureActor(
  name: string,
  level: number,
  benchmarks: CreatureBenchmarks,
  options: {
    size?: string;
    creatureType?: string;
    traits?: string[];
    portraitImage?: string;
    tokenImage?: string;
    strikes?: CreatureStrike[];
    specialAbilities?: SpecialAbility[];
  } = {}
): Promise<string> {
  const stats = calculateCreatureStats(level, benchmarks);
  const portraitImg = options.portraitImage || DEFAULT_NPC_IMAGE;
  const tokenImg = options.tokenImage || options.portraitImage || DEFAULT_NPC_IMAGE;
  const pf2eSize = PF2E_SIZE[options.size || 'medium'] || 'med';

  // Only override what we compute; Foundry's NPC template provides every other default.
  const actorData = {
    img: portraitImg,
    prototypeToken: { texture: { src: tokenImg }, displayName: 30, actorLink: true },
    system: {
      ...buildActorSystemFromStats(stats),
      details: {
        level: { value: level },
        languages: { value: ['common'] },
        publication: { title: 'Creature CRISPR', authors: CREATURE_FLAG }
      },
      traits: { size: { value: pf2eSize }, value: options.traits ?? [] }
    },
    flags: {
      [CREATURE_FLAG]: {
        [CREATURE_DATA_KEY]: {
          benchmarks,
          baseLevel: level,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      }
    }
  };

  const actor = await createNPCInFolder(name, actorData);

  if (options.strikes?.length) {
    const items = options.strikes.map((strike) => composeStrikeItemData(strike, level));
    if (items.length) await actor.createEmbeddedDocuments('Item', items as any);
  }
  if (options.specialAbilities?.length) {
    const items = options.specialAbilities.map((ability) => composeAbilityItemData(ability, level));
    if (items.length) await actor.createEmbeddedDocuments('Item', items as any);
  }

  return actor.id!;
}
