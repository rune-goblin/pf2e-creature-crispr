import { describe, it, expect, vi, afterEach } from 'vitest';
import { updateCreature } from '@/creature-builder/services/sync';
import { calculateCreatureStats } from '@/creature-builder/logic/creatureStatTables';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';
import { CREATURE_FLAG, CREATURE_DATA_KEY, ITEM_BENCHMARK_KEY } from '@/creature-builder/services/constants';
import type { CreatureStats } from '@/creature-builder/logic/models';

const ACTOR_ID = 'creature1';
const LEVEL = 5;
const benchmarks = getDefaultBenchmarks();
const tableStats = calculateCreatureStats(LEVEL, benchmarks);

// Distinctive out-of-table values a back-solve→forward would clamp away.
const outOfTableStats = (): CreatureStats => ({ ...tableStats, ac: 999, hp: 888, str: 42, will: 77 });

interface MockActorOptions {
  level?: number;
  hp?: { value: number; max: number };
  flag?: Record<string, unknown>;
  withMeleeItem?: boolean;
}

function makeActor(opts: MockActorOptions = {}) {
  const meleeItem = {
    id: 'melee1',
    type: 'melee',
    name: 'Claw',
    system: { bonus: { value: 15 }, damageRolls: { r0: { damage: '2d8+9', damageType: 'slashing' } } },
    getFlag: (scope: string, key: string) =>
      scope === CREATURE_FLAG && key === ITEM_BENCHMARK_KEY ? { attackBenchmark: 0.5, damageBenchmark: 0.33 } : undefined
  };

  return {
    id: ACTOR_ID,
    name: 'Test Creature',
    system: {
      details: { level: { value: opts.level ?? LEVEL } },
      attributes: { hp: opts.hp ?? { value: 100, max: 100 } },
      perception: {}
    },
    items: { contents: opts.withMeleeItem ? [meleeItem] : [] },
    getFlag: (scope: string, key: string) =>
      scope === CREATURE_FLAG && key === CREATURE_DATA_KEY ? opts.flag : undefined,
    setFlag: vi.fn((_scope?: string, _key?: string, _data?: Record<string, any>) => Promise.resolve()),
    update: vi.fn((_payload?: Record<string, any>) => Promise.resolve()),
    updateEmbeddedDocuments: vi.fn((_type?: string, _updates?: unknown[]) => Promise.resolve())
  };
}

function install(actor: ReturnType<typeof makeActor>): void {
  (globalThis as unknown as { game: unknown }).game = {
    actors: { get: (id: string) => (id === ACTOR_ID ? actor : undefined) }
  };
}

afterEach(() => {
  delete (globalThis as unknown as { game?: unknown }).game;
});

const updatePayload = (actor: ReturnType<typeof makeActor>) => actor.update.mock.calls[0][0] as any;
const flagPayload = (actor: ReturnType<typeof makeActor>) => actor.setFlag.mock.calls[0][2] as any;

