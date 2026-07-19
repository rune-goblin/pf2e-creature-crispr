import { describe, it, expect, afterEach } from 'vitest';
import { buildCreatureSnapshot } from '@/creature-builder/services/import';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';

// Regression: the editor's "Export" snapshot (defaultSaveTarget.exportActor → exportCreatureToFile)
// once hand-assembled only name/level/size/traits/benchmarks/stats and DROPPED movement speed, senses,
// languages and IWR. A consumer rebuilding from that snapshot had no source for those, so a converted
// troop silently lost its Speed (fell back to the 25 ft default). These attributes are carried verbatim
// by the editor and must survive the snapshot untouched.

interface FakeActorConfig {
  name?: string;
  level?: number;
  speed?: { value?: number; otherSpeeds?: Array<{ type: string; value: number }> };
  languages?: string[];
  senses?: Array<{ type: string; acuity?: string; range?: number | null }>;
  weaknesses?: Array<{ type: string; value: number }>;
  resistances?: Array<{ type: string; value: number }>;
  immunities?: Array<{ type: string }>;
}

const ACTOR_ID = 'abc123';

function stubGameActor(cfg: FakeActorConfig): void {
  const actor = {
    name: cfg.name ?? 'Wolf',
    img: 'icons/wolf.webp',
    prototypeToken: { texture: { src: 'tokens/wolf.webp' } },
    system: {
      details: { level: { value: cfg.level ?? 3 }, creatureType: 'animal', languages: { value: cfg.languages ?? [] } },
      traits: { size: { value: 'med' }, value: ['animal'] },
      // No `speed` here, faithfully to PF2e v8: preparation deletes the prepared
      // `attributes.speed` (movement lives on `system.movement`), so a reader that still
      // looks here gets the land-25 default — the regression these tests pin.
      attributes: {
        weaknesses: cfg.weaknesses ?? [],
        resistances: cfg.resistances ?? [],
        immunities: cfg.immunities ?? []
      },
      perception: { senses: cfg.senses ?? [] }
    },
    _source: {
      system: { attributes: { speed: cfg.speed ?? { value: 35, otherSpeeds: [] } } }
    },
    // No CRISPR flag → snapshot falls back to default benchmarks, which is fine for this test.
    getFlag: () => undefined
  };
  (globalThis as unknown as { game: unknown }).game = {
    actors: { get: (id: string) => (id === ACTOR_ID ? actor : undefined) }
  };
}

afterEach(() => {
  delete (globalThis as unknown as { game?: unknown }).game;
});

describe('buildCreatureSnapshot pass-through attributes', () => {
  it('carries land speed and other movement speeds', () => {
    stubGameActor({ speed: { value: 40, otherSpeeds: [{ type: 'fly', value: 60 }, { type: 'swim', value: 25 }] } });
    const snap = buildCreatureSnapshot(ACTOR_ID, 0) as { speeds: Record<string, number> };
    expect(snap.speeds).toEqual({ land: 40, fly: 60, swim: 25 });
  });

  it('does not silently reset a non-default land speed to 25', () => {
    stubGameActor({ speed: { value: 50, otherSpeeds: [] } });
    const snap = buildCreatureSnapshot(ACTOR_ID, 0) as { speeds: { land: number } };
    expect(snap.speeds.land).toBe(50);
  });

  it('carries senses, languages, and IWR', () => {
    stubGameActor({
      languages: ['common', 'orcish'],
      senses: [{ type: 'darkvision' }, { type: 'scent', acuity: 'imprecise', range: 30 }],
      weaknesses: [{ type: 'fire', value: 5 }],
      resistances: [{ type: 'physical', value: 10 }],
      immunities: [{ type: 'poison' }]
    });
    const snap = buildCreatureSnapshot(ACTOR_ID, 0) as {
      languages: string[];
      senses: Array<{ type: string; acuity?: string; range?: number }>;
      weaknesses: Array<{ type: string; value: number }>;
      resistances: Array<{ type: string; value: number }>;
      immunities: Array<{ type: string }>;
    };
    expect(snap.languages).toEqual(['common', 'orcish']);
    expect(snap.senses).toContainEqual({ type: 'darkvision' });
    expect(snap.senses).toContainEqual({ type: 'scent', acuity: 'imprecise', range: 30 });
    expect(snap.weaknesses).toContainEqual({ type: 'fire', value: 5 });
    expect(snap.resistances).toContainEqual({ type: 'physical', value: 10 });
    expect(snap.immunities).toContainEqual({ type: 'poison' });
  });

  it('still carries the benchmark/stat core it always did', () => {
    stubGameActor({ level: 5 });
    const snap = buildCreatureSnapshot(ACTOR_ID, 123) as { level: number; benchmarks: unknown; stats: unknown; exportedAt: number };
    expect(snap.level).toBe(5);
    expect(snap.benchmarks).toEqual(getDefaultBenchmarks());
    expect(snap.stats).toBeDefined();
    expect(snap.exportedAt).toBe(123);
  });
});
