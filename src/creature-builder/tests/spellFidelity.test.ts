import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncSpellcastingEntriesForLevel, extractSpellcastingStats } from '@/creature-builder/services/spells';
import { updateCreature } from '@/creature-builder/services/sync';
import {
  getStatRangesForLevel,
  spellStatToScalar,
  interpolateSpellStat,
  calculateCreatureStats
} from '@/creature-builder/logic/creatureStatTables';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';
import { CREATURE_FLAG, CREATURE_DATA_KEY, SPELL_BENCHMARK_KEY } from '@/creature-builder/services/constants';
import type { CreatureBenchmarks } from '@/creature-builder/logic/models';
import type { SpellEntryBenchmarkData } from '@/creature-builder/services/types';

const ACTOR_ID = 'spellcaster1';
// Level 12 DC range is mod 29 / high 32 / extreme 36, so DC 36 sits exactly at scalar 1.0 and DC 32
// at 0.5 — distinct benchmarks that a single "max" broadcast (the old flattening bug) would collapse.
const LEVEL = 12;

const dcRange = getStatRangesForLevel(LEVEL).spellDC;
const attackRange = getStatRangesForLevel(LEVEL).spellAttack;
const primaryDcScalar = spellStatToScalar(36, dcRange); // 1.0
const primaryAttackScalar = spellStatToScalar(24, attackRange); // 0.5 (level-12 attack high)
const innateDcScalar = spellStatToScalar(32, dcRange); // 0.5

const benchmarks: CreatureBenchmarks = {
  ...getDefaultBenchmarks(),
  spellDC: primaryDcScalar,
  spellAttack: primaryAttackScalar
};

type Slots = Record<string, { max?: number; prepared?: Array<{ id?: string | null; expended?: boolean }> }>;

interface EntryOpts {
  id: string;
  prepared?: 'prepared' | 'innate' | 'spontaneous';
  dc?: number;
  attack?: number;
  slots?: Slots;
  benchmark?: SpellEntryBenchmarkData; // undefined = unflagged (foreign) entry
}

function spellEntry(opts: EntryOpts) {
  return {
    id: opts.id,
    type: 'spellcastingEntry',
    system: {
      prepared: { value: opts.prepared ?? 'prepared' },
      spelldc: { dc: opts.dc, value: opts.attack },
      slots: opts.slots ?? {}
    },
    getFlag: (scope: string, key: string) =>
      scope === CREATURE_FLAG && key === SPELL_BENCHMARK_KEY ? opts.benchmark : undefined
  };
}

function makeActor(entries: ReturnType<typeof spellEntry>[], extraItems: Array<{ id: string; type: string }> = []) {
  return {
    id: ACTOR_ID,
    name: 'Archmage',
    items: { contents: [...entries, ...extraItems] },
    updateEmbeddedDocuments: vi.fn((_type?: string, _updates?: unknown[]) => Promise.resolve())
  };
}

const updatesOf = (actor: ReturnType<typeof makeActor>) =>
  (actor.updateEmbeddedDocuments.mock.calls[0]?.[1] ?? []) as Array<Record<string, any>>;

afterEach(() => {
  delete (globalThis as unknown as { game?: unknown }).game;
});

describe('extractSpellcastingStats — primary-entry basis (D6)', () => {
  it('returns the primary (first non-innate) entry DC/attack, not the max across entries', () => {
    const prepared = spellEntry({ id: 'e-prepared', prepared: 'prepared', dc: 30, attack: 20 });
    const innateHigher = spellEntry({ id: 'e-innate', prepared: 'innate', dc: 40, attack: 28 });
    const actor = { items: { contents: [prepared, innateHigher] } };
    expect(extractSpellcastingStats(actor as any)).toEqual({ spellDC: 30, spellAttack: 20 });
  });

  it('falls back to the first entry when every entry is innate', () => {
    const first = spellEntry({ id: 'e1', prepared: 'innate', dc: 25, attack: 15 });
    const second = spellEntry({ id: 'e2', prepared: 'innate', dc: 33, attack: 22 });
    const actor = { items: { contents: [first, second] } };
    expect(extractSpellcastingStats(actor as any)).toEqual({ spellDC: 25, spellAttack: 15 });
  });
});