describe('updateCreature — D1 baseStats verbatim at baseLevel', () => {
  it('writes out-of-table baseStats verbatim, not the clamped recompute', async () => {
    const baseStats = outOfTableStats();
    const actor = makeActor({ flag: { benchmarks, baseLevel: LEVEL, baseStats } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    const sys = updatePayload(actor).system;
    expect(sys.attributes.ac.value).toBe(999);
    expect(sys.attributes.hp.max).toBe(888);
    expect(sys.abilities.str.mod).toBe(42);
    expect(sys.saves.will.value).toBe(77);
    // Recompute would have clamped these to the table boundary.
    expect(sys.attributes.ac.value).not.toBe(tableStats.ac);
  });

  it('recomputes from benchmarks when baseStats is absent (a benchmark edit cleared it)', async () => {
    const actor = makeActor({ flag: { benchmarks, baseLevel: LEVEL, baseStats: outOfTableStats() } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks });

    const sys = updatePayload(actor).system;
    expect(sys.attributes.ac.value).toBe(tableStats.ac);
    expect(sys.abilities.str.mod).toBe(tableStats.str);
  });

  it('recomputes when the level differs from baseLevel even if baseStats is present', async () => {
    const baseStats = outOfTableStats();
    const actor = makeActor({ level: LEVEL, flag: { benchmarks, baseLevel: LEVEL, baseStats } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL + 1, benchmarks, baseStats, baseLevel: LEVEL });

    const sys = updatePayload(actor).system;
    const rescaled = calculateCreatureStats(LEVEL + 1, benchmarks);
    expect(sys.attributes.ac.value).toBe(rescaled.ac);
    expect(sys.attributes.ac.value).not.toBe(999);
  });
});

describe('updateCreature — D2 flag baseStats write-through', () => {
  it('stores baseStats and the anchor baseLevel verbatim at baseLevel', async () => {
    const baseStats = outOfTableStats();
    const actor = makeActor({ flag: { benchmarks, baseLevel: LEVEL, baseStats, createdAt: 111 } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    const flag = flagPayload(actor);
    expect(flag.baseStats).toEqual(baseStats);
    expect(flag.baseLevel).toBe(LEVEL);
    expect(flag.createdAt).toBe(111); // createdAt preserved
  });

  it('clears the flag baseStats after a benchmark edit and stores the edited benchmarks verbatim', async () => {
    const edited = { ...benchmarks, ac: 0.9 };
    const actor = makeActor({ flag: { benchmarks, baseLevel: LEVEL, baseStats: outOfTableStats() } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks: edited });

    const flag = flagPayload(actor);
    expect(flag.baseStats).toBeUndefined();
    expect(flag.benchmarks).toEqual(edited);
    // baseLevel stays the import anchor.
    expect(flag.baseLevel).toBe(LEVEL);
  });
});

describe('updateCreature — D3 HP preservation', () => {
  it('keeps an uninjured creature full at the new max', async () => {
    const baseStats = { ...tableStats, hp: 45 };
    const actor = makeActor({ hp: { value: 100, max: 100 }, flag: { benchmarks, baseLevel: LEVEL, baseStats } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    expect(updatePayload(actor).system.attributes.hp).toEqual({ value: 45, max: 45 });
  });

  it('keeps an injured creature injured, clamped to the new max', async () => {
    const baseStats = { ...tableStats, hp: 50 };
    const actor = makeActor({ hp: { value: 30, max: 100 }, flag: { benchmarks, baseLevel: LEVEL, baseStats } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    expect(updatePayload(actor).system.attributes.hp).toEqual({ value: 30, max: 50 });
  });

  it('clamps current HP down when it exceeds the new max', async () => {
    const baseStats = { ...tableStats, hp: 40 };
    const actor = makeActor({ hp: { value: 48, max: 100 }, flag: { benchmarks, baseLevel: LEVEL, baseStats } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    expect(updatePayload(actor).system.attributes.hp).toEqual({ value: 40, max: 40 });
  });
});

describe('updateCreature — D4 gated internal item syncs', () => {
  it('a no-op save issues zero embedded-item writes', async () => {
    const baseStats = outOfTableStats();
    const actor = makeActor({ withMeleeItem: true, flag: { benchmarks, baseLevel: LEVEL, baseStats } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    // The verbatim path also means no stat drift on the actor itself.
    expect(updatePayload(actor).system.attributes.ac.value).toBe(999);
  });

  it('a level change re-syncs managed melee items', async () => {
    const actor = makeActor({ level: LEVEL, withMeleeItem: true, flag: { benchmarks, baseLevel: LEVEL } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL + 2, benchmarks });

    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  it('a same-level benchmark edit does not re-sync melee items (they scale only on level change)', async () => {
    const edited = { ...benchmarks, strikeAttack: 0.9 };
    const actor = makeActor({ level: LEVEL, withMeleeItem: true, flag: { benchmarks, baseLevel: LEVEL } });
    install(actor);

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks: edited });

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
