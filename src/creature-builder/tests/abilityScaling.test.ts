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
  composeFastHealingName,
  getAbilityBenchmarkLabel,
  getPersistentBenchmarkLabel,
  parseDiceFormulaAverage,
  parseDiceComponents,
  formatDiceFormula,
  damageToBenchmark,
  dcToBenchmark,
  spellAttackToBenchmark,
  persistentDamageToBenchmark,
  scaleDamage,
  scaleDC,
  scaleSpellAttack,
  scalePersistentDamage,
  scaleProportionally,
  getEffectiveBenchmark,
  getTierInfo,
  hasOverride,
  stepBenchmarkTier,
  isAtMaxTier,
  isAtMinTier,
  evalLevelExpression,
  processAbilityForScaling,
  processAbilitiesForScaling,
  getAbilityDescription,
  getSpellAttackRange,
  getPersistentDamageRange
} from '@/creature-builder/logic/abilityScaling';
import { getStatRangesForLevel } from '@/creature-builder/logic/creatureStatTables';
import type { ScalableValue, SpecialAbility } from '@/creature-builder/logic/models';
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

// Level-10 damage/DC/persistent SVs, as parseAbilityDescription would produce them.
const dmgSV = (o: Partial<ScalableValue> = {}): ScalableValue =>
  ({ type: 'damage', benchmark: 1 / 3, originalValue: '2d10+11', baseLevel: 10, ...o });
const dcSV = (o: Partial<ScalableValue> = {}): ScalableValue =>
  ({ type: 'dc', benchmark: 0.5, originalValue: '29', baseLevel: 10, ...o });
const persSV = (o: Partial<ScalableValue> = {}): ScalableValue =>
  ({ type: 'persistent', benchmark: 0.5, originalValue: '2d6', baseLevel: 10, ...o });

describe('dice formula primitives', () => {
  it('parseDiceFormulaAverage computes NdM+B averages and tolerates whitespace', () => {
    expect(parseDiceFormulaAverage('2d6+9')).toBe(16);
    expect(parseDiceFormulaAverage('1d10 - 2')).toBe(3.5);
    expect(parseDiceFormulaAverage('3d8')).toBe(13.5);
  });

  it('parseDiceFormulaAverage returns 0 for anything that is not a simple NdM[+B]', () => {
    expect(parseDiceFormulaAverage('1d6+1d4')).toBe(0);
    expect(parseDiceFormulaAverage('garbage')).toBe(0);
    expect(parseDiceFormulaAverage('7')).toBe(0);
  });

  it('parseDiceComponents splits a simple formula and rejects compound ones', () => {
    expect(parseDiceComponents('2d6 + 4')).toEqual({ count: 2, die: 6, bonus: 4 });
    expect(parseDiceComponents('3d8-1')).toEqual({ count: 3, die: 8, bonus: -1 });
    expect(parseDiceComponents('1d10')).toEqual({ count: 1, die: 10, bonus: 0 });
    expect(parseDiceComponents('1d6+1d4')).toBeNull();
    expect(parseDiceComponents('7')).toBeNull();
  });

  it('formatDiceFormula renders negative bonuses, omits +0, and clamps count/die', () => {
    expect(formatDiceFormula(1, 10, -3)).toBe('1d10-3');
    expect(formatDiceFormula(2, 6, 0)).toBe('2d6');
    expect(formatDiceFormula(3, 8, 4)).toBe('3d8+4');
    expect(formatDiceFormula(0, 1, 0)).toBe('1d2');
  });
});

describe('benchmark labels', () => {
  it.each([
    [0, 'moderate'], [0.24, 'moderate'], [0.25, 'high'], [0.5, 'high'],
    [0.74, 'high'], [0.75, 'extreme'], [1, 'extreme']
  ] as const)('getAbilityBenchmarkLabel(%d) → %s', (scalar, label) => {
    expect(getAbilityBenchmarkLabel(scalar)).toBe(label);
  });

  it.each([
    [0, 'low'], [0.32, 'low'], [0.33, 'moderate'], [0.5, 'moderate'],
    [0.66, 'moderate'], [0.67, 'high'], [1, 'high']
  ] as const)('getPersistentBenchmarkLabel(%d) → %s', (scalar, label) => {
    expect(getPersistentBenchmarkLabel(scalar)).toBe(label);
  });
});

