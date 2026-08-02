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
import { troopLineFactor } from '@/creature-builder/logic/troopBenchmarks';
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
  it('does not benchmark a rider as if it were the whole line', () => {
    const withRider = buildTroopSweep(
      strike({ persistentDamage: '1d6', persistentDamageType: 'fire' }),
      8
    );
    const { scalableValues } = parseAbilityDescription(withRider.description, 8);
    const tagged = damageValues(scalableValues).filter((v) => v.troopLine !== undefined);
    // Three lines, three tags — the fire riders sharing each macro stay untagged.
    expect(tagged).toHaveLength(3);
    expect(damageValues(scalableValues).length).toBeGreaterThan(3);
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