describe('syncSpellcastingEntriesForLevel — per-entry scaling (D6)', () => {
  it('+2 rescale moves each entry per its own benchmark — the flattening is dead', async () => {
    const primary = spellEntry({
      id: 'e-prepared', prepared: 'prepared', dc: 36, attack: 24,
      benchmark: { dcBenchmark: primaryDcScalar, attackBenchmark: primaryAttackScalar, primary: true }
    });
    const innate = spellEntry({ id: 'e-innate', prepared: 'innate', dc: 32, benchmark: { dcBenchmark: innateDcScalar } });
    const actor = makeActor([primary, innate]);

    await syncSpellcastingEntriesForLevel(actor as any, LEVEL + 2, benchmarks, { previousLevel: LEVEL });

    const byId = Object.fromEntries(updatesOf(actor).map((u) => [u._id, u]));
    // Primary DC follows benchmarks.spellDC (scalar 1.0 → extreme at level 14 = 39).
    expect(byId['e-prepared']['system.spelldc.dc']).toBe(39);
    // Innate DC follows its own 0.5 flag benchmark (high at level 14 = 34).
    expect(byId['e-innate']['system.spelldc.dc']).toBe(34);
    expect(byId['e-prepared']['system.spelldc.dc']).not.toBe(byId['e-innate']['system.spelldc.dc']);
  });

  it('an editor spellDC benchmark edit changes the primary entry only; the innate entry is untouched', async () => {
    const editedBenchmarks = { ...benchmarks, spellDC: spellStatToScalar(32, dcRange) }; // 0.5 → DC 32 at level 12
    const primary = spellEntry({
      id: 'e-prepared', prepared: 'prepared', dc: 36, attack: 24,
      benchmark: { dcBenchmark: primaryDcScalar, attackBenchmark: primaryAttackScalar, primary: true }
    });
    const innate = spellEntry({ id: 'e-innate', prepared: 'innate', dc: 32, benchmark: { dcBenchmark: innateDcScalar } });
    const actor = makeActor([primary, innate]);

    await syncSpellcastingEntriesForLevel(actor as any, LEVEL, editedBenchmarks, { previousLevel: LEVEL });

    const updates = updatesOf(actor);
    const ids = updates.map((u) => u._id);
    expect(ids).toContain('e-prepared');
    expect(ids).not.toContain('e-innate'); // same level → non-primary entries never rewritten
    expect(updates.find((u) => u._id === 'e-prepared')!['system.spelldc.dc']).toBe(32);
  });

  it('applies a slot layout to the primary entry only; a secondary entry keeps its own slots', async () => {
    const withProgression = { ...benchmarks, spellProgression: 'fullPrepared' as const };
    const primary = spellEntry({
      id: 'e-primary', prepared: 'prepared', dc: 36, attack: 24,
      slots: { slot1: { max: 3, prepared: [{ id: 'sp1' }] } },
      benchmark: { dcBenchmark: primaryDcScalar, primary: true }
    });
    const secondary = spellEntry({
      id: 'e-secondary', prepared: 'prepared', dc: 32,
      slots: { slot1: { max: 2, prepared: [{ id: 'sp2' }] } },
      benchmark: { dcBenchmark: innateDcScalar }
    });
    const actor = makeActor([primary, secondary], [{ id: 'sp1', type: 'spell' }, { id: 'sp2', type: 'spell' }]);

    await syncSpellcastingEntriesForLevel(actor as any, LEVEL + 2, withProgression, { previousLevel: LEVEL });

    const primaryUpdate = updatesOf(actor).find((u) => u._id === 'e-primary')!;
    const secondaryUpdate = updatesOf(actor).find((u) => u._id === 'e-secondary')!;
    expect(Object.keys(primaryUpdate).some((k) => k.startsWith('system.slots.'))).toBe(true);
    // Secondary is rescaled for DC (level changed) but never receives a slot write.
    expect(secondaryUpdate).toBeDefined();
    expect(Object.keys(secondaryUpdate).some((k) => k.startsWith('system.slots.'))).toBe(false);
  });

  it('leaves an unflagged (foreign) entry untouched when the level is unchanged', async () => {
    const editedBenchmarks = { ...benchmarks, spellDC: spellStatToScalar(32, dcRange) };
    const primary = spellEntry({
      id: 'e-primary', prepared: 'prepared', dc: 36, attack: 24,
      benchmark: { dcBenchmark: primaryDcScalar, primary: true }
    });
    const foreign = spellEntry({ id: 'e-foreign', prepared: 'innate', dc: 30 }); // no flag
    const actor = makeActor([primary, foreign]);

    await syncSpellcastingEntriesForLevel(actor as any, LEVEL, editedBenchmarks, { previousLevel: LEVEL });

    expect(updatesOf(actor).map((u) => u._id)).not.toContain('e-foreign');
  });

  it('back-solves an unflagged entry from its own current value across a level change', async () => {
    const primary = spellEntry({
      id: 'e-primary', prepared: 'prepared', dc: 36, attack: 24,
      benchmark: { dcBenchmark: primaryDcScalar, primary: true }
    });
    const foreign = spellEntry({ id: 'e-foreign', prepared: 'innate', dc: 32 }); // no flag, DC 32 = 0.5 at level 12
    const actor = makeActor([primary, foreign]);

    await syncSpellcastingEntriesForLevel(actor as any, LEVEL + 2, benchmarks, { previousLevel: LEVEL });

    const foreignUpdate = updatesOf(actor).find((u) => u._id === 'e-foreign')!;
    // Back-solve 32 @ L12 → 0.5, forward @ L14 → 34: identical to a 0.5-flagged entry.
    expect(foreignUpdate['system.spelldc.dc']).toBe(34);
    expect(foreignUpdate['system.spelldc.dc']).toBe(Math.round(interpolateSpellStat(0.5, getStatRangesForLevel(LEVEL + 2).spellDC)));
  });
});