describe('spell attack benchmarks (level-10 row: 18/21/25)', () => {
  it('maps the table values to the 0/0.5/1 scalars and clamps outside them', () => {
    expect(spellAttackToBenchmark(18, 10)).toBe(0);
    expect(spellAttackToBenchmark(21, 10)).toBe(0.5);
    expect(spellAttackToBenchmark(25, 10)).toBe(1);
    expect(spellAttackToBenchmark(10, 10)).toBe(0);
    expect(spellAttackToBenchmark(30, 10)).toBe(1);
  });

  it('interpolates between benchmarks in both halves', () => {
    expect(spellAttackToBenchmark(19, 10)).toBeCloseTo(1 / 6, 5);
    expect(spellAttackToBenchmark(23, 10)).toBeCloseTo(0.75, 5);
  });

  it('scaleSpellAttack inverts the mapping, rounding interpolated values', () => {
    expect(scaleSpellAttack(0, 10)).toBe(18);
    expect(scaleSpellAttack(0.5, 10)).toBe(21);
    expect(scaleSpellAttack(1, 10)).toBe(25);
    expect(scaleSpellAttack(0.75, 10)).toBe(23);
  });

  it('a high spell attack stays high across a level change', () => {
    const b = spellAttackToBenchmark(21, 10);
    expect(scaleSpellAttack(b, 20)).toBe(getSpellAttackRange(20).high);
  });

  it('getSpellAttackRange clamps levels to the table bounds', () => {
    expect(getSpellAttackRange(-5)).toEqual({ moderate: 5, high: 8, extreme: 11 });
    expect(getSpellAttackRange(99)).toEqual({ moderate: 37, high: 40, extreme: 44 });
  });
});

describe('DC benchmarks (level-10 row: 26/29/33)', () => {
  it('dcToBenchmark maps table values exactly and clamps outside them', () => {
    expect(dcToBenchmark(26, 10)).toBe(0);
    expect(dcToBenchmark(29, 10)).toBe(0.5);
    expect(dcToBenchmark(33, 10)).toBe(1);
    expect(dcToBenchmark(20, 10)).toBe(0);
    expect(dcToBenchmark(40, 10)).toBe(1);
    expect(dcToBenchmark(31, 10)).toBeCloseTo(0.75, 5);
  });

  it('scaleDC interpolates in the upper (high→extreme) half', () => {
    expect(scaleDC(1, 10)).toBe(33);
    expect(scaleDC(0.75, 10)).toBe(31);
  });

  it('a moderate DC re-anchors to the moderate value of the new level', () => {
    expect(scaleDC(dcToBenchmark(26, 10), 20)).toBe(39);
    expect(scaleDC(0, 30)).toBe(45);
    expect(scaleDC(0, -10)).toBe(13);
  });
});

describe('scaleDamage (level-10 row: 2d6+10 / 2d10+11 / 2d12+13 / 2d12+20)', () => {
  it('returns the exact table formula at each of the four tier scalars', () => {
    expect(scaleDamage(0, 10)).toBe('2d6+10');
    expect(scaleDamage(1 / 3, 10)).toBe('2d10+11');
    expect(scaleDamage(2 / 3, 10)).toBe('2d12+13');
    expect(scaleDamage(1, 10)).toBe('2d12+20');
  });

  it('adjusts the nearest tier formula to hit an interpolated average', () => {
    expect(scaleDamage(0.5, 10)).toBe('2d12+11');
    expect(parseDiceFormulaAverage('2d12+11')).toBe(24);
  });

  it('clamps benchmark and level to the table bounds', () => {
    expect(scaleDamage(1, 30)).toBe('4d12+42');
    expect(scaleDamage(0, -5)).toBe('1d4');
  });

  it('a benchmark from damageToBenchmark lands on the same tier at another level', () => {
    const b = damageToBenchmark(26, 10);
    expect(b).toBeCloseTo(2 / 3, 5);
    expect(scaleDamage(b, 4)).toBe('2d8+5');
  });

  it('damageToBenchmark interpolates between tiers and clamps outside them', () => {
    expect(damageToBenchmark(24, 10)).toBeCloseTo(0.5, 5);
    expect(damageToBenchmark(1, 10)).toBe(0);
    expect(damageToBenchmark(50, 10)).toBe(1);
  });
});

