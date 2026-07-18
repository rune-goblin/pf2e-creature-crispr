import { describe, it, expect } from 'vitest';
import { canonicalizeItemOrder, type OrderableItemSource } from '@/creature-builder/services/canonicalItemOrder';

let idCounter = 0;
const nextId = () => `item${(idCounter++).toString().padStart(4, '0')}`;

function melee(name: string, extra: Partial<OrderableItemSource> = {}): OrderableItemSource {
  return { _id: nextId(), name, type: 'melee', system: { action: 'strike' }, ...extra };
}

function action(
  name: string,
  actionType: string = 'action',
  extra: Partial<OrderableItemSource> = {}
): OrderableItemSource {
  return { _id: nextId(), name, type: 'action', system: { actionType: { value: actionType } }, ...extra };
}

function spell(name: string, level: number): OrderableItemSource {
  return { _id: nextId(), name, type: 'spell', system: { level: { value: level } } };
}

const names = (items: OrderableItemSource[]) => items.map((i) => i.name);

/** Deterministic shuffle so a failure reproduces; mirrors the arbitrary order Foundry hands back. */
function rotate<T>(items: readonly T[], by: number): T[] {
  const n = items.length;
  return items.map((_, i) => items[(i + by) % n]);
}

describe('canonicalizeItemOrder', () => {
  it('orders buckets in NPC-sheet reading order', () => {
    const items = [
      spell('Magic Missile', 1),
      { _id: nextId(), name: 'Longsword', type: 'weapon' },
      action('Troop Defenses', 'passive'),
      action('Attack of Opportunity', 'reaction'),
      { _id: nextId(), name: 'Arcane Spontaneous', type: 'spellcastingEntry' },
      action('Keen Eyes', 'passive'),
      melee('Jaws')
    ];

    expect(names(canonicalizeItemOrder(items))).toEqual([
      'Jaws',
      'Attack of Opportunity',
      'Keen Eyes',
      'Troop Defenses',
      'Longsword',
      'Arcane Spontaneous',
      'Magic Missile'
    ]);
  });

  it('sinks the standard troop kit below the creature-specific abilities', () => {
    const items = [
      action('Troop Movement', 'passive'),
      action('Form Up'),
      action('Troop Defenses', 'passive'),
      action('Jaws Flurry'),
      action('Pack Attack', 'passive')
    ];

    expect(names(canonicalizeItemOrder(items))).toEqual([
      'Jaws Flurry',
      'Pack Attack',
      'Form Up',
      'Troop Defenses',
      'Troop Movement'
    ]);
  });

  it('detects the troop kit from the name when source slug is null', () => {
    const withSlug = action('Troop Defenses', 'passive', { system: { slug: 'troop-defenses', actionType: { value: 'passive' } } });
    const withoutSlug = action('Troop Defenses', 'passive', { system: { slug: null, actionType: { value: 'passive' } } });

    for (const kit of [withSlug, withoutSlug]) {
      const ordered = canonicalizeItemOrder([kit, action('Alertness', 'passive')]);
      expect(names(ordered)).toEqual(['Alertness', 'Troop Defenses']);
    }
  });

  it('puts real strikes ahead of other melee entries, matching the NPC sheet', () => {
    const versatile = melee('Aura of Flame', { system: { action: 'versatile' } });
    expect(names(canonicalizeItemOrder([versatile, melee('Jaws')]))).toEqual(['Jaws', 'Aura of Flame']);
  });

  it('orders active actions by cost (free, reaction, action) and spells by rank', () => {
    const actions = canonicalizeItemOrder([action('Zeta'), action('Beta', 'reaction'), action('Alpha', 'free')]);
    expect(names(actions)).toEqual(['Alpha', 'Beta', 'Zeta']);

    const spells = canonicalizeItemOrder([spell('Zeta Bolt', 1), spell('Alpha Ray', 3), spell('Beta Wall', 1)]);
    expect(names(spells)).toEqual(['Beta Wall', 'Zeta Bolt', 'Alpha Ray']);
  });

  it('is order-independent: every rotation of the input yields the same result', () => {
    const items = [
      melee('Jaws'),
      melee('Claw'),
      action('Troop Movement', 'passive'),
      action('Jaws Flurry'),
      spell('Magic Missile', 1),
      { _id: nextId(), name: 'Hide Armor', type: 'armor' },
      action('Keen Eyes', 'passive')
    ];

    const expected = names(canonicalizeItemOrder(items));
    for (let by = 1; by < items.length; by++) {
      expect(names(canonicalizeItemOrder(rotate(items, by))), `rotation ${by}`).toEqual(expected);
    }
  });

  it('totally orders same-named items that differ only in content', () => {
    const a: OrderableItemSource = { _id: 'zzzz', name: 'Jaws', type: 'melee', system: { action: 'strike', bonus: { value: 9 } } };
    const b: OrderableItemSource = { _id: 'aaaa', name: 'Jaws', type: 'melee', system: { action: 'strike', bonus: { value: 14 } } };

    expect(canonicalizeItemOrder([a, b]).map((i) => i._id)).toEqual(canonicalizeItemOrder([b, a]).map((i) => i._id));
  });

  it('is idempotent and preserves item content and identity', () => {
    const items = [melee('Jaws'), action('Form Up'), spell('Magic Missile', 1), action('Keen Eyes', 'passive')];
    const snapshot = JSON.stringify(items);

    const once = canonicalizeItemOrder(items);
    const twice = canonicalizeItemOrder(once);

    expect(twice).toEqual(once);
    expect(once).toHaveLength(items.length);
    expect(new Set(once)).toEqual(new Set(items)); // same references, nothing cloned or dropped
    expect(JSON.stringify(items), 'input array must not be mutated').toBe(snapshot);
  });

  it('keeps unknown item types rather than dropping them', () => {
    const ordered = canonicalizeItemOrder([{ _id: nextId(), name: 'Mystery', type: 'someFutureType' }, melee('Jaws')]);
    expect(names(ordered)).toEqual(['Jaws', 'Mystery']);
  });
});
