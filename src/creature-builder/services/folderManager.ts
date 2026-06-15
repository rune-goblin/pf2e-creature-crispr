import { logger } from './logger';
import { CREATURE_FOLDER } from './constants';

export interface ActorUpdateData {
  name?: string;
  level?: number;
  img?: string;
  hp?: { value: number; max: number };
  [key: string]: unknown;
}

export interface ItemData {
  name: string;
  type: string;
  [key: string]: unknown;
}

/** Resolve an actor by id or throw — replaces the repeated `if (!actor) throw` guards. */
export function requireActor(actorId: string) {
  const actor = game.actors?.get(actorId);
  if (!actor) throw new Error(`Actor not found: ${actorId}`);
  return actor;
}

/** Find or create the single top-level "Creature CRISPR" Actor folder; returns its id. */
export async function ensureCreatureFolder(): Promise<string> {
  if (!game.folders) throw new Error('Foundry VTT not initialized — cannot manage folders');

  let folder = game.folders.find((f) => f.type === 'Actor' && f.name === CREATURE_FOLDER && !f.folder);
  if (!folder) {
    // Document create data is built dynamically; Foundry validates it at runtime.
    folder = await Folder.create({
      name: CREATURE_FOLDER,
      type: 'Actor',
      color: '#6b21a8'
    } as any);
  }
  if (!folder?.id) throw new Error(`Failed to create "${CREATURE_FOLDER}" folder`);
  return folder.id;
}

export async function createNPCInFolder(name: string, additionalData: Record<string, unknown> = {}) {
  if (!game.actors) throw new Error('Foundry VTT not initialized — cannot create actors');
  const folderId = await ensureCreatureFolder();
  const actor = await Actor.create({
    name,
    type: 'npc',
    folder: folderId,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    ...additionalData
  } as any);
  if (!actor?.id) throw new Error(`Failed to create NPC actor: ${name}`);
  return actor;
}

export async function updateActor(actorId: string, updateData: ActorUpdateData) {
  const actor = requireActor(actorId);

  const update: Record<string, unknown> = {};
  if (updateData.name !== undefined) update.name = updateData.name;
  if (updateData.img !== undefined) update.img = updateData.img;
  if (updateData.level !== undefined) update['system.details.level.value'] = updateData.level;
  if (updateData.hp !== undefined) {
    update['system.attributes.hp.value'] = updateData.hp.value;
    update['system.attributes.hp.max'] = updateData.hp.max;
  }
  for (const key of Object.keys(updateData)) {
    if (!['name', 'img', 'level', 'hp'].includes(key)) update[key] = updateData[key];
  }

  await actor.update(update);
  logger.info(`Updated actor "${actor.name}"`, update);
  return actor;
}

export async function deleteActor(actorId: string): Promise<void> {
  const actor = requireActor(actorId);
  const actorName = actor.name;
  await actor.delete();
  logger.info(`Deleted actor "${actorName}"`);
}

export async function addItemToActor(actorId: string, itemData: ItemData) {
  const actor = requireActor(actorId);
  const items = await actor.createEmbeddedDocuments('Item', [itemData] as any);
  if (!items?.length) throw new Error(`Failed to create item: ${itemData.name}`);
  return items[0];
}

export async function removeItemFromActor(actorId: string, itemId: string): Promise<void> {
  const actor = requireActor(actorId);
  const item = actor.items.get(itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  const itemName = item.name;
  await actor.deleteEmbeddedDocuments('Item', [itemId]);
  logger.info(`Removed item "${itemName}" from actor "${actor.name}"`);
}

export async function updateItemOnActor(actorId: string, itemId: string, updateData: Record<string, unknown>) {
  const actor = requireActor(actorId);
  const item = actor.items.get(itemId);
  if (!item) throw new Error(`Item not found: ${itemId}`);
  const itemName = item.name;
  await item.update(updateData);
  logger.info(`Updated item "${itemName}" on actor "${actor.name}"`, updateData);
  return item;
}

export async function getActorItems(actorId: string) {
  const actor = requireActor(actorId);
  return Array.from(actor.items);
}
