/**
 * Canonical ordering for an exported actor's `items` array.
 *
 * Foundry assigns embedded-item order non-deterministically after the async
 * `createEmbeddedDocuments` a troop build performs, so `actor.toObject()` dumps `items` in an
 * unstable order. Consumers write that export to disk as source-of-truth JSON, where an unstable
 * order churns the file on every rebuild and makes the packaged compendium non-reproducible.
 *
 * The bucket order mirrors the PF2e NPC sheet's own reading order (strikes → active actions →
 * passives → inventory → spellcasting → the rest). The sheet re-sorts each section itself, so the
 * array order it actually observes is the tiebreak among equal `sort` values — which is precisely
 * where an unstable array would otherwise show up as a shuffled statblock.
 */

/** The fields the ordering reads. Structural, so a Foundry `ItemSource` satisfies it as-is. */
export interface OrderableItemSource {
  name?: string;
  type?: string;
  sort?: number;
  _id?: string | null;
  system?: {
    slug?: string | null;
    action?: string | null;
    actionType?: { value?: string | null } | null;
    level?: { value?: number } | null;
  } & Record<string, unknown>;
}

/** Top-level buckets, in NPC-sheet reading order. */
const enum Rank {
  Strike = 0,
  Action = 1,
  Passive = 2,
  TroopKit = 3,
  Inventory = 4,
  Spellcasting = 5,
  Spell = 6,
  Lore = 7,
  Effect = 8,
  Condition = 9,
  Affliction = 10,
  Other = 11
}

/**
 * The glossary kit both build paths converge on: the headless kernel stamps these slugs
 * (`logic/troop.ts`), the editor embeds the same-named SRD items. They sink below the
 * creature-specific abilities because they are boilerplate that every troop repeats verbatim.
 */
const TROOP_KIT_SLUGS = new Set(['troop-defenses', 'troop-movement', 'form-up']);

/** Physical-item order as the base actor sheet sections it (`actor/sheet/base.ts`). */
const INVENTORY_ORDER = [
  'weapon',
  'shield',
  'armor',
  'equipment',
  'consumable',
  'ammo',
  'treasure',
  'backpack',
  'book'
];

/** The NPC sheet's tiebreak among active actions (`npc/sheet.ts`). */
const ACTION_COST_ORDER = ['free', 'reaction', 'action'];

function actionTypeOf(item: OrderableItemSource): string {
  return item.system?.actionType?.value ?? 'action';
}

/** PF2e leaves `system.slug` null in *source* data (it derives it at prepare time), so fall back. */
function itemSlug(item: OrderableItemSource): string {
  const stored = item.system?.slug;
  if (stored) return stored;
  return (item.name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function rankOf(item: OrderableItemSource): Rank {
  switch (item.type) {
    case 'melee':
      return Rank.Strike;
    case 'action':
      if (TROOP_KIT_SLUGS.has(itemSlug(item))) return Rank.TroopKit;
      return actionTypeOf(item) === 'passive' ? Rank.Passive : Rank.Action;
    case 'spellcastingEntry':
      return Rank.Spellcasting;
    case 'spell':
      return Rank.Spell;
    case 'lore':
      return Rank.Lore;
    case 'effect':
      return Rank.Effect;
    case 'condition':
      return Rank.Condition;
    case 'affliction':
      return Rank.Affliction;
    default:
      return INVENTORY_ORDER.includes(item.type ?? '') ? Rank.Inventory : Rank.Other;
  }
}

/**
 * Within-bucket ordinal, matching how the sheet sorts that section: real strikes above other melee
 * entries, active actions by cost, inventory by section, spells by rank. Buckets with no
 * intra-order return 0 and fall through to the name key.
 */
function subRankOf(item: OrderableItemSource, rank: Rank): number {
  switch (rank) {
    case Rank.Strike:
      return item.system?.action === 'strike' ? 0 : 1;
    case Rank.Action: {
      const idx = ACTION_COST_ORDER.indexOf(actionTypeOf(item));
      return idx === -1 ? ACTION_COST_ORDER.length : idx;
    }
    case Rank.Inventory:
      return INVENTORY_ORDER.indexOf(item.type ?? '');
    case Rank.Spell:
      return item.system?.level?.value ?? 0;
    default:
      return 0;
  }
}

/** JSON with object keys emitted in sorted order, so two equal-content items serialize identically. */
function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val === null || typeof val !== 'object' || Array.isArray(val)) return val;
    const record = val as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = record[key];
        return acc;
      }, {});
  });
}

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Sort a copy of `items` into a total order derived only from item content.
 *
 * Totality matters as much as the ranking: any pair that tied every key would otherwise keep its
 * incoming (unstable) relative order, which is the bug. The last two keys — a key-sorted
 * serialization, then `_id` — guarantee a tiebreak always exists. Two items that get as far as the
 * `_id` key are byte-identical apart from that id, so their relative order carries no content.
 *
 * `sort` is deliberately *not* a key. Its values are stable across builds (measured), but Foundry
 * rewrites them wholesale on a sheet drag-reorder — ranking by it would turn one cosmetic drag into
 * a reshuffle of the entire committed array, rather than the one changed field.
 *
 * Pure — returns a new array of the same item references, mutating neither the input nor any item.
 */
export function canonicalizeItemOrder<T extends OrderableItemSource>(items: readonly T[]): T[] {
  // Serialization is only ever reached by items that tie every cheap key, so memoize it lazily
  // rather than serializing a spellcaster's whole item list up front.
  const serialized = new Map<OrderableItemSource, string>();
  const serialize = (item: OrderableItemSource): string => {
    let cached = serialized.get(item);
    if (cached === undefined) {
      cached = stableSerialize(item);
      serialized.set(item, cached);
    }
    return cached;
  };

  const keyed = items.map((item) => {
    const rank = rankOf(item);
    return {
      item,
      rank,
      subRank: subRankOf(item, rank),
      name: item.name ?? '',
      slug: itemSlug(item),
      id: item._id ?? ''
    };
  });

  keyed.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.subRank - b.subRank ||
      a.name.localeCompare(b.name, 'en') ||
      compareStrings(a.slug, b.slug) ||
      compareStrings(serialize(a.item), serialize(b.item)) ||
      compareStrings(a.id, b.id)
  );

  return keyed.map((k) => k.item);
}
