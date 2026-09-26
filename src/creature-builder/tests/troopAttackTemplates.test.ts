import { describe, it, expect } from 'vitest';
import {
  buildTroopAttackFromTemplate,
  buildTroopSweep,
  buildTroopVolley,
  getTroopSweepDamage,
  troopAttackKindOf
} from '@/creature-builder/logic/troopActions';
import { customAbilityToSpecialAbility, snapTroopDamageToBenchmark } from '@/creature-builder/logic/customAbility';
import {
  backfillTroopLines,
  damageToBenchmark,
  getEffectiveValue,
  getTierInfo,
  parseAbilityDescription,
  parseDiceFormulaAverage,
  renderAbilityDescription
} from '@/creature-builder/logic/abilityScaling';
import { troopLineFactor, VOLLEY_DAMAGE_FACTOR } from '@/creature-builder/logic/troopBenchmarks';
import { getStatRangesForLevel } from '@/creature-builder/logic/creatureStatTables';
import type { CustomAbilityDefinition } from '@/creature-builder/logic/contracts';
import type { CreatureStrike, ScalableValue } from '@/creature-builder/logic/models';

const strike = (over: Partial<CreatureStrike> = {}): CreatureStrike => ({
  name: 'Spear',
  attackBenchmark: 0.5,
  damageBenchmark: 0.5,
  attackBonus: 11,
  damage: '1d6',
  damageType: 'piercing',
  ...over
});

const LEVELS = [4, 8, 12, 16, 20] as const;

const damageValues = (sv: ScalableValue[]): ScalableValue[] => sv.filter((v) => v.type === 'damage');
const distanceValues = (sv: ScalableValue[]): ScalableValue[] => sv.filter((v) => v.type === 'distance');