describe('scalePersistentDamage (level-10 row: 2d4 / 2d6 / 3d6)', () => {
  it('snaps the scalar to the tier formula with 0.33/0.67 boundaries', () => {
    expect(scalePersistentDamage(0, 10)).toBe('2d4');
    expect(scalePersistentDamage(0.32, 10)).toBe('2d4');
    expect(scalePersistentDamage(0.33, 10)).toBe('2d6');
    expect(scalePersistentDamage(0.66, 10)).toBe('2d6');
    expect(scalePersistentDamage(0.67, 10)).toBe('3d6');
    expect(scalePersistentDamage(1, 10)).toBe('3d6');
  });

  it('clamps the level to the table bounds', () => {
    expect(scalePersistentDamage(1, 30)).toBe('6d6');
    expect(scalePersistentDamage(0, -5)).toBe('1d4');
  });

  it('persistentDamageToBenchmark maps tier averages to 0/0.5/1 and interpolates', () => {
    expect(persistentDamageToBenchmark(5, 10)).toBe(0);
    expect(persistentDamageToBenchmark(7, 10)).toBe(0.5);
    expect(persistentDamageToBenchmark(10.5, 10)).toBe(1);
    expect(persistentDamageToBenchmark(6, 10)).toBeCloseTo(0.25, 5);
    expect(persistentDamageToBenchmark(20, 10)).toBe(1);
  });

  it('getPersistentDamageRange clamps levels to the table bounds', () => {
    expect(getPersistentDamageRange(-9)).toEqual({ low: '1d4', moderate: '1d4', high: '1d6' });
    expect(getPersistentDamageRange(40)).toEqual({ low: '4d8', moderate: '5d6', high: '6d6' });
  });
});

describe('scaleProportionally', () => {
  it('rebuilds a bonus-carrying formula in its own die to match the level-scaled average', () => {
    const sv = dmgSV({ originalValue: '2d6+4', benchmark: 0, baseLevel: 5 });
    expect(scaleProportionally(sv, 10)).toBe('5d6+1');
  });

  it('keeps the scaled average within 0.5 of the exact moderate-spine target at every level', () => {
    const sv = dmgSV({ originalValue: '2d6+4', benchmark: 0, baseLevel: 5 });
    const baseMod = getStatRangesForLevel(5).strikeDamage.moderate.average;
    for (const L of [1, 5, 8, 12, 16, 20, 24]) {
      const result = scaleProportionally(sv, L);
      expect(result).toMatch(/^\d+d6([+-]\d+)?$/);
      const target = 11 * (getStatRangesForLevel(L).strikeDamage.moderate.average / baseMod);
      expect(Math.abs(parseDiceFormulaAverage(result) - target)).toBeLessThanOrEqual(0.5);
    }
  });

  it('emits a negative bonus when a big formula scales to a tiny level', () => {
    const sv = dmgSV({ originalValue: '2d10+3' });
    expect(scaleProportionally(sv, -1)).toBe('1d10-4');
    expect(Math.abs(parseDiceFormulaAverage('1d10-4') - 14 * (3 / 22))).toBeLessThanOrEqual(0.5);
  });

  it('at the base level a clean NdM and a flat value pass through unchanged', () => {
    expect(scaleProportionally(persSV(), 10)).toBe('2d6');
    expect(scaleProportionally(persSV({ originalValue: '5', baseLevel: 15 }), 15)).toBe('5');
  });

  it('scales flat persistent damage as an integer on the persistent moderate spine', () => {
    expect(scaleProportionally(persSV({ originalValue: '5', baseLevel: 15 }), 5)).toBe('2');
  });

  it('never scales a flat value below 1', () => {
    expect(scaleProportionally(dmgSV({ originalValue: '2', baseLevel: 24 }), -1)).toBe('1');
  });

  it('falls back to tier-snap when the formula is compound', () => {
    expect(scaleProportionally(dmgSV({ originalValue: '1d6+1d4' }), 15)).toBe('3d10+14');
    expect(scaleProportionally(persSV({ originalValue: '1d6+1d4', benchmark: 1 }), 10)).toBe('3d6');
  });

  it('falls back to tier-snap healing when baseLevel is missing', () => {
    const sv: ScalableValue = { type: 'healing', benchmark: 0.5, originalValue: '12' };
    expect(scaleProportionally(sv, 10)).toBe('11');
  });
});

