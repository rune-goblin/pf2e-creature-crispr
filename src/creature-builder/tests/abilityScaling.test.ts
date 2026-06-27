import { describe, it, expect } from 'vitest';
import {
  parseAbilityDescription,
  renderAbilityDescription,
  renderAbilityDescriptionHtml,
  healingToBenchmark,
  scaleHealing,
  getEffectiveValue,
  getScaledRecommendation,
  getRecommendedTierFormulas,
  getActiveTierFormula,
  scalesWithLevel,
  getLevelGuidance,
  getDisplayBenchmark,
  getFastHealingRange,
  readFastHealingRule,
  buildFastHealingRule,
  setFastHealingRuleValue,
  composeFastHealingName
} from '@/creature-builder/logic/abilityScaling';
import type { ScalableValue } from '@/creature-builder/logic/models';
import { BENCHMARK_VALUES_3, BENCHMARK_VALUES_4 } from '@/creature-builder/logic/models';

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
    '@Damage[(max(1,@actor.level))[healing]]',           // level-derived flat amount, no dice term
    '@Damage[(2d6 + 4 + (2d6[precision]))[slashing]]',   // compound sum
    '@Damage[(2*2d12)[persistent,force]]',               // literal multiplication
    '@Damage[(@item.level)d6[fire]]'                     // non-@actor variable can't be resolved
  ])('does not scale and renders unchanged: %s', (macro) => {
    const p = parse(macro);
    expect(p.scalableValues.filter(v => v.type !== 'dc')).toHaveLength(0);
    // round-trips verbatim at any level (no placeholder was inserted)
    expect(renderAbilityDescription(p.template, p.scalableValues, 5)).toContain(macro);
  });
});

describe('@Damage with a level-derived dice count is extracted as a scalable value', () => {
  // Strigoi Progenitor's Domain of Dusk: floor(1 + 13/2) = 7 → 7d6 at its native level 13.
  it('evaluates the count at base level and templates the whole expression', () => {
    const p = parse('@Damage[floor(1 + @actor.level/2)d6[void]|options:area-damage]', 13);
    const d = p.scalableValues.filter(v => v.type === 'damage');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ type: 'damage', originalValue: '7d6', damageType: 'void', baseLevel: 13 });
    expect(p.template).toContain('@Damage[{0}[void]|options:area-damage]');
    // At its base level it renders the concrete dice, not the raw macro (which would read 1d6 in-editor).
    expect(renderAbilityDescription(p.template, p.scalableValues, 13))
      .toContain('@Damage[7d6[void]|options:area-damage]');
  });

  it('adjusts the number of dice when the creature is rescaled up', () => {
    const p = parse('@Damage[floor(1 + @actor.level/2)d6[void]|options:area-damage]', 13);
    const scaled = renderAbilityDescription(p.template, p.scalableValues, 20);
    const m = scaled.match(/@Damage\[(\d+)d6(?:[+-]\d+)?\[void\]\|options:area-damage\]/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(7);
  });

  // A clean NdM (area damage) recommendation stays clean — no insignificant ±1 residual bonus.
  it('recommends a clean NdM at every level (no flat ±1 tail)', () => {
    const dmg = parse('@Damage[floor(1 + @actor.level/2)d6[void]]', 13).scalableValues.find(v => v.type === 'damage')!;
    for (const L of [14, 15, 17, 18, 20, 22]) {
      expect(getScaledRecommendation(dmg, L)).toMatch(/^\d+d6$/);
    }
  });

  it('exposes a clean NdM recommendation for each benchmark tier', () => {
    const dmg = parse('@Damage[floor(1 + @actor.level/2)d6[void]]', 13).scalableValues.find(v => v.type === 'damage')!;
    const tiers = getRecommendedTierFormulas(dmg, 16);
    expect(tiers.map(t => t.label)).toEqual(['low', 'moderate', 'high', 'extreme']);
    for (const t of tiers) expect(t.formula).toMatch(/^\d+d6$/);             // clean, in the value's own die
    const counts = tiers.map(t => parseInt(t.formula, 10));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));               // low ≤ mod ≤ high ≤ ext
  });

  it('persistent damage gets 3 tiers; DC/non-roll values get none', () => {
    const persistent = parse('@Damage[2d6[persistent,fire]]', 13).scalableValues.find(v => v.type === 'persistent')!;
    expect(getRecommendedTierFormulas(persistent, 16).map(t => t.label)).toEqual(['low', 'moderate', 'high']);
    const dc = parse('@Check[fortitude|dc:25]', 13).scalableValues.find(v => v.type === 'dc')!;
    expect(getRecommendedTierFormulas(dc, 16)).toEqual([]);
  });

  it('selecting a benchmark drives the active recommendation AND the value to the same clean NdM', () => {
    const dmg = parse('@Damage[floor(1 + @actor.level/2)d6[void]]', 13).scalableValues.find(v => v.type === 'damage')!;
    const high = { ...dmg, override: BENCHMARK_VALUES_4.high };
    const active = getActiveTierFormula(high, 16);
    expect(active?.label).toBe('high');
    expect(active?.formula).toMatch(/^\d+d6$/);                       // clean, in the value's own die
    expect(getEffectiveValue(high, 16)).toBe(active!.formula);        // value mirrors the recommendation
    // a manual dice edit (customValue) diverges the value while the recommendation stays pinned to the tier
    const edited = { ...high, customValue: '8d6' };
    expect(getEffectiveValue(edited, 16)).toBe('8d6');
    expect(getActiveTierFormula(edited, 16)?.label).toBe('high');
  });

  it.each([
    ['@Damage[(@actor.level)d6[fire]]', 12, '12d6', '@Damage[{0}[fire]]'],
    ['@Damage[(ceil(@actor.level/2))d8[cold]]', 9, '5d8', '@Damage[{0}[cold]]'],   // dice outside the wrap parens
    ['@Damage[(floor(@actor.level/2)d6)[acid]]', 10, '5d6', '@Damage[({0})[acid]]'] // dice inside the wrap parens
  ])('handles %s', (macro, level, formula, template) => {
    const p = parse(macro, level);
    const d = p.scalableValues.filter(v => v.type === 'damage');
    expect(d[0]?.originalValue).toBe(formula);
    expect(p.template).toContain(template);
  });
});