describe('troop attack line benchmarks', () => {
  it('tags each sweep damage line with the action count it costs', () => {
    const { scalableValues } = parseAbilityDescription(buildTroopSweep(strike(), 8).description, 8);
    expect(damageValues(scalableValues).map((v) => v.troopLine)).toEqual([1, 2, 3]);
  });

  it('tags a volley damage line as the salvo', () => {
    const { scalableValues } = parseAbilityDescription(buildTroopVolley(strike({ isRanged: true, range: 50 }), 8).description, 8);
    expect(damageValues(scalableValues).map((v) => v.troopLine)).toEqual(['salvo']);
  });

  it('leaves non-troop area abilities untagged, so a breath weapon keeps the strike ladder', () => {
    const breath = '<p>The dragon breathes fire in a @Template[type:cone|distance:30] that deals '
      + '@Damage[6d6[fire]|options:area-damage] damage with a @Check[reflex|dc:24|basic|options:area-effect] save.</p>';
    const { scalableValues } = parseAbilityDescription(breath, 8);
    expect(damageValues(scalableValues).map((v) => v.troopLine)).toEqual([undefined]);
  });

  // The regression this whole retarget exists for: the 1-action line is 0.27x the 3-action line by
  // design, so judging it on the raw strike ladder scored an on-target line as bottom-of-the-barrel.
  it('scores a generated line on its own line, not the bottom of the strike ladder', () => {
    for (const level of LEVELS) {
      const { scalableValues } = parseAbilityDescription(buildTroopSweep(strike(), level).description, level);
      for (const value of damageValues(scalableValues)) {
        const scored = getTierInfo(value, level)?.label;
        expect(scored, `L${level} line ${value.troopLine}`).not.toBe('low');
        if (value.troopLine !== 1) continue;
        const onStrikeLadder = {
          ...value,
          troopLine: undefined,
          benchmark: damageToBenchmark(parseDiceFormulaAverage(value.originalValue), level)
        };
        expect(getTierInfo(onStrikeLadder, level)?.label, `L${level} without the retarget`).toBe('low');
      }
    }
  });

  // Published Shambler Troop (L4) verbatim: a slowed troop's "1 to 2" sweep. Its lines sit one rung
  // up the share-of-round ladder (2-action ~1.1x high, 1-action ~0.83x), so they map to lines 2/3.
  const shamblerSweep =
    '<p><span class="action-glyph">1</span> to <span class="action-glyph">2</span></p>'
    + '<p><strong>Frequency</strong> once per round</p><hr />'
    + '<p><strong>Effect</strong> The shamblers lash out at any enemies in their squares or within a '
    + '@Template[type:emanation|distance:5] (@Check[reflex|dc:18|basic] save). The damage depends on the number of actions.</p>'
    + '<p><span class="action-glyph">1</span> @Damage[(2d6+5)[bludgeoning]|options:area-damage] damage</p>'
    + '<p><span class="action-glyph">2</span> @Damage[(2d6+9)[bludgeoning]|options:area-damage] damage</p>';

  it('maps a "1 to 2" sweep onto the top of the ladder, not the bottom', () => {
    const { scalableValues } = parseAbilityDescription(shamblerSweep, 4);
    expect(damageValues(scalableValues).map((v) => v.troopLine)).toEqual([2, 3]);
    expect(damageValues(scalableValues).map((v) => v.troopLineActions)).toEqual([1, 2]);
    for (const value of damageValues(scalableValues)) {
      const verdict = getTierInfo(value, 4);
      expect(verdict?.label, `line ${value.troopLine}`).not.toBe('low');
      expect(verdict?.offScale, `line ${value.troopLine}`).toBeNull();
    }
  });

  it('detects a salvo by its shrinking bursts, whatever the threshold prose says', () => {
    for (const phrase of ['reduced to 2 segments', 'reduced to 2 or fewer segments', 'reduced to 8 or fewer squares']) {
      const volley =
        '<p>The troop launches a volley. This volley is a @Template[type:burst|distance:10] within 50 feet that deals '
        + '@Damage[(2d6+4)[bludgeoning]|options:area-damage] damage with a @Check[reflex|dc:22|basic|options:area-effect] save. '
        + `When the troop is ${phrase}, this area decreases to a @Template[type:burst|distance:5].</p>`;
      const { scalableValues } = parseAbilityDescription(volley, 4);
      expect(damageValues(scalableValues).map((v) => v.troopLine), phrase).toEqual(['salvo']);
      expect(distanceValues(scalableValues).map((v) => v.distanceLabel), phrase).toEqual([
        'Burst radius',
        `Burst radius (${phrase.replace(/^reduced to /, '')})`,
        'Range'
      ]);
    }
  });

  it('does not read a single-burst area attack as a salvo', () => {
    const breath = '<p>The dragon exhales a @Template[type:burst|distance:20] that deals '
      + '@Damage[6d6[fire]|options:area-damage] damage with a @Check[reflex|dc:24|basic|options:area-effect] save.</p>';
    const { scalableValues } = parseAbilityDescription(breath, 8);
    expect(damageValues(scalableValues).map((v) => v.troopLine)).toEqual([undefined]);
  });

  it('scales the ladder by the line factor rather than inventing a second table', () => {
    for (const level of LEVELS) {
      const high = getStatRangesForLevel(level).strikeDamage.high.average;
      const targets = getTroopSweepDamage(level);
      expect(high * troopLineFactor(1)).toBeCloseTo(targets.one, 6);
      expect(high * troopLineFactor(2)).toBeCloseTo(targets.two, 6);
      expect(high * troopLineFactor(3)).toBeCloseTo(targets.three, 6);
    }
  });
});

