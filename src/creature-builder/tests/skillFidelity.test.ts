import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { syncSkillItems, syncNativeSkills, composeLoreItemSources } from '@/creature-builder/services/skills';
import { selectSaveStats } from '@/creature-builder/services/sync';
import { defaultSaveTarget } from '@/creature-builder/services/defaultSaveTarget';
import { calculateCreatureStats } from '@/creature-builder/logic/creatureStatTables';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';
import { CREATURE_FLAG, CREATURE_DATA_KEY } from '@/creature-builder/services/constants';
import type { CreatureBenchmarks } from '@/creature-builder/logic/models';
import type { EditableCreature } from '@/creature-builder/logic/editableCreature';

const ACTOR_ID = 'creature1';

interface LoreMock {
  id: string;
  name: string;
  type: string;
  system: { mod: { value: number }; slug?: string | null };
}

function lore(id: string, name: string, mod: number, slug?: string): LoreMock {
  return { id, name, type: 'lore', system: { mod: { value: mod }, slug: slug ?? null } };
}

const createSpy = vi.hoisted(() => vi.fn((_type?: string, _data?: unknown[]) => Promise.resolve()));
const createNPCSpy = vi.hoisted(() => vi.fn());

interface SkillActorOptions {
  lore?: LoreMock[];
  nativeSkills?: Record<string, unknown>;
}

function makeActor(opts: SkillActorOptions = {}) {
  return {
    id: ACTOR_ID,
    items: { contents: opts.lore ?? [] },
    _source: { system: { skills: opts.nativeSkills ?? {} } },
    update: vi.fn((_data?: unknown) => Promise.resolve()),
    createEmbeddedDocuments: vi.fn((_type?: string, _data?: unknown[]) => Promise.resolve()),
    updateEmbeddedDocuments: vi.fn((_type?: string, _data?: unknown[]) => Promise.resolve()),
    deleteEmbeddedDocuments: vi.fn((_type?: string, _ids?: string[]) => Promise.resolve())
  };
}

function install(actor: ReturnType<typeof makeActor>): void {
  (globalThis as unknown as { game: unknown }).game = {
    actors: { get: (id: string) => (id === ACTOR_ID ? actor : undefined) }
  };
}

afterEach(() => {
  delete (globalThis as unknown as { game?: unknown }).game;
  vi.restoreAllMocks();
});

describe('composeLoreItemSources', () => {
  it('emits a lore item per skill with its mod on system.mod.value', () => {
    const items = composeLoreItemSources({ Stealth: 12, 'warfare-lore': 20 });
    expect(items).toEqual([
      { type: 'lore', name: 'Stealth', system: { mod: { value: 12 } } },
      { type: 'lore', name: 'warfare-lore', system: { mod: { value: 20 } } }
    ]);
  });

  it('is empty for no skills', () => {
    expect(composeLoreItemSources({})).toEqual([]);
  });
});

