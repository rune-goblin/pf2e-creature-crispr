import type { DropDestination, DropEntity } from '../editor/environment';
import type { AbilityItemSystemView, AbilityItemView, MeleeItemView } from './actorQueries';
import { actionItemToSpecialAbility, mapActionType, meleeItemToStrike } from './actorQueries';

/** The Foundry drop payload shape: `{uuid}` (dragged off a sheet) or `{data}` (synthetic source). */
export interface ItemDropData {
  type?: string;
  uuid?: string;
  data?: unknown;
  crisprAbilityDrag?: boolean;
}

/** Tolerant view of a resolved dropped item; handlers narrow `system` to their item type's fields. */
export interface DroppedItemView {
  id: string | null;
  name: string | null;
  type: string;
  system: Record<string, unknown>;
  getFlag(scope: string, key: string): unknown;
  actor?: { system?: { details?: { level?: { value?: number } } } };
}

export interface ItemDropHandler {
  id: string;
  matches(item: DroppedItemView): boolean;
  /** Which editor section a matched item will land in — drives the hover highlight. */
  destination(item: DroppedItemView): DropDestination;
  convert(item: DroppedItemView, level: number): DropEntity | null;
}

const handlers: ItemDropHandler[] = [];

/** Extension point: future item types (weapons, spells, lore) plug in here. First match wins. */
export function registerItemDropHandler(handler: ItemDropHandler): void {
  handlers.push(handler);
}

export function findItemDropHandler(item: DroppedItemView): ItemDropHandler | undefined {
  return handlers.find((h) => h.matches(item));
}

/** When the item lives on an actor, benchmarks are back-solved at that actor's level rather than
 *  the target's, matching the import flow — computed stats then re-project at the target level. */
function parseLevelOf(item: DroppedItemView, targetLevel: number): number {
  return item.actor?.system?.details?.level?.value ?? targetLevel;
}

registerItemDropHandler({
  id: 'ability',
  matches: (item) =>
    item.type === 'action' || (item.type === 'feat' && (item.system as AbilityItemSystemView).category === 'creature'),
  destination: (item) => {
    const sys = item.system as AbilityItemSystemView;
    return mapActionType(sys.actionType?.value || sys.category || '', sys.actions?.value) === 'passive'
      ? 'passives'
      : 'actions';
  },
  convert: (item, level) => {
    // The source item's id is kept as the ability's identity so re-dropping the same item (or one
    // the creature already owns) dedupes. Safe on save: updateAbilityItems creates abilities whose
    // id isn't on the actor (unlike strikes, where a foreign id would silently never persist).
    const ability = actionItemToSpecialAbility(item as unknown as AbilityItemView, parseLevelOf(item, level));
    return { kind: 'ability', ability };
  }
});

registerItemDropHandler({
  id: 'strike',
  matches: (item) => item.type === 'melee',
  destination: () => 'offense',
  convert: (item, level) => {
    const strike = meleeItemToStrike(item as unknown as MeleeItemView, parseLevelOf(item, level), {
      recoverUnflaggedPersistent: true
    });
    // updateMeleeItems only persists strikes whose id exists on the target actor (or is absent),
    // so a foreign item id would make the dropped strike silently never save.
    delete strike.id;
    return { kind: 'strike', strike };
  }
});

type DropResolver = (data: ItemDropData) => Promise<DroppedItemView | null>;

async function resolveDroppedItem(data: ItemDropData): Promise<DroppedItemView | null> {
  return (await Item.fromDropData(data as object)) as unknown as DroppedItemView | null;
}

async function resolveMatched(
  data: ItemDropData,
  resolve: DropResolver
): Promise<{ item: DroppedItemView; handler: ItemDropHandler } | null> {
  if (!data || data.type !== 'Item') return null;
  let item: DroppedItemView | null;
  try {
    item = await resolve(data);
  } catch {
    return null;
  }
  if (!item) return null;
  const handler = findItemDropHandler(item);
  return handler ? { item, handler } : null;
}

/** Resolve a dropped Foundry Item payload into an editor entity, or null if no handler accepts it.
 *  The injectable `resolve` exists for tests; production uses `Item.fromDropData`. */
export async function entityFromDropData(
  data: ItemDropData,
  level: number,
  resolve: DropResolver = resolveDroppedItem
): Promise<DropEntity | null> {
  const matched = await resolveMatched(data, resolve);
  return matched ? matched.handler.convert(matched.item, level) : null;
}

/** Classify a drag payload to its destination section for hover highlighting, or null. */
export async function classifyDropData(
  data: ItemDropData,
  resolve: DropResolver = resolveDroppedItem
): Promise<DropDestination | null> {
  const matched = await resolveMatched(data, resolve);
  return matched ? matched.handler.destination(matched.item) : null;
}
