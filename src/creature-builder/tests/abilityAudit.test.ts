import { describe, it, expect } from 'vitest';
import { auditAbility } from '@/creature-builder/logic/abilityAudit';
import { buildTroopSweep, buildTroopVolley } from '@/creature-builder/logic/troopActions';
import { customAbilityToSpecialAbility, snapTroopDamageToBenchmark } from '@/creature-builder/logic/customAbility';
import { renderAbilityDescription } from '@/creature-builder/logic/abilityScaling';
import { troopLineFactor } from '@/creature-builder/logic/troopBenchmarks';
import { getStatRangesForLevel } from '@/creature-builder/logic/creatureStatTables';
import type { CreatureStrike } from '@/creature-builder/logic/models';

const strike = (over: Partial<CreatureStrike> = {}): CreatureStrike => ({
  name: 'Spear',
  attackBenchmark: 0.5,
  damageBenchmark: 0.5,
  attackBonus: 11,
  damage: '1d6',
  damageType: 'piercing',
  ...over
});

const damageLines = (desc: string, level: number) =>
  auditAbility(desc, level).damage.filter((d) => d.lane === 'damage' && d.troopLine !== undefined);

describe('auditing a written ability', () => {
  it('totals a split line instead of judging its leading term', () => {
    const desc = buildTroopSweep(strike({ extraDamage: [{ formula: '1d6', damageType: 'fire', category: 'persistent', baseLevel: 8 }] }), 8).description;
    const three = damageLines(desc, 8).find((d) => d.troopLine === 3)!;
    expect(three.formula).toContain(',');
    // 4d6+1 (15) plus the 2d6 rider (7): the line is 22, not 15.
    expect(three.average).toBeCloseTo(22, 6);
    expect(three.verdict!.label).toBe('high');
  });

  it('judges each line against its own share of a round', () => {
    const desc = buildTroopSweep(strike(), 12).description;
    const lines = damageLines(desc, 12);
    expect(lines.map((l) => l.troopLine)).toEqual([1, 2, 3]);
    // A troop built on benchmark reads the same tier on every line, however little of a round it costs.
    for (const line of lines) expect(line.verdict!.label, `line ${line.troopLine}`).toBe('high');
  });

  it('answers for every line, so drift on one cannot hide behind another', () => {
    const lines = damageLines(buildTroopSweep(strike(), 8).description, 8);
    expect(lines.filter((l) => l.representative).map((l) => l.troopLine)).toEqual([1, 2, 3]);
    // All three are shown; the 1-action line's target is finer than one die step, so it is not judged.
    expect(lines.filter((l) => l.judged).map((l) => l.troopLine)).toEqual([2, 3]);
  });

  it('makes the salvo its own representative line', () => {
    const desc = buildTroopVolley(strike({ isRanged: true, range: 50 }), 8).description;
    const lines = damageLines(desc, 8);
    expect(lines).toHaveLength(1);
    expect(lines[0].troopLine).toBe('salvo');
    expect(lines[0].representative).toBe(true);
    const target = getStatRangesForLevel(8).strikeDamage.high.average * troopLineFactor('salvo');
    expect(Math.abs(lines[0].average - target) / target).toBeLessThan(0.2);
  });

  it('keeps persistent and healing on their own ladders, out of the line total', () => {
    const desc =
      '<p>@Damage[3d6[fire],2d6[persistent,fire]|options:area-damage] damage in a @Template[type:burst|distance:20].</p>';
    const { damage } = auditAbility(desc, 10);
    expect(damage.map((d) => d.lane)).toEqual(['damage', 'persistent']);
    expect(damage[0].average).toBeCloseTo(10.5, 6);
    expect(damage[1].average).toBeCloseTo(7, 6);
  });

  it('reports what it could not benchmark instead of dropping it', () => {
    // A Foundry expression rescales itself and is healthy; a compound sum is parser inadequacy.
    const selfScaling = auditAbility('<p>@Damage[2d6+@actor.abilities.str.mod[fire]] damage.</p>', 10);
    expect(selfScaling.unbenchmarked).toEqual([
      { formula: '2d6+@actor.abilities.str.mod[fire]', reason: 'self-scaling' }
    ]);
    expect(auditAbility('<p>@Damage[(2d6+3d4)[fire]] damage.</p>', 10).unbenchmarked[0].reason).toBe('unparsed');

    const broken = auditAbility('<p>@Damage[] damage.</p>', 10);
    expect(broken.malformed).toHaveLength(1);
  });

  it('classifies a save DC on the ability ladder', () => {
    const { checks } = auditAbility('<p>@Check[reflex|dc:29|basic|options:area-effect]</p>', 10);
    expect(checks).toHaveLength(1);
    expect(checks[0].statistic).toBe('reflex');
    expect(checks[0].basic).toBe(true);
    expect(checks[0].verdict!.label).toBe('high');
  });
});

// The builder and the auditor must agree, or Damage on curve leaves a troop still flagged.
describe('what the builder puts on curve, the audit reads on curve', () => {
  it('never flags a snapped sweep, at any level or die face', () => {
    const flagged: string[] = [];
    for (const die of [4, 6, 8, 10, 12]) {
      for (let level = 1; level <= 24; level++) {
        const ability = customAbilityToSpecialAbility(
          buildTroopSweep(strike({ damage: `1d${die}` }), level),
          level,
          `sweep-${die}-${level}`
        );
        const snapped = snapTroopDamageToBenchmark(ability)!;
        const rendered = renderAbilityDescription(snapped.descriptionTemplate!, snapped.scalableValues!, level);
        for (const row of auditAbility(rendered, level).damage) {
          if (!row.judged || row.troopLine === undefined) continue;
          // One die is the floor: at L1 a d10/d12 troop overshoots a 4.3 target with nothing
          // smaller to write, so the audit is reading a real overshoot, not rounding noise.
          if (level === 1 && die >= 10) continue;
          if (row.verdict!.label !== 'high' || row.verdict!.offScale)
            flagged.push(`L${level} d${die} line ${row.troopLine}: ${row.formula} → ${row.verdict!.label}`);
        }
      }
    }
    expect(flagged).toEqual([]);
  });
});
