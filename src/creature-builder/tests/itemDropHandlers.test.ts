import { describe, it, expect } from 'vitest';
import {
  classifyDropData,
  entityFromDropData,
  findItemDropHandler,
  registerItemDropHandler,
  type DroppedItemView,
  type ItemDropData
} from '@/creature-builder/services/itemDropHandlers';
import { getStatRangesForLevel, statToScalar4 } from '@/creature-builder/logic/creatureStatTables';

function item(type: string, system: Record<string, unknown> = {}, actorLevel?: number): DroppedItemView {
  return {
    id: 'source-id',
    name: 'Dropped Thing',
    type,
    system,
    getFlag: () => undefined,
    ...(actorLevel !== undefined ? { actor: { system: { details: { level: { value: actorLevel } } } } } : {})
  };
}

const dropData: ItemDropData = { type: 'Item', uuid: 'Actor.x.Item.y' };
const resolveTo = (resolved: DroppedItemView | null) => async () => resolved;

describe('built-in drop handlers', () => {
  it('routes action items by action cost: costed → actions, passive/no-cost → passives', async () => {
    expect(await classifyDropData(dropData, resolveTo(item('action', { actionType: { value: 'action' }, actions: { value: 2 } })))).toBe('actions');
    expect(await classifyDropData(dropData, resolveTo(item('action', { actionType: { value: 'reaction' } })))).toBe('actions');
    expect(await classifyDropData(dropData, resolveTo(item('action', { actionType: { value: 'passive' } })))).toBe('passives');
    expect(await classifyDropData(dropData, resolveTo(item('action', {})))).toBe('passives');
  });

  it('matches creature feats but not other feats or item types', async () => {
    expect(await classifyDropData(dropData, resolveTo(item('feat', { category: 'creature', actionType: { value: 'passive' } })))).toBe('passives');
    expect(await classifyDropData(dropData, resolveTo(item('feat', { category: 'classfeature' })))).toBeNull();
    expect(await classifyDropData(dropData, resolveTo(item('spell', {})))).toBeNull();
    expect(await classifyDropData(dropData, resolveTo(item('equipment', {})))).toBeNull();
  });

  it('converts an action item to an ability keyed by the source item id (dedup identity)', async () => {
    const entity = await entityFromDropData(
      dropData,
      3,
      resolveTo(item('action', { actionType: { value: 'action' }, actions: { value: 1 }, description: { value: 'Bites hard.' } }))
    );
    expect(entity?.kind).toBe('ability');
    if (entity?.kind !== 'ability') return;
    expect(entity.ability.id).toBe('source-id');
    expect(entity.ability.name).toBe('Dropped Thing');
    expect(entity.ability.actionType).toBe('action');
    expect(entity.ability.actions).toBe(1);
  });

  it('routes melee items to offense and converts with the source id stripped', async () => {
    expect(await classifyDropData(dropData, resolveTo(item('melee', {})))).toBe('offense');

    const entity = await entityFromDropData(
      dropData,
      3,
      resolveTo(
        item('melee', {
          bonus: { value: 9 },
          damageRolls: {
            r0: { damage: '1d8+4', damageType: 'bludgeoning' },
            r1: { damage: '1d4', damageType: 'fire', category: 'persistent' }
          }
        })
      )
    );
    expect(entity?.kind).toBe('strike');
    if (entity?.kind !== 'strike') return;
    expect(entity.strike.id).toBeUndefined();
    expect(entity.strike.name).toBe('Dropped Thing');
    expect(entity.strike.damage).toBe('1d8+4');
    // The drop path keeps an unflagged persistent rider.
    expect(entity.strike.customPersistentFormula).toBe('1d4');
    expect(entity.strike.persistentDamageType).toBe('fire');
  });

  it('back-solves benchmarks at the source actor level, not the target level', async () => {
    const sourceLevel = 5;
    const entity = await entityFromDropData(
      dropData,
      12,
      resolveTo(item('melee', { bonus: { value: 15 } }, sourceLevel))
    );
    if (entity?.kind !== 'strike') throw new Error('expected a strike');
    expect(entity.strike.attackBenchmark).toBe(statToScalar4(15, getStatRangesForLevel(sourceLevel).strikeAttack));
  });
});

describe('drop payload guards', () => {
  it('rejects payloads that are not Item drops', async () => {
    expect(await entityFromDropData({}, 3, resolveTo(item('action')))).toBeNull();
    expect(await entityFromDropData({ type: 'Actor' }, 3, resolveTo(item('action')))).toBeNull();
    expect(await classifyDropData({ type: 'Actor' }, resolveTo(item('action')))).toBeNull();
  });

  it('returns null when the item cannot be resolved or the resolver throws', async () => {
    expect(await entityFromDropData(dropData, 3, resolveTo(null))).toBeNull();
    expect(await classifyDropData(dropData, resolveTo(null))).toBeNull();
    const throwing = async () => {
      throw new Error('bad uuid');
    };
    expect(await entityFromDropData(dropData, 3, throwing)).toBeNull();
    expect(await classifyDropData(dropData, throwing)).toBeNull();
  });
});

describe('registerItemDropHandler', () => {
  it('extends matching to new item types, first match winning', async () => {
    const first = {
      id: 'test-weapon-first',
      matches: (i: DroppedItemView) => i.type === 'weapon',
      destination: () => 'offense' as const,
      convert: () => null
    };
    const second = { ...first, id: 'test-weapon-second' };
    registerItemDropHandler(first);
    registerItemDropHandler(second);

    expect(findItemDropHandler(item('weapon'))).toBe(first);
    // A registered handler may still decline in convert; the drop then reads as unhandled.
    expect(await entityFromDropData(dropData, 3, resolveTo(item('weapon')))).toBeNull();
    expect(await classifyDropData(dropData, resolveTo(item('weapon')))).toBe('offense');
  });

  it('does not shadow the built-ins', () => {
    expect(findItemDropHandler(item('melee'))?.id).toBe('strike');
    expect(findItemDropHandler(item('action'))?.id).toBe('ability');
  });
});
