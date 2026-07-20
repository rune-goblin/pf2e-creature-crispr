import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importActorFromSource } from '@/creature-builder/services/import';
import { getEditableCreature, saveEditableCreature } from '@/creature-builder/services/headless';
import { getStrikesFromActor } from '@/creature-builder/services/actorQueries';
import { registerSaveTarget, resetSaveTargets } from '@/creature-builder/services/saveTargetRegistry';
import { editorStore } from '@/creature-builder/editor';
import { getDefaultBenchmarks, calculateCreatureStats } from '@/creature-builder/services';
import type { CreatureSaveTarget, StoredCreatureData } from '@/creature-builder/logic/contracts';
import type { EditableCreature } from '@/creature-builder/logic/editableCreature';
import { CREATURE_FLAG, CREATURE_DATA_KEY } from '@/creature-builder/services/constants';

const ACTOR_ID = 'creature-1';
const LEVEL = 5;

interface ActorMockOptions {
  traits?: string[];
  melee?: boolean;
  flag?: StoredCreatureData;
}

function makeNpcActor(opts: ActorMockOptions = {}) {
  const meleeItem = {
    id: 'melee-1',
    type: 'melee',
    name: 'Claw',
    system: { bonus: { value: 14 }, damageRolls: { r0: { damage: '2d8+9', damageType: 'slashing' } }, traits: { value: [] } },
    getFlag: () => undefined
  };
  return {
    id: ACTOR_ID,
    name: 'Test Creature',
    img: 'icons/creature.webp',
    prototypeToken: { texture: { src: 'tokens/creature.webp' } },
    system: {
      abilities: { str: { mod: 4 }, dex: { mod: 2 }, con: { mod: 3 }, int: { mod: 0 }, wis: { mod: 1 }, cha: { mod: 0 } },
      details: { level: { value: LEVEL }, creatureType: 'beast', languages: { value: ['common'] } },
      traits: { size: { value: 'lg' }, value: opts.traits ?? [] },
      attributes: { ac: { value: 22 }, hp: { value: 80, max: 80 }, immunities: [], resistances: [], weaknesses: [] },
      perception: { value: 12, senses: [] },
      saves: { fortitude: { value: 13 }, reflex: { value: 9 }, will: { value: 11 } },
      skills: {}
    },
    _source: { system: { attributes: { speed: { value: 30, otherSpeeds: [{ type: 'fly', value: 50 }] } } } },
    items: { contents: opts.melee ? [meleeItem] : [] },
    getFlag: (scope: string, key: string) =>
      scope === CREATURE_FLAG && key === CREATURE_DATA_KEY ? opts.flag : undefined,
    setFlag: vi.fn(async () => {})
  };
}

function installActor(actor: ReturnType<typeof makeNpcActor>): void {
  (globalThis as unknown as { game: unknown }).game = {
    actors: { get: (id: string) => (id === ACTOR_ID ? actor : undefined) }
  };
}

afterEach(() => {
  resetSaveTargets();
  editorStore.resetEditor();
  delete (globalThis as unknown as { game?: unknown }).game;
  delete (globalThis as unknown as { Actor?: unknown }).Actor;
});