describe('getEffectiveBenchmark', () => {
  it('returns the benchmark when no override is set', () => {
    expect(getEffectiveBenchmark(dmgSV())).toBeCloseTo(1 / 3, 5);
  });

  it('an override of 0 still wins over the benchmark', () => {
    expect(getEffectiveBenchmark(dmgSV({ benchmark: 1, override: 0 }))).toBe(0);
  });
});

describe('getTierInfo', () => {
  it('classifies by benchmark scalar when there is no customValue', () => {
    expect(getTierInfo(dmgSV({ benchmark: 0 }), 10)).toEqual({ label: 'low', exact: true });
    expect(getTierInfo(dmgSV(), 10)).toEqual({ label: 'moderate', exact: true });
    expect(getTierInfo(dmgSV({ benchmark: 0.55 }), 10)).toEqual({ label: 'high', exact: false });
    expect(getTierInfo(dmgSV({ benchmark: 0, override: 2 / 3 }), 10)).toEqual({ label: 'high', exact: true });
    expect(getTierInfo(dmgSV({ benchmark: 1 }), 10)).toEqual({ label: 'extreme', exact: true });
    expect(getTierInfo(dcSV(), 10)).toEqual({ label: 'high', exact: true });
    expect(getTierInfo(dcSV({ benchmark: 1 }), 10)).toEqual({ label: 'extreme', exact: true });
    expect(getTierInfo(persSV({ benchmark: 1 }), 10)).toEqual({ label: 'high', exact: true });
  });

  it('classifies a damage customValue by its average against the level tiers', () => {
    expect(getTierInfo(dmgSV({ customValue: '2d10+11' }), 10)).toEqual({ label: 'moderate', exact: true });
    expect(getTierInfo(dmgSV({ customValue: '2d10+14' }), 10)).toEqual({ label: 'high', exact: false });
    expect(getTierInfo(dmgSV({ customValue: '1d4' }), 10)).toEqual({ label: 'low', exact: false });
    expect(getTierInfo(dmgSV({ customValue: '12d12+20' }), 10)).toEqual({ label: 'extreme', exact: false });
  });

  it('classifies a persistent customValue, with exactness under half a point', () => {
    expect(getTierInfo(persSV({ customValue: '3d6' }), 10)).toEqual({ label: 'high', exact: true });
    expect(getTierInfo(persSV({ customValue: '2d4' }), 10)).toEqual({ label: 'low', exact: true });
    expect(getTierInfo(persSV({ customValue: '1d8+1' }), 10)).toEqual({ label: 'low', exact: false });
  });

  it('classifies healing and DC customValues against their level rows', () => {
    const heal = healingSV({ baseLevel: 10 });
    expect(getTierInfo({ ...heal, customValue: '11' }, 10)).toEqual({ label: 'moderate', exact: true });
    expect(getTierInfo({ ...heal, customValue: '10' }, 10)).toEqual({ label: 'moderate', exact: false });
    expect(getTierInfo({ ...heal, customValue: '100' }, 10)).toEqual({ label: 'high', exact: false });
    expect(getTierInfo(dcSV({ customValue: '26' }), 10)).toEqual({ label: 'moderate', exact: true });
    expect(getTierInfo(dcSV({ customValue: '32' }), 10)).toEqual({ label: 'extreme', exact: false });
    expect(getTierInfo(dcSV({ customValue: '20' }), 10)).toEqual({ label: 'moderate', exact: false });
  });

  it('returns null for conditions and unparseable customValues', () => {
    const cond: ScalableValue = { type: 'condition', benchmark: 0, originalValue: '2', baseLevel: 10 };
    expect(getTierInfo(cond, 10)).toBeNull();
    expect(getTierInfo(dmgSV({ customValue: '1d6+1d4' }), 10)).toBeNull();
    expect(getTierInfo(dcSV({ customValue: 'DC' }), 10)).toBeNull();
    expect(getTierInfo({ ...healingSV(), customValue: 'abc' }, 14)).toBeNull();
  });
});