describe('syncSkillItems — creation', () => {
  it('creates a lore item for a lore skill with no matching item', async () => {
    const actor = makeActor({ lore: [] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'Warfare Lore': 12 });

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(actor.createEmbeddedDocuments.mock.calls[0][1]).toEqual([
      { type: 'lore', name: 'Warfare Lore', system: { mod: { value: 12 } } }
    ]);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('does not lore-ify a native trained skill (leaves _source.system.skills untouched)', async () => {
    const actor = makeActor({ lore: [], nativeSkills: { acrobatics: { base: 12 }, athletics: { base: 18 } } });
    install(actor);

    await syncSkillItems(ACTOR_ID, { acrobatics: 12, athletics: 18 });

    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  // Bug-fix regression (Fix 2): the guard is by CORE_SKILL_SLUGS, so a capitalized dropdown name
  // ("Athletics") for a skill the actor already trains natively never mints a duplicate lore item.
  it('a capitalized core-skill dropdown name never creates a duplicate lore item', async () => {
    const actor = makeActor({ lore: [], nativeSkills: { athletics: { base: 18 } } });
    install(actor);

    await syncSkillItems(ACTOR_ID, { Athletics: 18 });

    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('syncSkillItems — edit', () => {
  it('updates mod only when it differs', async () => {
    const actor = makeActor({ lore: [lore('l1', 'Warfare Lore', 15)] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'warfare-lore': 22 });

    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(actor.updateEmbeddedDocuments.mock.calls[0][1]).toEqual([{ _id: 'l1', 'system.mod.value': 22 }]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('syncSkillItems — no-op', () => {
  it('a save with matching mods issues zero lore writes', async () => {
    const actor = makeActor({ lore: [lore('l1', 'Warfare Lore', 15), lore('l2', 'Stealth', 12)] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'warfare-lore': 15, 'stealth-lore': 12 });

    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('matches an item by its stored slug, not only its name', async () => {
    const actor = makeActor({ lore: [lore('l1', 'Warfare', 15, 'warfare-lore')] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'warfare-lore': 15 });

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('syncSkillItems — removal', () => {
  it('deletes a loaded lore item removed in the editor', async () => {
    const actor = makeActor({ lore: [lore('l1', 'Warfare Lore', 15), lore('l2', 'Stealth', 12)] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'warfare-lore': 15 });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(actor.deleteEmbeddedDocuments.mock.calls[0][1]).toEqual(['l2']);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

describe('syncSkillItems — a not-editor-loaded lore item is never touched', () => {
  it('leaves a mod-0 lore item alone (extraction never surfaces it, so absence is not a removal)', async () => {
    // extractSkillsFromActor drops mod-0 skills, so a +0 lore never reaches the editor.
    const actor = makeActor({ lore: [lore('l1', 'Warfare Lore', 15), lore('foreign', 'Bardic Lore', 0)] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'warfare-lore': 15 });

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('does not delete an unrelated non-zero lore that is still in the desired set', async () => {
    const actor = makeActor({ lore: [lore('l1', 'Warfare Lore', 15), lore('l2', 'Academia Lore', 9)] });
    install(actor);

    await syncSkillItems(ACTOR_ID, { 'warfare-lore': 15, 'academia-lore': 9 });

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});

// D7 create path (Fix 1): createCreatureActor partitions computed skills — core skills into the
// create payload as `system.skills.<slug>.base`, genuine lore names as lore items.
describe('createCreatureActor — skills partitioned into native + lore', () => {
  beforeEach(() => {
    createSpy.mockClear();
    createNPCSpy.mockReset();
    createNPCSpy.mockResolvedValue({ id: 'new1', createEmbeddedDocuments: createSpy });
    vi.resetModules();
    vi.doMock('@/creature-builder/services/folderManager', () => ({
      createNPCInFolder: createNPCSpy,
      ensureCreatureFolder: vi.fn(),
      requireActor: vi.fn()
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/creature-builder/services/folderManager');
    vi.resetModules();
  });

  it('writes core skills to the create payload natively and only genuine lore as lore items', async () => {
    const { createCreatureActor } = await import('@/creature-builder/services/crud');
    const benchmarks: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      skills: [{ skill: 'Athletics', benchmark: 0.5 }, { skill: 'Warfare Lore', benchmark: 2 / 3 }]
    };
    const stats = calculateCreatureStats(5, benchmarks);

    await createCreatureActor('Test', 5, benchmarks, {});

    const actorData = createNPCSpy.mock.calls[0][1] as { system: { skills?: Record<string, { base: number }> } };
    expect(actorData.system.skills).toEqual({ athletics: { base: stats.skills.Athletics } });

    const loreCall = createSpy.mock.calls.find((c) =>
      Array.isArray(c[1]) && (c[1] as Array<{ type?: string }>).every((i) => i.type === 'lore')
    );
    expect(loreCall).toBeDefined();
    expect(loreCall![1]).toEqual([
      { type: 'lore', name: 'Warfare Lore', system: { mod: { value: stats.skills['Warfare Lore'] } } }
    ]);

    // No lore item is minted for the core skill (would double-represent it on the next save).
    const loreNames = createSpy.mock.calls
      .flatMap((c) => (Array.isArray(c[1]) ? (c[1] as Array<{ name?: string }>) : []))
      .map((i) => i.name);
    expect(loreNames).not.toContain('Athletics');
  });
});

// D1 interplay: the save target syncs skills from the same stats object it selects for the stat write.
describe('selectSaveStats — skills verbatim at baseLevel (D1 interplay)', () => {
  const benchmarks = getDefaultBenchmarks();

  it('returns baseStats verbatim (so baseStats.skills, not a recompute) at baseLevel', () => {
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { 'warfare-lore': 99 } };
    const stats = selectSaveStats(5, benchmarks, baseStats, 5);
    expect(stats.skills).toEqual({ 'warfare-lore': 99 });
  });

  it('recomputes skills from benchmarks when the level differs from baseLevel', () => {
    const bm: CreatureBenchmarks = { ...benchmarks, skills: [{ skill: 'stealth', benchmark: 0.5 }] };
    const baseStats = { ...calculateCreatureStats(5, bm), skills: { 'warfare-lore': 99 } };
    const stats = selectSaveStats(6, bm, baseStats, 5);
    expect(stats.skills).not.toHaveProperty('warfare-lore');
    expect(stats.skills.stealth).toBe(calculateCreatureStats(6, bm).skills.stealth);
  });
});

interface FullActorOptions {
  nativeSkills?: Record<string, unknown>;
  flag?: Record<string, unknown>;
}

function makeFullActor(loreItems: LoreMock[], level: number, benchmarks: CreatureBenchmarks, opts: FullActorOptions = {}) {
  const flag = opts.flag ?? { benchmarks, baseLevel: level };
  return {
    id: ACTOR_ID,
    name: 'C',
    system: {
      details: { level: { value: level } },
      attributes: { hp: { value: 50, max: 50 } },
      perception: {}
    },
    _source: { system: { skills: opts.nativeSkills ?? {} } },
    items: { contents: loreItems, get: (id: string) => loreItems.find((l) => l.id === id) },
    getFlag: (scope: string, key: string) =>
      scope === CREATURE_FLAG && key === CREATURE_DATA_KEY ? flag : undefined,
    setFlag: vi.fn(() => Promise.resolve()),
    update: vi.fn((_data?: unknown) => Promise.resolve()),
    createEmbeddedDocuments: vi.fn(() => Promise.resolve()),
    updateEmbeddedDocuments: vi.fn(() => Promise.resolve()),
    deleteEmbeddedDocuments: vi.fn(() => Promise.resolve())
  };
}

/** All args passed to `actor.update` that write anything under `system.skills` (dotted or nested). */
function skillUpdateCalls(actor: { update: { mock: { calls: unknown[][] } } }): Record<string, unknown>[] {
  return actor.update.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .filter((arg) =>
      Object.keys(arg).some((k) => k.startsWith('system.skills')) ||
      Boolean((arg.system as { skills?: unknown } | undefined)?.skills)
    );
}

function makeCreature(over: Partial<EditableCreature>): EditableCreature {
  return {
    name: 'C', level: 5, creatureType: 'creature', size: 'medium', traits: [],
    benchmarks: getDefaultBenchmarks(), strikes: [], specialAbilities: [],
    immunities: [], resistances: [], weaknesses: [], speeds: { land: 25 }, languages: [], senses: [],
    ...over
  };
}

describe('defaultSaveTarget.updateActor — skill lore items (D7 + D1 interplay)', () => {
  const benchmarks = getDefaultBenchmarks();

  it('writes baseStats.skills verbatim at baseLevel (not a recompute)', async () => {
    const actor = makeFullActor([lore('l1', 'Warfare Lore', 15)], 5, benchmarks);
    install(actor);
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { 'warfare-lore': 99 } };
    const creature = makeCreature({ actorId: ACTOR_ID, level: 5, benchmarks, baseStats, baseLevel: 5 });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{ _id: 'l1', 'system.mod.value': 99 }]);
  });

  it('a no-op save issues zero lore writes through the full save path', async () => {
    const actor = makeFullActor([lore('l1', 'Warfare Lore', 15)], 5, benchmarks);
    install(actor);
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { 'warfare-lore': 15 } };
    const creature = makeCreature({ actorId: ACTOR_ID, level: 5, benchmarks, baseStats, baseLevel: 5 });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  // Bug-fix regression (Fix 1): deletion is restricted to the flag's load-time skill set. A lore item
  // added on the PF2e sheet after the flag was written (here "Bardic Lore", absent from the flag) is
  // never a delete candidate on a zero-edit save.
  it('leaves an on-actor lore item absent from the flag untouched on a zero-edit save', async () => {
    const flag = {
      benchmarks,
      baseLevel: 5,
      baseStats: { ...calculateCreatureStats(5, benchmarks), skills: { 'warfare-lore': 15 } }
    };
    const actor = makeFullActor(
      [lore('l1', 'Warfare Lore', 15), lore('extra', 'Bardic Lore', 9)],
      5,
      benchmarks,
      { flag }
    );
    install(actor);
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { 'warfare-lore': 15 } };
    const creature = makeCreature({ actorId: ACTOR_ID, level: 5, benchmarks, baseStats, baseLevel: 5 });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('writes a native baseStats.skills mod verbatim at baseLevel (off-table) via a scoped base write', async () => {
    const flag = {
      benchmarks,
      baseLevel: 5,
      baseStats: { ...calculateCreatureStats(5, benchmarks), skills: { athletics: 99 } }
    };
    const actor = makeFullActor([], 5, benchmarks, {
      nativeSkills: { athletics: { base: 10, special: [{ label: 'to Climb', base: 12 }] } },
      flag
    });
    install(actor);
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { athletics: 99 } };
    const creature = makeCreature({ actorId: ACTOR_ID, level: 5, benchmarks, baseStats, baseLevel: 5 });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(actor.update).toHaveBeenCalledWith({ 'system.skills.athletics.base': 99 });
  });

  // Fix 1 cornerstone: a created actor (core skill native + lore item) reloaded and saved with zero
  // edits writes nothing — neither `system.skills` nor lore. This is the double-representation the
  // pre-fix create flow caused: a lore-ified "Athletics" reclassified native, then mutated on save.
  it('a no-op save mixing a native core skill and a lore skill writes nothing', async () => {
    const flag = {
      benchmarks,
      baseLevel: 5,
      baseStats: { ...calculateCreatureStats(5, benchmarks), skills: { Athletics: 18, 'Warfare Lore': 15 } }
    };
    const actor = makeFullActor([lore('l1', 'Warfare Lore', 15)], 5, benchmarks, {
      nativeSkills: { athletics: { base: 18 } },
      flag
    });
    install(actor);
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { Athletics: 18, 'Warfare Lore': 15 } };
    const creature = makeCreature({ actorId: ACTOR_ID, level: 5, benchmarks, baseStats, baseLevel: 5 });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(skillUpdateCalls(actor)).toEqual([]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('a level-change save writes both the scaled base and the scaled special variants', async () => {
    const stealthBenchmarks: CreatureBenchmarks = {
      ...getDefaultBenchmarks(),
      skills: [{ skill: 'stealth', benchmark: 1 / 6 }]
    };
    const baseStats = calculateCreatureStats(9, stealthBenchmarks);
    const flag = { benchmarks: stealthBenchmarks, baseLevel: 9, baseStats };
    const actor = makeFullActor([], 9, stealthBenchmarks, {
      nativeSkills: { stealth: { base: 16, special: [{ base: 20, label: 'in forests' }] } },
      flag
    });
    install(actor);
    const creature = makeCreature({
      actorId: ACTOR_ID,
      level: 14,
      benchmarks: stealthBenchmarks,
      baseStats,
      baseLevel: 9
    });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(baseStats.skills.stealth).toBe(16);
    expect(skillUpdateCalls(actor)).toEqual([
      {
        'system.skills.stealth.base': 23,
        'system.skills.stealth.special': [{ base: 28, label: 'in forests' }]
      }
    ]);
  });

  it('a no-op save on an actor with native skills issues zero system.skills writes (cornerstone)', async () => {
    const flag = {
      benchmarks,
      baseLevel: 5,
      baseStats: { ...calculateCreatureStats(5, benchmarks), skills: { athletics: 18 } }
    };
    const actor = makeFullActor([], 5, benchmarks, {
      nativeSkills: { athletics: { base: 18, special: [{ label: 'to Climb', base: 20 }] } },
      flag
    });
    install(actor);
    const baseStats = { ...calculateCreatureStats(5, benchmarks), skills: { athletics: 18 } };
    const creature = makeCreature({ actorId: ACTOR_ID, level: 5, benchmarks, baseStats, baseLevel: 5 });

    await defaultSaveTarget.updateActor(ACTOR_ID, creature);

    expect(skillUpdateCalls(actor)).toEqual([]);
  });
});

describe('syncNativeSkills — native core-skill persistence (D7 amendment)', () => {
  it('edits a native skill mod with a single scoped system.skills.<slug>.base write (special sibling untouched)', async () => {
    const actor = makeActor({ nativeSkills: { athletics: { base: 18, special: [{ label: 'to Climb', base: 20 }] } } });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { athletics: 22 }, new Set(['athletics']));

    expect(actor.update).toHaveBeenCalledTimes(1);
    expect(actor.update).toHaveBeenCalledWith({ 'system.skills.athletics.base': 22 });
    // The write is the scoped base sub-key only — never the whole skill object — so `special` survives.
    expect(Object.keys(actor.update.mock.calls[0][0] as object)).toEqual(['system.skills.athletics.base']);
  });

  it('is a zero-write no-op when the desired mod already matches _source', async () => {
    const actor = makeActor({ nativeSkills: { athletics: { base: 18 } } });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { athletics: 18 }, new Set(['athletics']));

    expect(actor.update).not.toHaveBeenCalled();
  });

  it('deletes a loaded native skill (-=slug) but never a native skill the editor did not load', async () => {
    const actor = makeActor({ nativeSkills: { athletics: { base: 18 }, acrobatics: { base: 12 }, stealth: { base: 20 } } });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { athletics: 18 }, new Set(['athletics', 'acrobatics']));

    expect(actor.update).toHaveBeenCalledTimes(1);
    expect(actor.update).toHaveBeenCalledWith({ 'system.skills.-=acrobatics': null });
  });

  // Fix 2: an unflagged (foreign) actor has no load-time native set; the fallback treats its
  // currently-trained core skills (base !== 0) as loaded, so one removed in the editor is untrained.
  it('untrains a removed native skill on an UNFLAGGED actor via the base!==0 fallback', async () => {
    const actor = makeActor({ nativeSkills: { acrobatics: { base: 12 }, athletics: { base: 18 } } });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { athletics: 18 });

    expect(actor.update).toHaveBeenCalledTimes(1);
    expect(actor.update).toHaveBeenCalledWith({ 'system.skills.-=acrobatics': null });
  });

  it('a no-op save on the same unflagged actor writes nothing (fallback keeps cornerstone)', async () => {
    const actor = makeActor({ nativeSkills: { acrobatics: { base: 12 }, athletics: { base: 18 } } });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { acrobatics: 12, athletics: 18 });

    expect(actor.update).not.toHaveBeenCalled();
  });

  it('scales special[] variants positionally on a level change, preserving label and predicate', async () => {
    // Arboreal Copse (level 9): stealth 16 is exactly lowMax, its "in forests" 20 exactly high.
    const actor = makeActor({
      nativeSkills: {
        stealth: { base: 16, note: 'keep me', special: [{ base: 20, label: 'in forests', predicate: ['terrain:forest'] }] }
      }
    });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { stealth: 23 }, new Set(['stealth']), { previousLevel: 9, level: 14 });

    expect(actor.update).toHaveBeenCalledTimes(1);
    expect(actor.update).toHaveBeenCalledWith({
      'system.skills.stealth.base': 23,
      'system.skills.stealth.special': [{ base: 28, label: 'in forests', predicate: ['terrain:forest'] }]
    });
  });

  it('scales an off-benchmark special by its position between high and extreme', async () => {
    // Arboreal Warden: "14 to Impersonate" at level 4 sits two-thirds from high (12) to extreme (15).
    const actor = makeActor({
      nativeSkills: { deception: { base: 10, special: [{ base: 14, label: 'to Impersonate a tree' }] } }
    });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { deception: 18 }, new Set(['deception']), { previousLevel: 4, level: 9 });

    expect(actor.update).toHaveBeenCalledWith({
      'system.skills.deception.base': 18,
      'system.skills.deception.special': [{ base: 22, label: 'to Impersonate a tree' }]
    });
  });

  it('writes nothing on a same-level save of a skill carrying specials (cornerstone)', async () => {
    const actor = makeActor({
      nativeSkills: { stealth: { base: 16, special: [{ base: 20, label: 'in forests' }] } }
    });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { stealth: 16 }, new Set(['stealth']), { previousLevel: 9, level: 9 });

    expect(actor.update).not.toHaveBeenCalled();
  });

  it('leaves the specials of a skill the editor never managed untouched on a level change', async () => {
    const actor = makeActor({
      nativeSkills: {
        stealth: { base: 16, special: [{ base: 20, label: 'in forests' }] },
        survival: { base: 15, special: [{ base: 19, label: 'to Track' }] }
      }
    });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { stealth: 23 }, new Set(['stealth']), { previousLevel: 9, level: 14 });

    expect(actor.update).toHaveBeenCalledTimes(1);
    expect(Object.keys(actor.update.mock.calls[0][0] as object)).toEqual([
      'system.skills.stealth.base',
      'system.skills.stealth.special'
    ]);
  });

  it('adds a core-skill name to an actor lacking it as a native base write, not a lore item', async () => {
    const actor = makeActor({ lore: [], nativeSkills: {} });
    install(actor);

    await syncNativeSkills(ACTOR_ID, { Athletics: 18 });
    await syncSkillItems(ACTOR_ID, { Athletics: 18 });

    expect(actor.update).toHaveBeenCalledWith({ 'system.skills.athletics.base': 18 });
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