describe('@Damage[N[healing]] is healing, not damage', () => {
  it('files a self-heal as a healing value with no damage type', () => {
    const sv = parse('the strigoi regains @Damage[18[healing]] HP', 13).scalableValues;
    expect(sv).toHaveLength(1);
    expect(sv[0]).toMatchObject({ type: 'healing', originalValue: '18' });
    expect(sv[0].damageType).toBeUndefined();
  });

  it('scales the heal amount with level (fast-healing curve), exact at base level', () => {
    const p = parse('regains @Damage[18[healing]] HP', 13);
    expect(renderAbilityDescription(p.template, p.scalableValues, 13)).toContain('@Damage[18[healing]]');
    const up = renderAbilityDescription(p.template, p.scalableValues, 20);
    const m = up.match(/@Damage\[(\d+)\[healing\]\]/);
    expect(Number(m![1])).toBeGreaterThan(18);
  });
});

describe('valued condition links are exposed and scaled', () => {
  const COND = '@UUID[Compendium.pf2e.conditionitems.Item.Drained]{Drained 2}';

  it('extracts the condition value, slug and label; templates only the number', () => {
    const p = parse(`The creature becomes ${COND}.`, 13);
    const c = p.scalableValues.find(v => v.type === 'condition')!;
    expect(c).toMatchObject({ type: 'condition', originalValue: '2', conditionSlug: 'Drained', conditionLabel: 'Drained' });
    expect(p.template).toContain('{Drained {0}}');
    expect(renderAbilityDescription(p.template, p.scalableValues, 13)).toContain('{Drained 2}');
  });

  it('is flat — surfaced for editing, never auto-scaled', () => {
    const c = parse(`becomes ${COND}.`, 13).scalableValues.find(v => v.type === 'condition')!;
    expect(scalesWithLevel(c)).toBe(false);
    for (const L of [1, 7, 13, 19, 25]) expect(getScaledRecommendation(c, L)).toBe('2');
  });

  it('offers level-appropriate guidance (advisory, coarse steps) without changing the flat value', () => {
    const c = parse(`becomes ${COND}.`, 13).scalableValues.find(v => v.type === 'condition')!;
    expect(getLevelGuidance(c, 13)).toBe('2');
    expect(getLevelGuidance(c, 7)).toBe('1');
    expect(getLevelGuidance(c, 19)).toBe('3');
    expect(getLevelGuidance(c, 1)).toBe('1');     // clamped ≥1
    // a skill DC's guidance reports the Level-Based DCs table value, but the value itself stays flat
    const dc = parse('a @Check[medicine|dc:20] check', 13).scalableValues.find(v => v.type === 'dc')!;
    expect(getScaledRecommendation(dc, 20)).toBe('20');
    expect(getLevelGuidance(dc, 20)).toBe('40');
    expect(getLevelGuidance(dc, 13)).toBe('31');
  });

  it('ignores conditions with no value and unknown condition slugs', () => {
    expect(parse('within reach @UUID[Compendium.pf2e.conditionitems.Item.Grabbed].', 13)
      .scalableValues.filter(v => v.type === 'condition')).toHaveLength(0);
    expect(parse('@UUID[Compendium.pf2e.conditionitems.Item.Invisible]{Invisible 2}', 13)
      .scalableValues.filter(v => v.type === 'condition')).toHaveLength(0);
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

describe('skill-check DCs are surfaced but not scaled; save DCs scale', () => {
  it('a mundane medicine DC is captured but flat', () => {
    const dc = parse('a @Check[medicine|dc:20] check', 13).scalableValues.find(v => v.type === 'dc')!;
    expect(dc).toMatchObject({ type: 'dc', originalValue: '20', checkType: 'medicine' });
    expect(scalesWithLevel(dc)).toBe(false);
    expect(getScaledRecommendation(dc, 20)).toBe('20');   // unchanged at any level
  });

  it('a save DC still scales with level', () => {
    const dc = parse('@Check[fortitude|dc:30|basic]', 13).scalableValues.find(v => v.type === 'dc')!;
    expect(scalesWithLevel(dc)).toBe(true);
    expect(getScaledRecommendation(dc, 20)).not.toBe('30');
  });

  it('a plain "DC N" with no check type scales (it is the creature DC)', () => {
    const dc = parse('DC 25 Reflex', 13).scalableValues.find(v => v.type === 'dc')!;
    expect(scalesWithLevel(dc)).toBe(true);
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