describe('hasOverride', () => {
  it('is false with no override, an empty customValue, or an override equal to the benchmark', () => {
    expect(hasOverride(dmgSV())).toBe(false);
    expect(hasOverride(dmgSV({ customValue: '' }))).toBe(false);
    expect(hasOverride(dmgSV({ override: 1 / 3 }))).toBe(false);
  });

  it('is true for a customValue or a tier override distinct from the parse-time benchmark', () => {
    expect(hasOverride(dmgSV({ customValue: '3d6' }))).toBe(true);
    expect(hasOverride(dmgSV({ override: 1 }))).toBe(true);
  });
});

describe('getDisplayBenchmark reverse-maps customValues; override wins outright', () => {
  it('override takes precedence over customValue', () => {
    expect(getDisplayBenchmark(dmgSV({ override: 1, customValue: '2d6' }), 10)).toBe(1);
  });

  it('falls back to the parsed benchmark when nothing is overridden', () => {
    expect(getDisplayBenchmark(dmgSV(), 10)).toBeCloseTo(1 / 3, 5);
  });

  it('maps a DC customValue through dcToBenchmark, falling back when unparseable', () => {
    expect(getDisplayBenchmark(dcSV({ benchmark: 0, customValue: '29' }), 10)).toBe(0.5);
    expect(getDisplayBenchmark(dcSV({ benchmark: 0, customValue: 'nope' }), 10)).toBe(0);
  });

  it('maps damage/persistent customValues through their benchmark curves', () => {
    expect(getDisplayBenchmark(dmgSV({ customValue: '2d12+20' }), 10)).toBe(1);
    expect(getDisplayBenchmark(persSV({ benchmark: 0, customValue: '3d6' }), 10)).toBe(1);
    expect(getDisplayBenchmark(dmgSV({ customValue: 'xyz' }), 10)).toBeCloseTo(1 / 3, 5);
  });
});

describe('stepBenchmarkTier / isAtMaxTier / isAtMinTier', () => {
  it('steps damage through the 4-tier ladder', () => {
    expect(stepBenchmarkTier(dmgSV(), 1)).toBeCloseTo(2 / 3, 5);
    expect(stepBenchmarkTier(dmgSV(), -1)).toBe(0);
  });

  it('an interpolated value steps to the adjacent tier, not past it', () => {
    expect(stepBenchmarkTier(dmgSV({ benchmark: 0.55 }), 1)).toBeCloseTo(2 / 3, 5);
    expect(stepBenchmarkTier(dmgSV({ benchmark: 0.55 }), -1)).toBeCloseTo(1 / 3, 5);
  });

  it('clamps at the extremes, consistently with isAtMaxTier/isAtMinTier', () => {
    const max = dmgSV({ benchmark: 1 });
    expect(stepBenchmarkTier(max, 1)).toBe(1);
    expect(isAtMaxTier(max)).toBe(true);
    expect(isAtMinTier(max)).toBe(false);

    const min = dmgSV({ benchmark: 0 });
    expect(stepBenchmarkTier(min, -1)).toBe(0);
    expect(isAtMinTier(min)).toBe(true);
    expect(isAtMaxTier(min)).toBe(false);

    expect(isAtMaxTier(dmgSV())).toBe(false);
    expect(isAtMinTier(dmgSV())).toBe(false);
  });

  it('uses the effective benchmark, so an override drives the stepping', () => {
    const overridden = dmgSV({ benchmark: 0, override: 1 });
    expect(isAtMaxTier(overridden)).toBe(true);
    expect(stepBenchmarkTier(overridden, 1)).toBe(1);
    expect(stepBenchmarkTier(overridden, -1)).toBeCloseTo(2 / 3, 5);
  });

  it('DC, persistent and healing use the 3-tier ladder', () => {
    expect(stepBenchmarkTier(dcSV(), 1)).toBe(1);
    expect(stepBenchmarkTier(dcSV(), -1)).toBe(0);
    expect(stepBenchmarkTier(persSV({ benchmark: 0 }), 1)).toBe(0.5);
    expect(stepBenchmarkTier(healingSV({ benchmark: 1 }), -1)).toBe(0.5);
    expect(isAtMaxTier(dcSV({ benchmark: 1 }))).toBe(true);
    expect(isAtMinTier(healingSV({ benchmark: 0 }))).toBe(true);
  });
});

