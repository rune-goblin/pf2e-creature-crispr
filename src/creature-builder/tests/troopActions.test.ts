import { describe, it, expect } from 'vitest';
import {
  buildTroopSweep,
  buildTroopVolley,
  getTroopSweepDamage,
  TROOP_SWEEP_DAMAGE
} from '@/creature-builder/logic/troopActions';
import { getTroopWeaknessValues } from '@/creature-builder/logic/creatureStatTables';
import type { CreatureLevel } from '@/creature-builder/logic/creatureStatTables';
import { parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import type { CreatureStrike } from '@/creature-builder/logic/models';

const strike = (over: Partial<CreatureStrike> = {}): CreatureStrike => ({
  name: 'Jaws',
  attackBenchmark: 0.5,
  damageBenchmark: 0.5,
  attackBonus: 11,
  damage: '1d6',
  damageType: 'piercing',
  ...over
});

// The three glyph-numbered damage lines, in action order (the glyph header has no @Damage).
function damageLines(description: string): { formula: string; average: number }[] {
  const re = /<span class="action-glyph">[123]<\/span> @Damage\[\(?(\d+d\d+(?:[+-]\d+)?)\)?\[/g;
  const out: { formula: string; average: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) {
    out.push({ formula: m[1], average: parseDiceFormulaAverage(m[1]) });
  }
  return out;
}

function expectLineAverages(description: string, targets: [number, number, number]): void {
  const lines = damageLines(description);
  expect(lines).toHaveLength(3);
  lines.forEach((line, i) => {
    expect(
      Math.abs(line.average - targets[i]),
      `line ${i + 1} (${line.formula}, avg ${line.average}) vs target ${targets[i]}`
    ).toBeLessThanOrEqual(2);
  });
}

describe('buildTroopSweep — pinned published exemplars', () => {
  it('Goblin Rabble (L4, d6): line averages within ±2 of 3.5/11/14, DC 18', () => {
    const out = buildTroopSweep(strike({ name: 'Dogslicer', damage: '1d6', damageType: 'slashing' }), 4);
    expectLineAverages(out.description, [3.5, 11, 14]);
    expect(out.description).toContain('@Check[reflex|dc:18|basic|options:area-effect]');
  });

  it('Wolf Pack (L6, d6): line averages within ±2 of 4.5/14/18, DC 21', () => {
    const out = buildTroopSweep(strike({ name: 'Jaws', damage: '1d6', damageType: 'piercing' }), 6);
    expectLineAverages(out.description, [4.5, 14, 18]);
    expect(out.description).toContain('@Check[reflex|dc:21|basic|options:area-effect]');
  });

  it('Hobgoblin Veteran Regiment (L9, d8): reproduces the published lines, DC 25', () => {
    const out = buildTroopSweep(strike({ name: 'Longsword', damage: '1d8', damageType: 'slashing' }), 9);
    expectLineAverages(out.description, [6.5, 18, 24.5]);
    expect(out.description).toContain('@Check[reflex|dc:25|basic|options:area-effect]');
    expect(out.description).toContain(
      '<p><span class="action-glyph">1</span> @Damage[(1d8+2)[slashing]|options:area-damage] damage</p>'
    );
    expect(out.description).toContain(
      '<p><span class="action-glyph">2</span> @Damage[(2d8+9)[slashing]|options:area-damage] damage</p>'
    );
    expect(out.description).toContain(
      '<p><span class="action-glyph">3</span> @Damage[(3d8+11)[slashing]|options:area-damage] damage</p>'
    );
  });

  it('Viking Guard (L11, d8): line averages within ±2 of 7.5/21/28.5, DC 27', () => {
    const out = buildTroopSweep(strike({ name: 'Battle Axe', damage: '1d8', damageType: 'slashing' }), 11);
    expectLineAverages(out.description, [7.5, 21, 28.5]);
    expect(out.description).toContain('@Check[reflex|dc:27|basic|options:area-effect]');
  });

  it('caps a d4 strike at 4 dice with growing mods (wight pattern 2d4 / 4d4+8 / 4d4+14)', () => {
    const out = buildTroopSweep(strike({ name: 'Claw', damage: '2d4', damageType: 'slashing' }), 9);
    expectLineAverages(out.description, [5, 18, 24]);
    const lines = damageLines(out.description);
    const counts = lines.map((l) => parseInt(l.formula.split('d')[0], 10));
    const mods = lines.map((l) => parseInt(/[+-]\d+$/.exec(l.formula)?.[0] ?? '0', 10));
    expect(counts[1]).toBeLessThanOrEqual(4);
    expect(counts[2]).toBeLessThanOrEqual(4);
    expect(mods[1]).toBeGreaterThan(mods[0]);
    expect(mods[2]).toBeGreaterThan(mods[1]);
  });
});

describe('buildTroopSweep — markup and shape', () => {
  const out = buildTroopSweep(strike({ name: 'Longsword', damage: '1d8', damageType: 'slashing' }), 9);

  it('emits the fact-3 structure exactly: glyph header, Frequency line, <hr />, Effect sentence', () => {
    expect(
      out.description.startsWith('<p><span class="action-glyph">1</span> to <span class="action-glyph">3</span></p>')
    ).toBe(true);
    expect(out.description).toContain('<p><strong>Frequency</strong> once per round</p><hr />');
    expect(out.description).toContain(
      '<p><strong>Effect</strong> The troop engages in a coordinated melee attack against each enemy in a ' +
        '@Template[type:emanation|distance:5], with a @Check[reflex|dc:25|basic|options:area-effect] save. ' +
        'The damage depends on the number of actions.</p>'
    );
  });

  it('carries the automation tags and template every troop action needs', () => {
    expect(out.description).toContain('options:area-damage');
    expect(out.description).toContain('options:area-effect');
    expect(out.description).toContain('@Template');
  });

  it('is a single 1-action item named "{strike} Flurry" with no traits', () => {
    expect(out.name).toBe('Longsword Flurry');
    expect(out.slug).toBe('longsword-flurry');
    expect(out.actionType).toBe('action');
    expect(out.actions).toBe(1);
    expect(out.traits).toEqual([]);
  });

  it('honors an explicit name override', () => {
    const named = buildTroopSweep(strike(), 9, { name: 'Berserker Strikes' });
    expect(named.name).toBe('Berserker Strikes');
    expect(named.slug).toBe('berserker-strikes');
  });

  it('widens to a 10-foot emanation for a reach-10 strike', () => {
    const reach = buildTroopSweep(strike({ traits: ['reach-10'] }), 9);
    expect(reach.description).toContain('@Template[type:emanation|distance:10]');
    const short = buildTroopSweep(strike({ traits: ['agile', 'reach-5'] }), 9);
    expect(short.description).toContain('@Template[type:emanation|distance:5]');
  });

  it('rides a secondary component along at 1/2/2 dice in the published comma grammar (hell hound)', () => {
    const out = buildTroopSweep(
      strike({ name: 'Flaming Jaws', damage: '1d4', persistentDamage: '1d6', persistentDamageType: 'fire' }),
      8
    );
    expect(out.description).toContain(
      '<p><span class="action-glyph">1</span> @Damage[1d4[piercing],1d6[fire]|options:area-damage]{1d4 piercing damage plus 1d6 fire damage}</p>'
    );
    const riderDice = [...out.description.matchAll(/,(\dd6)\[fire\]/g)].map((m) => m[1]);
    expect(riderDice).toEqual(['1d6', '2d6', '2d6']);
  });
});

describe('buildTroopVolley — pinned published exemplar', () => {
  it('Hobgoblin Shortbow Volley (L9, d6, range 60): burst 10 within 60, ~4d6, DC 25, shrink sentence', () => {
    const out = buildTroopVolley(
      strike({ name: 'Shortbow', damage: '1d6', damageType: 'piercing', range: 60, isRanged: true }),
      9
    );
    expect(out.name).toBe('Shortbow Volley');
    expect(out.actionType).toBe('action');
    expect(out.actions).toBe(2);
    expect(out.description).toContain('@Template[type:burst|distance:10] within 60 feet');
    expect(out.description).toContain('@Check[reflex|dc:25|basic|options:area-effect]');
    expect(out.description).toContain(
      'When the troop is reduced to 2 segments, this area decreases to a @Template[type:burst|distance:5].'
    );

    const dice = /@Damage\[(\d+d\d+)\[piercing\]\|options:area-damage\]/.exec(out.description);
    expect(dice, 'dice-only damage macro').not.toBeNull();
    expect(Math.abs(parseDiceFormulaAverage(dice![1]) - 14)).toBeLessThanOrEqual(2);
  });

  it('long-range strikes (≥120 ft) get burst 15 shrinking to 10, range snapped to a published band', () => {
    const out = buildTroopVolley(
      strike({ name: 'Longbow', damage: '1d8', damageType: 'piercing', range: 150, isRanged: true }),
      9
    );
    expect(out.description).toContain('@Template[type:burst|distance:15] within 120 feet');
    expect(out.description).toContain('this area decreases to a @Template[type:burst|distance:10].');
  });

  it('defaults to within 60 feet when the strike has no range', () => {
    const out = buildTroopVolley(strike({ name: 'Sling', isRanged: true }), 9);
    expect(out.description).toContain('within 60 feet');
  });

  it('carries the automation tags and template', () => {
    const out = buildTroopVolley(strike({ name: 'Shortbow', range: 60, isRanged: true }), 9);
    expect(out.description).toContain('options:area-damage');
    expect(out.description).toContain('options:area-effect');
    expect(out.description).toContain('@Template');
  });
});

describe('TROOP_SWEEP_DAMAGE table', () => {
  const levels = Object.keys(TROOP_SWEEP_DAMAGE).map(Number).sort((a, b) => a - b) as CreatureLevel[];

  it('covers levels -1..24 with monotonically non-decreasing lines', () => {
    expect(levels[0]).toBe(-1);
    expect(levels[levels.length - 1]).toBe(24);
    expect(levels).toHaveLength(26);
    for (let i = 1; i < levels.length; i++) {
      const prev = TROOP_SWEEP_DAMAGE[levels[i - 1]];
      const next = TROOP_SWEEP_DAMAGE[levels[i]];
      expect(next.one, `one at L${levels[i]}`).toBeGreaterThanOrEqual(prev.one);
      expect(next.two, `two at L${levels[i]}`).toBeGreaterThanOrEqual(prev.two);
      expect(next.three, `three at L${levels[i]}`).toBeGreaterThanOrEqual(prev.three);
    }
  });

  it('each line escalates within a level (one < two < three)', () => {
    for (const level of levels) {
      const { one, two, three } = TROOP_SWEEP_DAMAGE[level];
      expect(two, `L${level}`).toBeGreaterThan(one);
      expect(three, `L${level}`).toBeGreaterThan(two);
    }
  });

  it('getTroopSweepDamage clamps out-of-range levels', () => {
    expect(getTroopSweepDamage(-5)).toEqual(TROOP_SWEEP_DAMAGE[-1]);
    expect(getTroopSweepDamage(30)).toEqual(TROOP_SWEEP_DAMAGE[24]);
  });
});

describe('troop weakness table (fact 9: area = splash, published steps)', () => {
  it('pins the published medians', () => {
    expect(getTroopWeaknessValues(6)).toEqual({ area: 5, splash: 5 });
    expect(getTroopWeaknessValues(9)).toEqual({ area: 10, splash: 10 });
    expect(getTroopWeaknessValues(13)).toEqual({ area: 12, splash: 12 });
    expect(getTroopWeaknessValues(14)).toEqual({ area: 15, splash: 15 });
    expect(getTroopWeaknessValues(19)).toEqual({ area: 20, splash: 20 });
    expect(getTroopWeaknessValues(1)).toEqual({ area: 2, splash: 2 });
  });

  it('formUp halves splash to the published Form Up cluster (5/2, 10/5, 15/8)', () => {
    expect(getTroopWeaknessValues(6, { formUp: true })).toEqual({ area: 5, splash: 2 });
    expect(getTroopWeaknessValues(9, { formUp: true })).toEqual({ area: 10, splash: 5 });
    expect(getTroopWeaknessValues(14, { formUp: true })).toEqual({ area: 15, splash: 8 });
  });
});