describe('putting a drifted troop attack back on the curve', () => {
  // The screenshot case: a statblock whose lines were hand-tuned away from the benchmark.
  const offCurve = (level: number) => {
    const ability = customAbilityToSpecialAbility(buildTroopSweep(strike(), level), level, 'spear-jabs');
    return {
      ...ability,
      name: 'Spear Jabs [Battle]',
      customDescriptionTemplate: ability.descriptionTemplate!.replace('The troop engages', 'The kobolds engage'),
      scalableValues: ability.scalableValues!.map((sv) =>
        sv.type === 'damage' ? { ...sv, customValue: '1d4' } : sv
      )
    };
  };

  it('lands every line on its own target', () => {
    const snapped = snapTroopDamageToBenchmark(offCurve(4))!;
    const targets = getTroopSweepDamage(4);
    const [one, two, three] = damageValues(snapped.scalableValues ?? [])
      .map((v) => parseDiceFormulaAverage(getEffectiveValue(v, 4)));
    expect(Math.abs(one - targets.one)).toBeLessThanOrEqual(1);
    expect(Math.abs(two - targets.two)).toBeLessThanOrEqual(1);
    expect(Math.abs(three - targets.three)).toBeLessThanOrEqual(1);
  });

  // At L4 every target is a multiple of 3.5, so bare-dice tiers passed by luck; at L3 (targets
  // 3.2/9/12) dice-only rounding put both the 2- and 3-action lines on 3d6 — the screenshot bug.
  it('keeps the three lines distinct and on-target at every level, not just the lucky ones', () => {
    for (let level = -1; level <= 24; level++) {
      const snapped = snapTroopDamageToBenchmark(offCurve(level))!;
      const targets = getTroopSweepDamage(level);
      const [one, two, three] = damageValues(snapped.scalableValues ?? [])
        .map((v) => parseDiceFormulaAverage(getEffectiveValue(v, level)));
      // Below L1 the 1-/2-action targets sit under one die's average, so both floor at 1d6.
      if (level >= 1) {
        expect(one, `L${level} 1a`).toBeLessThan(two);
        expect(two, `L${level} 2a`).toBeLessThan(three);
      } else {
        expect(one, `L${level} 1a`).toBeLessThanOrEqual(two);
        expect(two, `L${level} 2a`).toBeLessThanOrEqual(three);
      }
      expect(Math.abs(two - targets.two), `L${level} 2a off target`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(three - targets.three), `L${level} 3a off target`).toBeLessThanOrEqual(1.5);
    }
  });

  it('never touches the prose — not the template, not a hand-edited one', () => {
    const original = offCurve(4);
    const snapped = snapTroopDamageToBenchmark(original)!;
    expect(snapped.description).toBe(original.description);
    expect(snapped.descriptionTemplate).toBe(original.descriptionTemplate);
    expect(snapped.customDescriptionTemplate).toBe(original.customDescriptionTemplate);
    expect(snapped.customDescriptionTemplate).toContain('The kobolds engage');
  });

  it('feeds the new numbers straight back through the template', () => {
    const original = offCurve(4);
    const snapped = snapTroopDamageToBenchmark(original)!;
    const before = renderAbilityDescription(original.customDescriptionTemplate!, original.scalableValues!, 4);
    const after = renderAbilityDescription(snapped.customDescriptionTemplate!, snapped.scalableValues!, 4);
    expect(before).toContain('1d4');
    expect(after).not.toContain('1d4');
    expect(after).toContain('The kobolds engage');
  });

  // Bare dice cannot express a salvo's target: one die is a wider step than the gap between
  // adjacent tiers, so at L6/d8 no whole-dice count reads high at all and the button was a no-op.
  it('lands a salvo on its target at every level and die, not just where whole dice happen to fit', () => {
    for (const die of [4, 6, 8, 10, 12]) {
      for (let level = 1; level <= 24; level++) {
        const ability = customAbilityToSpecialAbility(
          buildTroopVolley(strike({ isRanged: true, range: 50, damage: `1d${die}` }), level),
          level,
          `volley-${die}-${level}`
        );
        const snapped = snapTroopDamageToBenchmark(ability)!;
        const [salvo] = damageValues(snapped.scalableValues ?? []);
        const formula = getEffectiveValue(salvo, level);
        const target = getTroopSweepDamage(level).two * VOLLEY_DAMAGE_FACTOR;
        // One die is the floor — a d12 averages 6.5 and no L1 salvo target reaches that.
        if ((die + 1) / 2 > target) expect(formula, `L${level} d${die}`).toBe(`1d${die}`);
        else expect(Math.abs(parseDiceFormulaAverage(formula) - target) / target, `L${level} d${die}`).toBeLessThan(0.15);
      }
    }
  });

  it('leaves the save DC and every area alone', () => {
    const ability = customAbilityToSpecialAbility(buildTroopVolley(strike({ isRanged: true, range: 50 }), 4), 4, 'sling');
    const snapped = snapTroopDamageToBenchmark(ability)!;
    const untouched = (v: ScalableValue[]) => v.filter((sv) => sv.type !== 'damage');
    expect(untouched(snapped.scalableValues ?? [])).toEqual(untouched(ability.scalableValues ?? []));
  });

  it('stays on curve after the creature is rescaled, because it sets a tier not a fixed formula', () => {
    const ability = customAbilityToSpecialAbility(buildTroopSweep(strike(), 4), 4, 'jabs');
    const snapped = snapTroopDamageToBenchmark(ability)!;
    const targets = getTroopSweepDamage(12);
    const [, , three] = damageValues(snapped.scalableValues ?? [])
      .map((v) => parseDiceFormulaAverage(getEffectiveValue(v, 12)));
    expect(Math.abs(three - targets.three) / targets.three).toBeLessThan(0.15);
  });

  it('declines anything that is not a troop attack', () => {
    const plain = customAbilityToSpecialAbility(
      {
        slug: 'breath', name: 'Breath', img: '', group: 'x', actionType: 'action', actions: 2,
        description: '<p>@Damage[6d6[fire]|options:area-damage] damage in a @Template[type:cone|distance:30].</p>'
      },
      8,
      'b'
    );
    expect(troopAttackKindOf(plain)).toBeUndefined();
    expect(snapTroopDamageToBenchmark(plain)).toBeUndefined();
  });
});

