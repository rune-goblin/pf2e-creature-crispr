import type { ActorPF2e } from 'foundry-pf2e';
import type { CreatureBenchmarks, CreatureSense, CreatureSpeeds, CreatureStrike, SpecialAbility, CreatureStats, DamageModifier, Immunity } from '../logic/models';
import { getDefaultBenchmarks } from '../logic/models';
import { sizeToPf2e } from '../logic/sizes';
import { calculateCreatureStats } from '../logic/creatureStatTables';
import { createNPCInFolder, ensureCreatureFolder, requireActor } from './folderManager';
import { logger } from './logger';
import { composeStrikeItemData } from './strikeItemBuilder';
import { composeAbilityItemData } from './abilityItemBuilder';
import { CREATURE_FOLDER, CREATURE_FLAG, CREATURE_DATA_KEY, DEFAULT_NPC_IMAGE } from './constants';
import type { CreatureActorData, CreatureEntry } from './types';

const OTHER_SPEED_TYPES = ['burrow', 'climb', 'fly', 'swim'] as const;

/** Serialize editor speeds into PF2e's `system.attributes.speed` shape (land = `value`, the rest = `otherSpeeds`). */
export function buildSpeedSystem(speeds: CreatureSpeeds): { value: number; otherSpeeds: Array<{ type: string; value: number }> } {
  const otherSpeeds = OTHER_SPEED_TYPES.filter((t) => typeof speeds[t] === 'number').map((t) => ({ type: t, value: speeds[t] as number }));
  return { value: speeds.land ?? 25, otherSpeeds };
}

/** Serialize editor senses into PF2e's `system.perception.senses` source shape (drop empty acuity/range). */
export function buildSensesSystem(senses: CreatureSense[]): Array<{ type: string; acuity?: string; range?: number }> {
  return senses.map((s) => {
    const out: { type: string; acuity?: string; range?: number } = { type: s.type };
    if (s.acuity) out.acuity = s.acuity;
    if (typeof s.range === 'number') out.range = s.range;
    return out;
  });
}

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

export interface CreatureIwr {
  immunities?: Immunity[];
  resistances?: DamageModifier[];
  weaknesses?: DamageModifier[];
}

interface IwrSourceEntry {
  type: string;
  value?: number;
  exceptions?: string[];
  doubleVs?: string[];
}

/**
 * Serialize IWR into PF2e's `system.attributes.{immunities,weaknesses,resistances}` source shape:
 * immunities carry no value; empty exception/doubleVs arrays are dropped (the system stores them sparse).
 */
export function buildIwrSystem(iwr: CreatureIwr): {
  immunities: IwrSourceEntry[];
  weaknesses: IwrSourceEntry[];
  resistances: IwrSourceEntry[];
} {
  const slugs = (arr?: string[]): string[] | undefined => (arr && arr.length ? [...arr] : undefined);
  return {
    immunities: (iwr.immunities ?? []).map((i) => {
      const out: IwrSourceEntry = { type: i.type };
      const exceptions = slugs(i.exceptions);
      if (exceptions) out.exceptions = exceptions;
      return out;
    }),
    weaknesses: (iwr.weaknesses ?? []).map((w) => {
      const out: IwrSourceEntry = { type: w.type, value: w.value };
      const exceptions = slugs(w.exceptions);
      if (exceptions) out.exceptions = exceptions;
      return out;
    }),
    resistances: (iwr.resistances ?? []).map((r) => {
      const out: IwrSourceEntry = { type: r.type, value: r.value };
      const exceptions = slugs(r.exceptions);
      const doubleVs = slugs(r.doubleVs);
      if (exceptions) out.exceptions = exceptions;
      if (doubleVs) out.doubleVs = doubleVs;
      return out;
    })
  };
}

function toCreatureEntry(actor: ActorPF2e): CreatureEntry {
  const s = actor.system;
  return {
    actorId: actor.id,
    name: actor.name || 'Unknown',
    level: s.details?.level?.value ?? 0,
    creatureType: (s.details as { creatureType?: string }).creatureType || 'creature',
    size: s.traits?.size?.value || 'medium',
    ac: s.attributes?.ac?.value ?? 10,
    hp: s.attributes?.hp?.max ?? 10,
    img: actor.img || DEFAULT_NPC_IMAGE
  };
}

/**
 * An actor belongs to the CRISPR workspace if it carries our data flag OR sits in the folder.
 * The flag is the canonical signal (set on import/create) so reorganizing folders never drops a
 * creature from the list; the folder union keeps actors dragged straight into it visible too.
 * Pass `crisprFolderId` to avoid re-finding the folder when filtering many actors.
 */
export function isCreatureMember(actor: ActorPF2e, crisprFolderId?: string | null): boolean {
  if (actor.getFlag(CREATURE_FLAG, CREATURE_DATA_KEY)) return true;
  const folderId = crisprFolderId === undefined ? (findCreaturesFolder()?.id ?? null) : crisprFolderId;
  return folderId != null && actor.folder?.id === folderId;
}