describe('importActorFromSource (D8)', () => {
  function installActorCreate(create: (data: Record<string, unknown>) => unknown): void {
    (globalThis as unknown as { Actor: unknown }).Actor = { create };
  }

  it('creates an NPC from source, strips _id, and stamps the CRISPR flag', async () => {
    const created = makeNpcActor();
    const createSpy = vi.fn(async (_data: Record<string, unknown>) => created);
    installActorCreate(createSpy);

    const source = { _id: 'stale-id', type: 'npc', name: 'Submitted', system: { details: { level: { value: LEVEL } } } };
    const id = await importActorFromSource(source);

    expect(id).toBe(ACTOR_ID);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const passed = createSpy.mock.calls[0][0] as Record<string, unknown>;
    expect('_id' in passed).toBe(false);
    expect(passed.type).toBe('npc');
    // Source object is not mutated (the caller keeps its _id).
    expect(source._id).toBe('stale-id');
    expect(created.setFlag).toHaveBeenCalledWith(CREATURE_FLAG, CREATURE_DATA_KEY, expect.objectContaining({ importedFrom: 'Test Creature' }));
  });

  it('rejects a non-npc source before any create', async () => {
    const createSpy = vi.fn(async () => makeNpcActor());
    installActorCreate(createSpy);

    await expect(importActorFromSource({ type: 'character', name: 'PC' })).rejects.toThrow(/must be an NPC/);
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('getEditableCreature (D8) — detached clone', () => {
  it('returns a deep clone whose mutation touches neither the store flag nor the actor', () => {
    const storedBenchmarks = getDefaultBenchmarks();
    const storedFlag: StoredCreatureData = {
      benchmarks: storedBenchmarks,
      baseLevel: LEVEL,
      baseStats: calculateCreatureStats(LEVEL, storedBenchmarks)
    };
    const actor = makeNpcActor({ melee: true });
    installActor(actor);

    registerSaveTarget({
      id: 'load-target',
      label: 'Load',
      loadCreatureData: () => storedFlag,
      createActor: async () => ACTOR_ID,
      updateActor: async () => {},
      cloneActor: async () => ACTOR_ID
    });

    const creature = getEditableCreature(ACTOR_ID, { saveTargetId: 'load-target' });
    creature.benchmarks.ac = 0.99;
    creature.strikes.push({ id: undefined, name: 'Injected', attackBenchmark: 1, damageBenchmark: 1, attackBonus: 0, damage: '1d4', damageType: 'slashing', traits: [] });
    creature.name = 'Mutated';

    // The stored flag object the target owns is untouched by the returned clone's mutation.
    expect(storedFlag.benchmarks.ac).not.toBe(0.99);
    expect(storedBenchmarks.ac).not.toBe(0.99);
    // The actor is re-read fresh each load, so a second read is unaffected too.
    const reread = getEditableCreature(ACTOR_ID, { saveTargetId: 'load-target' });
    expect(reread.name).toBe('Test Creature');
    expect(reread.strikes).toHaveLength(1);
  });

  it('throws on a missing actor', () => {
    installActor(makeNpcActor());
    expect(() => getEditableCreature('nope')).toThrow(/actor not found/);
  });
});

describe('saveEditableCreature (D8)', () => {
  function captureTarget() {
    const calls: Array<{ fn: string; mode?: string; actorId?: string }> = [];
    const target: CreatureSaveTarget = {
      id: 'capture',
      label: 'Capture',
      createActor: async () => {
        calls.push({ fn: 'create' });
        return 'new-actor';
      },
      updateActor: async (actorId) => {
        calls.push({ fn: 'update', actorId });
      },
      cloneActor: async () => 'clone-actor',
      onAfterSave: async (actorId, _c, mode) => {
        calls.push({ fn: 'onAfterSave', mode, actorId });
      }
    };
    return { target, calls };
  }

  const validCreature = (overrides: Partial<EditableCreature> = {}): EditableCreature => ({
    name: 'Saveable',
    level: 3,
    creatureType: 'beast',
    size: 'medium',
    traits: [],
    benchmarks: getDefaultBenchmarks(),
    strikes: [],
    specialAbilities: [],
    immunities: [],
    resistances: [],
    weaknesses: [],
    speeds: { land: 25 },
    languages: ['common'],
    senses: [],
    ...overrides
  });

  it('create path (no actorId) calls createActor then onAfterSave with mode create', async () => {
    const { target, calls } = captureTarget();
    registerSaveTarget(target);

    const id = await saveEditableCreature(validCreature(), { saveTargetId: 'capture' });

    expect(id).toBe('new-actor');
    expect(calls).toEqual([
      { fn: 'create' },
      { fn: 'onAfterSave', mode: 'create', actorId: 'new-actor' }
    ]);
  });

  it('update path (with actorId) calls updateActor then onAfterSave with mode update', async () => {
    const { target, calls } = captureTarget();
    registerSaveTarget(target);

    const id = await saveEditableCreature(validCreature({ actorId: 'existing' }), { saveTargetId: 'capture' });

    expect(id).toBe('existing');
    expect(calls).toEqual([
      { fn: 'update', actorId: 'existing' },
      { fn: 'onAfterSave', mode: 'update', actorId: 'existing' }
    ]);
  });

  it('a validation failure throws before any write', async () => {
    const { target, calls } = captureTarget();
    registerSaveTarget(target);

    await expect(
      saveEditableCreature(validCreature({ name: '   ', actorId: 'existing' }), { saveTargetId: 'capture' })
    ).rejects.toThrow(/Name is required/);
    expect(calls).toEqual([]);
  });

  it('stamps troop defaults on a zero-strike troop and creates no melee item', async () => {
    const captured: EditableCreature[] = [];
    registerSaveTarget({
      id: 'troop-capture',
      label: 'Troop Capture',
      createActor: async (c) => {
        captured.push(c);
        return 'troop-actor';
      },
      updateActor: async () => {},
      cloneActor: async () => 'x'
    });

    await saveEditableCreature(validCreature({ isTroop: true, troopSize: 'gargantuan', strikes: [] }), {
      saveTargetId: 'troop-capture'
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].strikes).toEqual([]);
    expect(captured[0].traits).toContain('troop');
    expect(captured[0].weaknesses.map((w) => w.type)).toEqual(expect.arrayContaining(['area-damage', 'splash-damage']));
  });
});

describe('troop zero-strike (D9)', () => {
  it('getStrikesFromActor drops the WYSIWYG placeholder for a troop actor', () => {
    installActor(makeNpcActor({ traits: ['troop'] }));
    expect(getStrikesFromActor(ACTOR_ID)).toEqual([]);
  });

  it('getStrikesFromActor keeps the single placeholder row for a non-troop actor', () => {
    installActor(makeNpcActor({ traits: [] }));
    const strikes = getStrikesFromActor(ACTOR_ID);
    expect(strikes).toHaveLength(1);
    expect(strikes[0].name).toBe('Melee Strike');
    expect(strikes[0].id).toBeUndefined();
  });

  it('a zero-strike troop loads through getEditableCreature with no placeholder', () => {
    const actor = makeNpcActor({ traits: ['troop'] });
    installActor(actor);
    registerSaveTarget({
      id: 'troop-load',
      label: 'Troop Load',
      loadCreatureData: () => undefined,
      createActor: async () => ACTOR_ID,
      updateActor: async () => {},
      cloneActor: async () => ACTOR_ID
    });
    const creature = getEditableCreature(ACTOR_ID, { saveTargetId: 'troop-load' });
    expect(creature.isTroop).toBe(true);
    expect(creature.strikes).toEqual([]);
  });

  it('removeStrike reaches zero only for troops; non-troops keep the last row', () => {
    editorStore.startCreate();
    expect(editorStore.creature!.strikes).toHaveLength(1);
    editorStore.removeStrike(0);
    expect(editorStore.creature!.strikes).toHaveLength(1); // non-troop invariant holds

    editorStore.setTroop(true);
    editorStore.removeStrike(0);
    expect(editorStore.creature!.strikes).toHaveLength(0); // troop may empty out
  });
});