describe('updateCreature — no-edit save leaves spellcasting entries untouched (cornerstone)', () => {
  it('a no-op save issues zero embedded-item writes; both entry DCs are unchanged', async () => {
    const baseStats = calculateCreatureStats(LEVEL, benchmarks);
    const primary = spellEntry({
      id: 'e-prepared', prepared: 'prepared', dc: 36, attack: 24,
      benchmark: { dcBenchmark: primaryDcScalar, primary: true }
    });
    const innate = spellEntry({ id: 'e-innate', prepared: 'innate', dc: 32, benchmark: { dcBenchmark: innateDcScalar } });
    const actor = {
      id: ACTOR_ID,
      name: 'Archmage',
      system: {
        details: { level: { value: LEVEL } },
        attributes: { hp: { value: 100, max: 100 } },
        perception: {}
      },
      items: { contents: [primary, innate] },
      getFlag: (scope: string, key: string) =>
        scope === CREATURE_FLAG && key === CREATURE_DATA_KEY ? { benchmarks, baseLevel: LEVEL, baseStats } : undefined,
      setFlag: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      updateEmbeddedDocuments: vi.fn(() => Promise.resolve())
    };
    (globalThis as unknown as { game: unknown }).game = { actors: { get: (id: string) => (id === ACTOR_ID ? actor : undefined) } };

    await updateCreature(ACTOR_ID, { level: LEVEL, benchmarks, baseStats, baseLevel: LEVEL });

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(primary.system.spelldc.dc).toBe(36);
    expect(innate.system.spelldc.dc).toBe(32);
  });
});