describe('getActiveTierFormula for non-roll types', () => {
  it('returns null for DC and healing values', () => {
    expect(getActiveTierFormula(dcSV(), 16)).toBeNull();
    expect(getActiveTierFormula(healingSV(), 16)).toBeNull();
  });
});

describe('getEffectiveValue with a DC tier override', () => {
  it('resolves the override through the DC table at the current level', () => {
    expect(getEffectiveValue(dcSV({ benchmark: 0, override: 1 }), 10)).toBe('33');
    expect(getEffectiveValue(dcSV({ benchmark: 0, override: 1 }), 20)).toBe('47');
  });

  it('a condition ignores tier overrides and keeps its flat value', () => {
    const cond: ScalableValue = { type: 'condition', benchmark: 0, originalValue: '2', baseLevel: 10, override: 1 };
    expect(getEffectiveValue(cond, 20)).toBe('2');
  });
});

describe('getLevelGuidance edge behaviour', () => {
  it('a condition without a baseLevel keeps its original value at any level', () => {
    const cond: ScalableValue = { type: 'condition', benchmark: 0, originalValue: '3' };
    expect(getLevelGuidance(cond, 1)).toBe('3');
    expect(getLevelGuidance(cond, 24)).toBe('3');
  });

  it('skill-DC guidance follows the Level-Based DCs table at its extremes', () => {
    const skill = dcSV({ checkType: 'medicine', originalValue: '20' });
    expect(getLevelGuidance(skill, 0)).toBe('14');
    expect(getLevelGuidance(skill, -1)).toBe('14');
    expect(getLevelGuidance(skill, 24)).toBe('48');
    expect(getLevelGuidance(skill, 26)).toBe('52');
  });

  it('for damage the guidance is exactly the scaled recommendation', () => {
    expect(getLevelGuidance(dmgSV(), 15)).toBe(getScaledRecommendation(dmgSV(), 15));
  });
});

describe('evalLevelExpression', () => {
  it.each([
    ['@actor.level', 13, 13],
    ['2 + 3 * 4', 0, 14],
    ['(2 + 3) * 4', 0, 20],
    ['-2 + @actor.level', 5, 3],
    ['+3', 0, 3],
    ['max(1, @actor.level - 2)', 1, 1],
    ['max(1, @actor.level - 2)', 9, 7],
    ['min(@actor.level, 10)', 15, 10],
    ['round(@actor.level / 2)', 5, 3],
    ['abs(0 - @actor.level)', 4, 4],
    ['ternary(gte(@actor.level, 10), 4, 2)', 12, 4],
    ['ternary(gte(@actor.level, 10), 4, 2)', 9, 2],
    ['ternary(lt(@actor.level, 5), 1, 0)', 3, 1],
    ['eq(@actor.level, 5)', 5, 1],
    ['ne(@actor.level, 5)', 5, 0],
    ['lte(3, 3)', 0, 1],
    ['gt(3, 3)', 0, 0]
  ])('%s at level %d → %d', (expr, level, expected) => {
    expect(evalLevelExpression(expr, level)).toBe(expected);
  });

  it.each([
    '@item.level',
    'foo(3)',
    'floor(1, 2)',
    'ternary(1, 2)',
    'max()',
    '2 +',
    '(2',
    '2 3',
    '',
    '1/0',
    '2 % 3',
    '1..5'
  ])('returns null for unresolvable/malformed input: %s', (expr) => {
    expect(evalLevelExpression(expr, 10)).toBeNull();
  });
});

describe('level-derived dice counts using the full expression grammar', () => {
  it('a ternary count evaluates differently per parse level', () => {
    const at12 = damages('@Damage[ternary(gte(@actor.level,10),4,2)d8[fire]]', 12);
    expect(at12[0]).toMatchObject({ type: 'damage', originalValue: '4d8', damageType: 'fire' });
    const at5 = damages('@Damage[ternary(gte(@actor.level,10),4,2)d8[fire]]', 5);
    expect(at5[0]).toMatchObject({ type: 'damage', originalValue: '2d8' });
  });

  it('a level-derived count followed by extra arithmetic is left verbatim', () => {
    const macro = '@Damage[(@actor.level)d6 + 3[fire]]';
    const p = parse(macro, 10);
    expect(p.scalableValues.filter(v => v.type !== 'dc')).toHaveLength(0);
    expect(renderAbilityDescription(p.template, p.scalableValues, 5)).toContain(macro);
  });

  it('dice nested inside a function call are left verbatim', () => {
    const macro = '@Damage[max(1,(@actor.level)d6)[fire]]';
    const p = parse(macro, 10);
    expect(p.scalableValues.filter(v => v.type !== 'dc')).toHaveLength(0);
    expect(renderAbilityDescription(p.template, p.scalableValues, 5)).toContain(macro);
  });
});

