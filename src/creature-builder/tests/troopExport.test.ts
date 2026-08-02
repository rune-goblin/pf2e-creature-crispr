import { describe, it, expect } from 'vitest';
import { normalizeTroopExport, troopSizeLabel } from '@/creature-builder/logic/troopExport';

const CRISPR = 'pf2e-creature-crispr';

const actor = (over: Record<string, any> = {}): Record<string, any> => ({
  _id: 'abc',
  name: 'Test Troop',
  type: 'npc',
  folder: 'f1',
  sort: 100,
  ownership: { default: 0 },
  _stats: { systemVersion: '6.0.0', compendiumSource: 'Compendium.pf2e.x.Actor.y' },
  img: 'art/troop.webp',
  prototypeToken: { texture: { src: 'art/troop.webp', scaleX: 1.6, scaleY: 1.6 } },
  system: {
    _migration: { version: 0.935, previous: null },
    details: { level: { value: 5 }, publication: { title: 'Elsewhere', remaster: false } },
    attributes: { hp: { value: 3, max: 60, temp: 4 } },
    traits: { value: ['troop'], size: { value: 'grg' } }
  },
  items: [
    {
      _id: 'i2', type: 'melee', name: 'Zeta',
      system: {},
      flags: { [CRISPR]: { itemBenchmarks: { attackBenchmark: 0.5 } } }
    },
    { _id: 'i1', type: 'action', name: 'Alpha', system: { description: { value: '<hr />' } } }
  ],
  flags: { [CRISPR]: { creatureData: { benchmarks: { hp: 0.5 }, baseLevel: 5, createdAt: 99, updatedAt: 99 } } },
  ...over
});

describe('normalizeTroopExport', () => {
  it('strips volatile state, keeps provenance, zeroes timestamps, resets health', () => {
    const doc = normalizeTroopExport(actor(), { slug: 'test-troop' });
    expect(doc._id).toBeUndefined();
    expect(doc.folder).toBeUndefined();
    expect(doc._stats).toEqual({ compendiumSource: 'Compendium.pf2e.x.Actor.y' });
    expect(doc.system.attributes.hp).toEqual({ value: 60, max: 60, temp: 0 });
    expect(doc.flags[CRISPR].creatureData).toMatchObject({ createdAt: 0, updatedAt: 0 });
    expect(doc.system.details.publication.remaster).toBe(true);
  });

  it('orders items by type then name and normalizes markup', () => {
    const doc = normalizeTroopExport(actor(), { slug: 'test-troop' });
    expect(doc.items.map((i: any) => i.name)).toEqual(['Alpha', 'Zeta']);
    expect(doc.items[0].system.description.value).toBe('<hr>');
  });

  it('pins the token for a one-hex map and severs dangling ring art', () => {
    const doc = normalizeTroopExport(actor(), { slug: 'test-troop' });
    expect(doc.prototypeToken).toMatchObject({
      displayName: 30,
      actorLink: true,
      texture: { scaleX: 1, scaleY: 1 },
      flags: { pf2e: { autoscale: false } },
      ring: { enabled: false, subject: { scale: 1, texture: null } }
    });
    expect(doc.prototypeToken.texture.src).toBe('art/troop.webp');
  });

  it('mirrors strike benchmarks into every requested scope, either side authoring', () => {
    for (const authoredBy of [CRISPR, 'pf2e-reignmaker']) {
      const source = actor();
      source.items[0].flags = { [authoredBy]: { itemBenchmarks: { attackBenchmark: 0.5 } } };
      const doc = normalizeTroopExport(source, { slug: 'test-troop', mirrorBenchmarkScopes: ['pf2e-reignmaker'] });
      const melee = doc.items.find((i: any) => i.type === 'melee');
      expect(melee.flags[CRISPR].itemBenchmarks, authoredBy).toEqual({ attackBenchmark: 0.5 });
      expect(melee.flags['pf2e-reignmaker'].itemBenchmarks, authoredBy).toEqual({ attackBenchmark: 0.5 });
    }
  });

  it('composes consumer flag payloads under creatureData, canonicalized with the doc', () => {
    const doc = normalizeTroopExport(actor(), {
      slug: 'test-troop',
      consumerFlags: { 'pf2e-reignmaker': { slug: 'test-troop', isTroop: true } }
    });
    expect(doc.flags['pf2e-reignmaker'].creatureData).toEqual({ slug: 'test-troop', isTroop: true });
    expect(Object.keys(doc)).toEqual([...Object.keys(doc)].sort());
  });

  it('rejects what a troop export cannot be', () => {
    expect(() => normalizeTroopExport(actor(), { slug: 'Bad Slug' })).toThrow(/invalid slug/);
    expect(() => normalizeTroopExport(actor({ type: 'character' }), { slug: 's' })).toThrow(/NPC actor source/);
    expect(() => normalizeTroopExport(actor({ flags: {} }), { slug: 's' })).toThrow(/creature data/);
    const untrooped = actor();
    untrooped.system.traits.value = [];
    expect(() => normalizeTroopExport(untrooped, { slug: 's' })).toThrow(/troop trait/);
    const small = actor();
    small.system.traits.size.value = 'med';
    expect(() => normalizeTroopExport(small, { slug: 's' })).toThrow(/troop size/);
  });
});

describe('troopSizeLabel', () => {
  it('maps the three troop sizes and nothing else', () => {
    expect(troopSizeLabel('lg')).toBe('large');
    expect(troopSizeLabel('huge')).toBe('huge');
    expect(troopSizeLabel('grg')).toBe('gargantuan');
    expect(troopSizeLabel('med')).toBeUndefined();
    expect(troopSizeLabel(undefined)).toBeUndefined();
  });
});
