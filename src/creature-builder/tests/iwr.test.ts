import { describe, it, expect } from 'vitest';
import {
  RESISTANCE_TYPES,
  WEAKNESS_TYPES,
  IMMUNITY_TYPES,
  EXCEPTION_TYPES,
  RESISTANCE_TYPE_GROUPS,
  IMMUNITY_TYPE_GROUPS,
  humanizeIwrType
} from '@/creature-builder/logic/iwrTypes';
import { buildIwrSystem } from '@/creature-builder/services/crud';

const noDuplicates = (slugs: string[]) => expect(new Set(slugs).size).toBe(slugs.length);

describe('IWR type vocabularies', () => {
  it('have no duplicate slugs', () => {
    noDuplicates(RESISTANCE_TYPES);
    noDuplicates(WEAKNESS_TYPES);
    noDuplicates(IMMUNITY_TYPES);
    noDuplicates(EXCEPTION_TYPES);
  });

  it('cover the categories/materials that the old damage-only list omitted', () => {
    // The bug that started the audit: `physical` is the 2nd most common resistance but was unpickable.
    for (const slug of ['physical', 'all-damage', 'energy', 'precision', 'area-damage', 'critical-hits']) {
      expect(RESISTANCE_TYPES).toContain(slug);
    }
    for (const material of ['silver', 'cold-iron', 'adamantine', 'orichalcum', 'dawnsilver']) {
      expect(RESISTANCE_TYPES).toContain(material);
      expect(WEAKNESS_TYPES).toContain(material);
    }
    expect(WEAKNESS_TYPES).toContain('cold-iron'); // the single most common weakness in the bestiary
    expect(WEAKNESS_TYPES).toContain('splash-damage');
  });

  it('model immunities as conditions/effects without damage-only artifacts', () => {
    for (const slug of ['paralyzed', 'sleep', 'death-effects', 'disease', 'magic']) {
      expect(IMMUNITY_TYPES).toContain(slug);
    }
    // immunityTypes (PF2e) has no `plant` and uses `magic`, not `magical`.
    expect(IMMUNITY_TYPES).not.toContain('plant');
    expect(IMMUNITY_TYPES).not.toContain('magical');
  });

  it('offer the exception/doubleVs slugs the bestiary actually uses', () => {
    for (const slug of ['silver', 'adamantine', 'cold-iron', 'force', 'ghost-touch', 'vitality', 'non-magical']) {
      expect(EXCEPTION_TYPES).toContain(slug);
    }
  });

  it('humanizes slugs for display', () => {
    expect(humanizeIwrType('cold-iron')).toBe('Cold Iron');
    expect(humanizeIwrType('ghost-touch')).toBe('Ghost Touch');
    expect(humanizeIwrType('all-damage')).toBe('All Damage');
    expect(humanizeIwrType('fire')).toBe('Fire');
  });

  it('groups partition into their flat list', () => {
    expect(RESISTANCE_TYPE_GROUPS.flatMap((g) => g.options.map((o) => o.value))).toEqual(RESISTANCE_TYPES);
    expect(IMMUNITY_TYPE_GROUPS.flatMap((g) => g.options.map((o) => o.value))).toEqual(IMMUNITY_TYPES);
  });
});

describe('buildIwrSystem', () => {
  it('writes immunities without a value and drops empty exceptions', () => {
    const { immunities } = buildIwrSystem({
      immunities: [{ type: 'fire' }, { type: 'physical', exceptions: [] }]
    });
    expect(immunities).toEqual([{ type: 'fire' }, { type: 'physical' }]);
    expect(immunities[0]).not.toHaveProperty('value');
  });

  it('serializes a resistance with exceptions and doubleVs', () => {
    const { resistances } = buildIwrSystem({
      resistances: [{ type: 'physical', value: 10, exceptions: ['silver'] }, { type: 'all-damage', value: 15, exceptions: ['force'], doubleVs: ['non-magical'] }]
    });
    expect(resistances).toEqual([
      { type: 'physical', value: 10, exceptions: ['silver'] },
      { type: 'all-damage', value: 15, exceptions: ['force'], doubleVs: ['non-magical'] }
    ]);
  });

  it('keeps a weakness value and omits doubleVs/empty exceptions', () => {
    const { weaknesses } = buildIwrSystem({ weaknesses: [{ type: 'cold-iron', value: 5, exceptions: [], doubleVs: ['x'] }] });
    expect(weaknesses).toEqual([{ type: 'cold-iron', value: 5 }]);
  });

  it('returns empty arrays when nothing is supplied', () => {
    expect(buildIwrSystem({})).toEqual({ immunities: [], weaknesses: [], resistances: [] });
  });
});
