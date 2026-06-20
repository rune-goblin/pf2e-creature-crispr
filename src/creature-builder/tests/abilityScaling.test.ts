import { describe, it, expect } from 'vitest';
import { parseAbilityDescription, renderAbilityDescription } from '@/creature-builder/logic/abilityScaling';

const wrap = (s: string) => `<p>${s}</p>`;
const parse = (s: string, level = 15) => parseAbilityDescription(wrap(s), level);
const damages = (s: string, level = 15) =>
  parse(s, level).scalableValues.filter(v => v.type === 'damage' || v.type === 'persistent');

// Regression: bestiary area damage carries trailing |options:/|traits: flags inside the @Damage
// brackets (Graveknight's Devastating Blast). It must be picked up and rescale with the @Check DC.
describe('@Damage with trailing |flags (the original bug)', () => {
  const desc =
    'Creatures take @Damage[9d12[fire]|options:area-damage] damage ' +
    '(@Check[reflex|dc:36|basic|options:area-effect] save).';

  it('extracts both the damage macro and the DC', () => {
    const types = parse(desc).scalableValues.map(v => v.type).sort();
    expect(types).toEqual(['damage', 'dc']);
  });

  it('rescales the damage down with level instead of freezing it', () => {
    const p = parse(desc);
    expect(renderAbilityDescription(p.template, p.scalableValues, 15)).toContain('@Damage[9d12[fire]|options:area-damage]');
    const scaled = renderAbilityDescription(p.template, p.scalableValues, 5);
    expect(scaled).not.toContain('9d12');
    expect(scaled).toMatch(/@Damage\[\d+d\d+(?:[+-]\d+)?\[fire\]\|options:area-damage\]/);
  });
});

describe('@Damage forms now covered', () => {
  it('parenthesized formula with a flat modifier', () => {
    const d = damages('@Damage[(2d10+10)[mental]]');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ type: 'damage', originalValue: '2d10+10', damageType: 'mental' });
  });

  it('multi-instance: one scalable value per damage instance', () => {
    const d = damages('@Damage[(1d8+7)[bludgeoning],1d6[acid]]');
    expect(d.map(v => v.originalValue)).toEqual(['1d8+7', '1d6']);
    expect(d.map(v => v.damageType)).toEqual(['bludgeoning', 'acid']);
  });

  it('multi-instance with identical formulas keeps a placeholder each', () => {
    const p = parse('@Damage[5d6[fire],5d6[void]]');
    expect(p.template).toContain('@Damage[{0}[fire],{1}[void]]');
    expect(p.scalableValues).toHaveLength(2);
  });

  it('flat numeric damage', () => {
    const d = damages('@Damage[7[piercing]]');
    expect(d[0]).toMatchObject({ type: 'damage', originalValue: '7', damageType: 'piercing' });
  });

  it('flat numeric with options flag', () => {
    const p = parse('@Damage[20[bludgeoning]|options:fall-damage]');
    expect(p.template).toContain('@Damage[{0}[bludgeoning]|options:fall-damage]');
  });

  it('persistent flat damage is typed persistent', () => {
    const d = damages('@Damage[5[persistent,acid]]');
    expect(d[0]).toMatchObject({ type: 'persistent', originalValue: '5', damageType: 'acid' });
  });

  it('nested splash damage preserves the [splash]/[type] brackets', () => {
    const p = parse('@Damage[(2d8[splash])[acid]]');
    expect(p.scalableValues.filter(v => v.type === 'damage')).toHaveLength(1);
    expect(p.template).toContain('@Damage[({0}[splash])[acid]]');
  });
});

describe('@Damage flat damage scales as an integer, not dice', () => {
  it('a level-15 flat 20 drops to a smaller flat number at level 5', () => {
    const p = parse('@Damage[20[bludgeoning]]', 15);
    const scaled = renderAbilityDescription(p.template, p.scalableValues, 5);
    const m = scaled.match(/@Damage\[(\d+)\[bludgeoning\]\]/);
    expect(m).not.toBeNull();
    const n = Number(m![1]);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeLessThan(20);
  });
});

describe('@Damage forms deliberately LEFT UNTOUCHED', () => {
  it.each([
    '@Damage[floor(1 + @actor.level/2)d6[void]|options:area-damage]',
    '@Damage[(max(1,@actor.level))[healing]]',
    '@Damage[(2d6 + 4 + (2d6[precision]))[slashing]]',
    '@Damage[(2*2d12)[persistent,force]]'
  ])('does not scale and renders unchanged: %s', (macro) => {
    const p = parse(macro);
    expect(p.scalableValues.filter(v => v.type !== 'dc')).toHaveLength(0);
    // round-trips verbatim at any level (no placeholder was inserted)
    expect(renderAbilityDescription(p.template, p.scalableValues, 5)).toContain(macro);
  });
});

describe('@Check DC in any position / lore types', () => {
  it.each([
    ['@Check[engineering-lore|dc:20]', 20],
    ['@Check[fortitude|immutable:true|dc:25]', 25],
    ['@Check[reflex|basic|dc:30|options:area-effect]', 30]
  ])('captures the DC in %s', (macro, dc) => {
    const dcs = parse(macro).scalableValues.filter(v => v.type === 'dc');
    expect(dcs).toHaveLength(1);
    expect(dcs[0].originalValue).toBe(String(dc));
  });

  it('tolerates a trailing space after the DC', () => {
    const dcs = parse('@Check[fortitude|dc:31 |name:Greater Disrupting]').scalableValues.filter(v => v.type === 'dc');
    expect(dcs[0]?.originalValue).toBe('31');
  });
});

describe('@Check forms with no scalable DC are left alone', () => {
  it.each([
    '@Check[athletics]',
    '@Check[crafting|defense:fortitude]',
    '@Check[flat|dc:5]',
    '@Check[reflex|basic|dc:0|options:area-effect]'
  ])('produces no DC scalable value: %s', (macro) => {
    expect(parse(macro).scalableValues.filter(v => v.type === 'dc')).toHaveLength(0);
  });
});

describe('plain-text DC / damage substitution (position-based)', () => {
  it('scales a plain "DC 25" and preserves a trailing save name', () => {
    const p = parse('makes a DC 25 Fortitude save', 15);
    const dcs = p.scalableValues.filter(v => v.type === 'dc');
    expect(dcs).toHaveLength(1);
    expect(dcs[0].originalValue).toBe('25');
    expect(p.template).toContain('DC {0} Fortitude');
  });

  it('handles the "N DC" word order', () => {
    const p = parse('a 30 DC check', 15);
    expect(p.scalableValues.filter(v => v.type === 'dc')[0]?.originalValue).toBe('30');
    expect(p.template).toContain('{0} DC');
  });

  it('substitutes a DC with irregular internal whitespace (the old content-replace silently missed this)', () => {
    const p = parse('a basic save (DC  25)', 15); // two spaces between "DC" and the number
    expect(p.scalableValues.filter(v => v.type === 'dc')).toHaveLength(1);
    expect(p.template).toContain('{0}');
    expect(p.template).not.toContain('25');
  });
});