describe('secondary damage components', () => {
  const withRider = () => buildTroopSweep(strike({ extraDamage: [{ formula: '1d6', damageType: 'fire', category: 'persistent', baseLevel: 8 }] }), 8);

  it('does not benchmark a rider as if it were the whole line', () => {
    const { scalableValues } = parseAbilityDescription(withRider().description, 8);
    const line2 = damageValues(scalableValues).filter((v) => v.troopLine === 2);
    expect(line2).toHaveLength(2);
    // Both terms make up the line, so both read the line's benchmark — the rider is never scored
    // against the whole line's target (which would read it as far under) nor left off the ladder.
    expect(line2[1].benchmark).toBeCloseTo(line2[0].benchmark, 6);
    expect(line2.reduce((s, v) => s + (v.troopLineShare ?? 1), 0)).toBeCloseTo(1, 6);
  });

  it('benchmarks the line total, not the leading term', () => {
    const { scalableValues } = parseAbilityDescription(withRider().description, 8);
    const line2 = damageValues(scalableValues).filter((v) => v.troopLine === 2);
    const total = line2.reduce((s, v) => s + parseDiceFormulaAverage(v.originalValue), 0);
    expect(line2[0].benchmark).toBeCloseTo(damageToBenchmark(total, 8, troopLineFactor(2)), 6);
  });

  it('gives each term its share of the line when the snap puts it back on curve', () => {
    const ability = customAbilityToSpecialAbility(withRider(), 8, 'rider');
    const snapped = snapTroopDamageToBenchmark(ability)!;
    const line3 = damageValues(snapped.scalableValues ?? []).filter((v) => v.troopLine === 3);
    const total = line3.reduce((s, v) => s + parseDiceFormulaAverage(getEffectiveValue(v, 8)), 0);
    const target = getStatRangesForLevel(8).strikeDamage.high.average * troopLineFactor(3);
    expect(Math.abs(total - target) / target).toBeLessThan(0.15);
    // The author's split survives: the rider stays a rider, it does not swallow the line.
    expect(line3[0].troopLineShare!).toBeGreaterThan(line3[1].troopLineShare!);
  });
});

describe('backfilling troops saved before troop lines existed', () => {
  // Reproduce the old shape: parsed the same way, then stripped of everything the retarget adds.
  const legacy = (level: number) => {
    const { template, scalableValues } = parseAbilityDescription(buildTroopSweep(strike(), level).description, level);
    return {
      template,
      values: scalableValues.map((sv) =>
        sv.type === 'damage'
          ? { ...sv, troopLine: undefined, benchmark: damageToBenchmark(parseDiceFormulaAverage(sv.originalValue), level) }
          : sv
      )
    };
  };

  it('re-tags the lines and re-benchmarks them', () => {
    const { template, values } = legacy(8);
    const filled = backfillTroopLines(template, values, 8);
    expect(damageValues(filled).map((v) => v.troopLine)).toEqual([1, 2, 3]);
    expect(getTierInfo(damageValues(filled)[0], 8)?.label).not.toBe('low');
  });

  it('keeps the user\'s own edits', () => {
    const { template, values } = legacy(8);
    const edited = values.map((sv, i) => (i === 0 ? { ...sv, override: 1, customValue: '4d6' } : sv));
    const filled = backfillTroopLines(template, edited, 8);
    expect(filled[0].override).toBe(1);
    expect(filled[0].customValue).toBe('4d6');
  });

  it('returns the same array when there is nothing to backfill', () => {
    const { scalableValues, template } = parseAbilityDescription('<p>Deals @Damage[2d6[fire]] damage.</p>', 8);
    expect(backfillTroopLines(template, scalableValues, 8)).toBe(scalableValues);
  });
});