describe('plain-text persistent damage', () => {
  it('extracts and rescales "NdM persistent <type> damage"', () => {
    const p = parse('plus 2d6 persistent fire damage', 13);
    expect(p.scalableValues[0]).toMatchObject({ type: 'persistent', originalValue: '2d6', damageType: 'fire' });
    expect(p.template).toContain('{0} persistent fire damage');
    expect(renderAbilityDescription(p.template, p.scalableValues, 5)).toContain('1d6 persistent fire damage');
  });

  it('ignores persistent damage with an unknown damage type', () => {
    expect(parse('deals 3d6 persistent radiation damage', 10).scalableValues).toHaveLength(0);
  });
});

describe('renderAbilityDescriptionHtml with a placeholder beyond the value list', () => {
  it('leaves the stray placeholder verbatim and renders the real one', () => {
    const html = renderAbilityDescriptionHtml('deals {0} plus {7}', [dmgSV()], 10);
    expect(html).toContain('>2d10+11</span>');
    expect(html).toContain('{7}');
  });
});

describe('processAbilityForScaling / getAbilityDescription end-to-end', () => {
  const breath: SpecialAbility = {
    id: 'a1',
    name: 'Breath Weapon',
    description: '<p>deals 2d10+11 fire damage (DC 29 Fortitude save)</p>',
    actionType: 'action',
    actions: 2
  };
  const flavor: SpecialAbility = {
    id: 'a2',
    name: 'Shimmering Aura',
    description: '<p>A shimmering aura surrounds the creature.</p>',
    actionType: 'passive'
  };

  it('templates the damage and DC into placeholders without mutating the input', () => {
    const processed = processAbilityForScaling(breath, 10);
    expect(processed).not.toBe(breath);
    expect(processed.descriptionTemplate).toContain('deals {0} fire damage');
    expect(processed.descriptionTemplate).toContain('DC {1} Fortitude');
    expect(processed.scalableValues?.map(v => v.type)).toEqual(['damage', 'dc']);
    expect(breath.descriptionTemplate).toBeUndefined();
  });

  it('returns the ability unchanged when nothing in it scales', () => {
    expect(processAbilityForScaling(flavor, 10)).toBe(flavor);
  });

  it('round-trips the original text at the base level', () => {
    const processed = processAbilityForScaling(breath, 10);
    expect(getAbilityDescription(processed, 10)).toBe(breath.description);
  });

  it('rescales both values at a new level', () => {
    const rendered = getAbilityDescription(processAbilityForScaling(breath, 10), 20);
    expect(rendered).toContain('DC 42 Fortitude');
    const m = rendered.match(/deals (\d+d10(?:[+-]\d+)?) fire damage/);
    expect(m).not.toBeNull();
    expect(parseDiceFormulaAverage(m![1])).toBeCloseTo(37, 0);
  });

  it('an unprocessed ability renders its raw description', () => {
    expect(getAbilityDescription(flavor, 20)).toBe(flavor.description);
  });

  it('customDescriptionTemplate takes precedence and still substitutes placeholders', () => {
    const processed = processAbilityForScaling(breath, 10);
    const custom = { ...processed, customDescriptionTemplate: '<p>now {0} damage, DC {1}</p>' };
    expect(getAbilityDescription(custom, 10)).toBe('<p>now 2d10+11 damage, DC 29</p>');
  });

  it('a freeform customDescriptionTemplate wins when there are no scalable values', () => {
    const custom = { ...flavor, customDescriptionTemplate: '<p>Rewritten.</p>' };
    expect(getAbilityDescription(custom, 10)).toBe('<p>Rewritten.</p>');
  });

  it('processAbilitiesForScaling maps every ability', () => {
    const [first, second] = processAbilitiesForScaling([breath, flavor], 10);
    expect(first.scalableValues).toHaveLength(2);
    expect(second).toBe(flavor);
  });
});
