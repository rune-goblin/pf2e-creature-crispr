import { describe, it, expect } from 'vitest';
import {
  parseAbilityDescription,
  renderAbilityDescription,
  renderAbilityDescriptionHtml,
  healingToBenchmark,
  scaleHealing,
  getEffectiveValue,
  getScaledRecommendation,
  getDisplayBenchmark,
  getFastHealingRange,
  readFastHealingRule,
  buildFastHealingRule,
  setFastHealingRuleValue,
  composeFastHealingName
} from '@/creature-builder/logic/abilityScaling';
import type { ScalableValue } from '@/creature-builder/logic/models';
import { BENCHMARK_VALUES_3 } from '@/creature-builder/logic/models';

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

// Regression: a placeholder inside an @Check/@Damage macro must render as a plain value, not an
// inline <span> — the span corrupts the macro brackets so Foundry leaves the raw "@Check[…]" text.
describe('renderAbilityDescriptionHtml keeps macro placeholders enrichable', () => {
  it('substitutes an in-@Check DC as a plain number, leaving the macro intact', () => {
    const p = parse('attempt a @Check[fortitude|dc:25] save', 15);
    const html = renderAbilityDescriptionHtml(p.template, p.scalableValues, 15);
    expect(html).toContain('@Check[fortitude|dc:25]');
    expect(html).not.toContain('scalable-inline');
    expect(html).not.toContain('<span');
  });

  it('leaves @Damage (and its co-scaled @Check) macros plain — no span inside the brackets', () => {
    const p = parse('@Damage[9d12[fire]|options:area-damage] (@Check[reflex|dc:36|basic] save)', 15);
    const html = renderAbilityDescriptionHtml(p.template, p.scalableValues, 15);
    expect(html).toContain('@Damage[9d12[fire]|options:area-damage]');
    expect(html).toContain('@Check[reflex|dc:36|basic]');
    expect(html).not.toContain('<span');
  });

  it('still wraps a free-text DC in the cross-highlightable inline tag', () => {
    const p = parse('makes a DC 25 Fortitude save', 15);
    const html = renderAbilityDescriptionHtml(p.template, p.scalableValues, 15);
    expect(html).toMatch(/<span class="scalable-inline" data-scalable-index="0">25<\/span>/);
    expect(html).not.toContain('{0}');
  });
});

const healingSV = (overrides: Partial<ScalableValue> = {}): ScalableValue => ({
  type: 'healing',
  benchmark: healingToBenchmark(20, 14),
  originalValue: '20',
  baseLevel: 14,
  ...overrides
});

describe('fast healing / regeneration scaling', () => {
  it('classifies an amount into low/moderate/high tiers via the level table', () => {
    const { low, moderate, high } = getFastHealingRange(14);
    expect(healingToBenchmark(low, 14)).toBe(0);
    expect(healingToBenchmark(moderate, 14)).toBeCloseTo(0.5, 5);
    expect(healingToBenchmark(high, 14)).toBe(1);
  });

  it('scaleHealing snaps a benchmark scalar to the table value for the level', () => {
    const range = getFastHealingRange(20);
    expect(scaleHealing(0, 20)).toBe(range.low);
    expect(scaleHealing(0.5, 20)).toBe(range.moderate);
    expect(scaleHealing(1, 20)).toBe(range.high);
  });

  it('keeps the imported amount exactly at its base level', () => {
    expect(getEffectiveValue(healingSV(), 14)).toBe('20');
    expect(getScaledRecommendation(healingSV(), 14)).toBe('20');
  });

  it('scales the amount proportionally up and down with level', () => {
    const up = Number(getEffectiveValue(healingSV(), 20));
    const down = Number(getEffectiveValue(healingSV(), 5));
    expect(up).toBeGreaterThan(20);
    expect(down).toBeLessThan(20);
    expect(Number.isInteger(up)).toBe(true);
    expect(Number.isInteger(down)).toBe(true);
  });

  it('honours a tier override (scales with level) over the parsed amount', () => {
    const sv = healingSV({ override: BENCHMARK_VALUES_3.high });
    expect(getEffectiveValue(sv, 14)).toBe(String(getFastHealingRange(14).high));
    // override scales: the high tier at level 20 differs from level 14
    expect(getEffectiveValue(sv, 20)).toBe(String(getFastHealingRange(20).high));
  });

  it('honours an absolute customValue verbatim and reflects it in the display benchmark', () => {
    const sv = healingSV({ customValue: '40' });
    expect(getEffectiveValue(sv, 14)).toBe('40');
    // 40 is at/above the high tier for level 14 → benchmark pins to 1
    expect(getDisplayBenchmark(sv, 14)).toBe(1);
  });
});

describe('fast healing / regeneration rule-element helpers', () => {
  it('reads a numeric regeneration rule with its deactivation types', () => {
    const rules = [{ key: 'FastHealing', type: 'regeneration', value: 25, deactivatedBy: ['fire', 'acid'] }];
    expect(readFastHealingRule(rules)).toEqual({ kind: 'regeneration', value: 25, deactivatedBy: ['fire', 'acid'] });
  });

  it('reads fast-healing with no deactivation types', () => {
    expect(readFastHealingRule([{ key: 'FastHealing', value: 5 }])).toEqual({
      kind: 'fast-healing',
      value: 5,
      deactivatedBy: []
    });
  });

  it('returns a null value for self-scaling formula rules (left untouched)', () => {
    const rules = [{ key: 'FastHealing', type: 'regeneration', value: '@item.system.badge.value * 3' }];
    expect(readFastHealingRule(rules)?.value).toBeNull();
  });

  it('returns null when there is no FastHealing rule', () => {
    expect(readFastHealingRule([{ key: 'FlatModifier', value: 2 }])).toBeNull();
    expect(readFastHealingRule(undefined)).toBeNull();
  });

  it('builds a regeneration rule with deactivatedBy and a fast-healing rule without', () => {
    expect(buildFastHealingRule('regeneration', 25, ['fire'])).toEqual({
      key: 'FastHealing',
      type: 'regeneration',
      value: 25,
      deactivatedBy: ['fire']
    });
    expect(buildFastHealingRule('fast-healing', 10)).toEqual({ key: 'FastHealing', type: 'fast-healing', value: 10 });
  });

  it('updates an existing rule value, leaving other rules intact', () => {
    const rules = [{ key: 'GrantItem', uuid: 'x' }, { key: 'FastHealing', type: 'regeneration', value: 25 }];
    const out = setFastHealingRuleValue(rules, 30, 'regeneration', ['fire']);
    expect(out[0]).toEqual({ key: 'GrantItem', uuid: 'x' });
    expect(out[1]).toMatchObject({ key: 'FastHealing', value: 30 });
    expect(rules[1].value).toBe(25); // original not mutated
  });

  it('appends a rule when none exists', () => {
    const out = setFastHealingRuleValue([], 12, 'fast-healing');
    expect(out).toEqual([{ key: 'FastHealing', type: 'fast-healing', value: 12 }]);
  });

  it('swaps the amount in the item name, preserving any localized suffix', () => {
    expect(composeFastHealingName('Regeneration 25 (Deactivated by Fire or Acid)', 30)).toBe(
      'Regeneration 30 (Deactivated by Fire or Acid)'
    );
    expect(composeFastHealingName('Fast Healing 5', 8)).toBe('Fast Healing 8');
    expect(composeFastHealingName('Regeneration', 15)).toBe('Regeneration 15');
  });
});