describe('area and range editable values', () => {
  it('exposes the volley range, its burst, and the burst it shrinks to at 2 segments', () => {
    const def = buildTroopVolley(strike({ isRanged: true, range: 50 }), 8);
    const { scalableValues } = parseAbilityDescription(def.description, 8);
    expect(distanceValues(scalableValues).map((v) => v.distanceLabel)).toEqual([
      'Burst radius',
      'Burst radius (2 segments)',
      'Range'
    ]);
  });

  it('exposes the sweep emanation', () => {
    const { scalableValues } = parseAbilityDescription(buildTroopSweep(strike(), 8).description, 8);
    expect(distanceValues(scalableValues).map((v) => v.distanceLabel)).toEqual(['Emanation radius']);
  });

  it('leaves an edited distance flat when the creature level changes', () => {
    const def = buildTroopVolley(strike({ isRanged: true, range: 50 }), 8);
    const { template, scalableValues } = parseAbilityDescription(def.description, 8);
    const burst = distanceValues(scalableValues)[0];
    expect(burst.originalValue).toBe('10');
    // Re-rendering three levels up must not touch it — areas are authored, not level-derived.
    expect(renderAbilityDescription(template, scalableValues, 11)).toContain('@Template[type:burst|distance:10]');
  });

  it('ignores "within N feet" outside an area effect', () => {
    const trigger = '<p>An enemy within 30 feet uses a concentrate action.</p>';
    expect(parseAbilityDescription(trigger, 8).scalableValues).toHaveLength(0);
  });
});

describe('picking a generic troop attack', () => {
  const templateDef = (template: 'troop-battle' | 'troop-salvo', name: string): CustomAbilityDefinition => ({
    slug: name.toLowerCase(),
    name,
    img: 'systems/pf2e/icons/actions/OneAction.webp',
    group: 'core-attack',
    description: '<p>Prose describing the pattern, with no damage of its own.</p>',
    actionType: 'action',
    actions: 1,
    traits: ['attack'],
    template
  });

  it('expands Battle into the three-line attack rather than the glossary blurb', () => {
    const ability = customAbilityToSpecialAbility(templateDef('troop-battle', 'Battle'), 8, 'a1');
    expect(ability.name).toBe('Battle');
    expect(ability.traits).toEqual(['attack']);
    expect(ability.description).not.toContain('Prose describing');
    expect(damageValues(ability.scalableValues ?? []).map((v) => v.troopLine)).toEqual([1, 2, 3]);
    expect(ability.description).toContain('@Check[reflex|');
  });

  it('expands Salvo with its damage, DC, range and both bursts', () => {
    const ability = customAbilityToSpecialAbility(templateDef('troop-salvo', 'Salvo'), 8, 'a2');
    expect(ability.actions).toBe(2);
    const values = ability.scalableValues ?? [];
    expect(damageValues(values).map((v) => v.troopLine)).toEqual(['salvo']);
    expect(values.filter((v) => v.type === 'dc')).toHaveLength(1);
    expect(distanceValues(values).map((v) => v.distanceLabel)).toEqual([
      'Burst radius',
      'Burst radius (2 segments)',
      'Range'
    ]);
  });

  // Discrete dice can't hit a fractional target exactly — a 1-action line at L4 is a bare 1d6 (3.5)
  // against 3.78 — so the invariant is closeness to the line's target, not an exact tier.
  it('starts both templates within a die step of every line target', () => {
    for (const level of LEVELS) {
      const targets = getTroopSweepDamage(level);
      for (const template of ['troop-battle', 'troop-salvo'] as const) {
        const def = buildTroopAttackFromTemplate(template, level);
        const { scalableValues } = parseAbilityDescription(def.description, level);
        for (const value of damageValues(scalableValues)) {
          const target = value.troopLine === 1 ? targets.one
            : value.troopLine === 2 ? targets.two
              : value.troopLine === 3 ? targets.three
                : targets.two * troopLineFactor('salvo') / troopLineFactor(2);
          const actual = parseDiceFormulaAverage(value.originalValue);
          const label = `${template} L${level} line ${value.troopLine} (${value.originalValue})`;
          expect(Math.abs(actual - target) / target, label).toBeLessThan(0.15);
          expect(getTierInfo(value, level)?.label, label).not.toBe('low');
        }
      }
    }
  });

  it('leaves an ordinary definition alone', () => {
    const plain = { ...templateDef('troop-battle', 'Form Up'), template: undefined };
    expect(customAbilityToSpecialAbility(plain, 8, 'a3').description).toContain('Prose describing');
  });
});