export function getAllCreatures(): CreatureEntry[] {
  if (!game.actors) return [];
  const folderId = findCreaturesFolder()?.id ?? null;
  return game.actors
    .filter((a) => a.type === 'npc' && isCreatureMember(a, folderId))
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

/** Batch counterpart of {@link deleteCreature}: one delete, one undo, one hook cycle. */
export async function deleteCreatures(actorIds: string[]): Promise<void> {
  if (!actorIds.length) return;
  await Actor.deleteDocuments(actorIds);
  logger.info(`Deleted ${actorIds.length} creature actor(s)`);
}

/**
 * Drop an actor from CRISPR without deleting it: clear our data flag and, if it lives in the
 * CRISPR folder, move it back to the root so the union query in {@link isCreatureMember} lets go.
 */
export async function removeCreatureFromCrispr(actorId: string): Promise<void> {
  const actor = requireActor(actorId);
  const folderId = findCreaturesFolder()?.id ?? null;
  const update: Record<string, unknown> = {
    [`flags.${CREATURE_FLAG}.-=${CREATURE_DATA_KEY}`]: null
  };
  if (folderId && actor.folder?.id === folderId) update.folder = null;
  await actor.update(update);
  logger.info(`Removed creature from CRISPR: ${actor.name}`);
}

/** Batch counterpart of {@link removeCreatureFromCrispr}: unlink many actors in one write. */
export async function removeCreaturesFromCrispr(actorIds: string[]): Promise<void> {
  if (!actorIds.length) return;
  const folderId = findCreaturesFolder()?.id ?? null;
  const updates = actorIds.map((id) => {
    const update: Record<string, unknown> = {
      _id: id,
      [`flags.${CREATURE_FLAG}.-=${CREATURE_DATA_KEY}`]: null
    };
    if (folderId && game.actors?.get(id)?.folder?.id === folderId) update.folder = null;
    return update;
  });
  await Actor.updateDocuments(updates as any);
  logger.info(`Removed ${actorIds.length} creature(s) from CRISPR`);
}

/** Relocate an actor into the canonical "Creature CRISPR" folder (the explicit tidy-up action). */
export async function moveCreatureToCrisprFolder(actorId: string): Promise<void> {
  const actor = requireActor(actorId);
  const folderId = await ensureCreatureFolder();
  if (actor.folder?.id === folderId) return;
  await actor.update({ folder: folderId });
  logger.info(`Moved creature to CRISPR folder: ${actor.name}`);
}

/** Batch counterpart of {@link moveCreatureToCrisprFolder}: relocate many actors in one write. */
export async function moveCreaturesToCrisprFolder(actorIds: string[]): Promise<void> {
  if (!actorIds.length) return;
  const folderId = await ensureCreatureFolder();
  const updates = actorIds
    .filter((id) => game.actors?.get(id)?.folder?.id !== folderId)
    .map((id) => ({ _id: id, folder: folderId }));
  if (!updates.length) return;
  await Actor.updateDocuments(updates as any);
  logger.info(`Moved ${updates.length} creature(s) to CRISPR folder`);
}

// Snapshot a source actor via toObject() (carries flags + embedded items), strip its id so
// Foundry assigns a fresh one, and create the copy under the given folder with bumped timestamps.
async function cloneActorInto(source: ActorPF2e, name: string, folderId: string | null): Promise<ActorPF2e> {
  const snapshot = source.toObject() as Record<string, unknown>;
  delete snapshot._id;
  snapshot.name = name;
  snapshot.folder = folderId;

  const newActor = (await Actor.create(snapshot as any)) as ActorPF2e | undefined;
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
    immunities?: Immunity[];
    resistances?: DamageModifier[];
    weaknesses?: DamageModifier[];
    speeds?: CreatureSpeeds;
    languages?: string[];
    senses?: CreatureSense[];
  } = {}
): Promise<string> {
  const stats = calculateCreatureStats(level, benchmarks);
  const portraitImg = options.portraitImage || DEFAULT_NPC_IMAGE;
  const tokenImg = options.tokenImage || options.portraitImage || DEFAULT_NPC_IMAGE;
  const pf2eSize = sizeToPf2e(options.size || 'medium');
  const system = buildActorSystemFromStats(stats);
  Object.assign(system.attributes as object, buildIwrSystem(options));
  if (options.speeds) Object.assign(system.attributes as object, { speed: buildSpeedSystem(options.speeds) });
  if (options.senses) (system.perception as { senses?: unknown }).senses = buildSensesSystem(options.senses);

  // Only override what we compute; Foundry's NPC template provides every other default.
  const actorData = {
    img: portraitImg,
    prototypeToken: { texture: { src: tokenImg }, displayName: 30, actorLink: true },
    system: {
      ...system,
      details: {
        level: { value: level },
        languages: { value: options.languages ?? ['common'] },
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
