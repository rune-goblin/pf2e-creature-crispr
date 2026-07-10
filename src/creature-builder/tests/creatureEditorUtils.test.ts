import { describe, it, expect } from 'vitest';
import {
  formatStat,
  parseDiceFormula,
  calculateAverageDamage,
  buildDiceFormula,
  computeStrikeStats,
  formatDamageAverageDisplay,
  getStrikeDefaultDamageEntry,
  getStatRangeForType,
  formatSpellSlotSummary,
  DICE_SIZES
} from '@/creature-builder/editor/creatureEditorUtils';
import { getStatRangesForLevel, PERSISTENT_EXPECTED_ROUNDS } from '@/creature-builder/logic/creatureStatTables';
import { BENCHMARK_VALUES_4 } from '@/creature-builder/logic/models';
import type { CreatureStrike } from '@/creature-builder/editor/types';

const makeStrike = (overrides: Partial<CreatureStrike> = {}): CreatureStrike => ({
  name: 'Jaws',
  attackBenchmark: BENCHMARK_VALUES_4.high,
  damageBenchmark: BENCHMARK_VALUES_4.moderate,
  attackBonus: 0,
  damage: '',
  damageType: 'piercing',
  ...overrides
});

describe('formatStat', () => {
  it('prefixes non-negative values with +', () => {
    expect(formatStat(5)).toBe('+5');
    expect(formatStat(0)).toBe('+0');
  });

  it('renders negative values with their own sign', () => {
    expect(formatStat(-2)).toBe('-2');
  });

  it('renders undefined as a dash', () => {
    expect(formatStat(undefined)).toBe('-');
  });
});

describe('parseDiceFormula', () => {
  it('parses count, size, and positive bonus', () => {
    expect(parseDiceFormula('2d8+6')).toEqual({ count: 2, size: 8, bonus: 6 });
  });

  it('parses a negative bonus', () => {
    expect(parseDiceFormula('3d12-2')).toEqual({ count: 3, size: 12, bonus: -2 });
  });

  it('defaults bonus to 0 when absent', () => {
    expect(parseDiceFormula('1d4')).toEqual({ count: 1, size: 4, bonus: 0 });
  });

  it('tolerates whitespace like its sibling parsers', () => {
    expect(parseDiceFormula('2d6 + 3')).toEqual({ count: 2, size: 6, bonus: 3 });
    expect(parseDiceFormula(' 1d10 -2 ')).toEqual({ count: 1, size: 10, bonus: -2 });
  });

  it('falls back to 1d8+0 for malformed input', () => {
    for (const bad of ['garbage', '', 'd6', '6', '2d6+']) {
      expect(parseDiceFormula(bad)).toEqual({ count: 1, size: 8, bonus: 0 });
    }
  });

  it('coerces an invalid dice size to d8 but keeps count and bonus', () => {
    expect(parseDiceFormula('2d7+1')).toEqual({ count: 2, size: 8, bonus: 1 });
    expect(parseDiceFormula('2d20')).toEqual({ count: 2, size: 8, bonus: 0 });
  });

  it('coerces a zero dice count to 1', () => {
    expect(parseDiceFormula('0d6+2')).toEqual({ count: 1, size: 6, bonus: 2 });
  });
});

describe('calculateAverageDamage', () => {
  it('averages 2d6+3 to 10', () => {
    expect(calculateAverageDamage(2, 6, 3)).toBe(10);
  });

  it('keeps the fractional half for odd die counts', () => {
    expect(calculateAverageDamage(1, 4, 0)).toBe(2.5);
    expect(calculateAverageDamage(3, 12, -2)).toBe(17.5);
  });
});

describe('buildDiceFormula', () => {
  it('joins components with an explicit sign', () => {
    expect(buildDiceFormula(2, 8, 6)).toBe('2d8+6');
    expect(buildDiceFormula(3, 12, -2)).toBe('3d12-2');
  });

  it('round-trips through parseDiceFormula for every valid size', () => {
    for (const size of DICE_SIZES) {
      for (const bonus of [-4, 0, 7]) {
        expect(parseDiceFormula(buildDiceFormula(2, size, bonus)))
          .toEqual({ count: 2, size, bonus });
      }
    }
  });
});

describe('computeStrikeStats', () => {
  it('resolves L9 high attack / moderate damage from the GMG tables', () => {
    const s = computeStrikeStats(9, makeStrike());
    expect(s.attackBonus).toBe(21);
    expect(s.damage).toBe('2d8+11');
    expect(s.damageAverage).toBe(20);
    expect(s.persistentDamage).toBeUndefined();
    expect(s.combinedDamageAverage).toBe(20);
    expect(s.effectiveDamageAverage).toBe(20);
  });

  it('combined = direct + persistent flat; effective = direct + persistent × expected rounds', () => {
    const s = computeStrikeStats(9, makeStrike({
      persistentBenchmark: 0.5,
      customPersistentFormula: '1d6'
    }));
    expect(s.persistentDamage).toBe('1d6');
    expect(s.persistentAverage).toBe(3.5);
    expect(s.combinedDamageAverage).toBe(23.5);
    expect(s.effectiveDamageAverage).toBeCloseTo(20 + 3.5 * PERSISTENT_EXPECTED_ROUNDS, 5);
  });

  it('a persistent benchmark without a formula adds nothing', () => {
    const s = computeStrikeStats(9, makeStrike({ persistentBenchmark: 0.5 }));
    expect(s.persistentAverage).toBeUndefined();
    expect(s.combinedDamageAverage).toBe(s.damageAverage);
  });

  it('uses a custom damage formula verbatim with its parsed average', () => {
    const s = computeStrikeStats(9, makeStrike({ customDamageFormula: '4d6+2' }));
    expect(s.damage).toBe('4d6+2');
    expect(s.damageAverage).toBe(16);
    expect(s.combinedDamageAverage).toBe(16);
  });
});

describe('formatDamageAverageDisplay', () => {
  it('shows the combined breakdown when persistent damage exists', () => {
    expect(formatDamageAverageDisplay(13, 3.5)).toBe('13+3.5 = 16.5 avg');
  });

  it('shows the simple form without persistent damage', () => {
    expect(formatDamageAverageDisplay(13)).toBe('13 avg');
    expect(formatDamageAverageDisplay(13, 0)).toBe('13 avg');
  });
});

describe('getStrikeDefaultDamageEntry', () => {
  it('returns the L9 formula and average for each benchmark scalar', () => {
    expect(getStrikeDefaultDamageEntry(9, BENCHMARK_VALUES_4.low)).toEqual({ formula: '2d6+9', average: 16 });
    expect(getStrikeDefaultDamageEntry(9, BENCHMARK_VALUES_4.moderate)).toEqual({ formula: '2d8+11', average: 20 });
    expect(getStrikeDefaultDamageEntry(9, BENCHMARK_VALUES_4.high)).toEqual({ formula: '2d10+13', average: 24 });
    expect(getStrikeDefaultDamageEntry(9, BENCHMARK_VALUES_4.extreme)).toEqual({ formula: '2d12+17', average: 30 });
  });

  it('selects by tier boundary at the moderate/high midpoint', () => {
    expect(getStrikeDefaultDamageEntry(9, 0.49)).toEqual({ formula: '2d8+11', average: 20 });
    expect(getStrikeDefaultDamageEntry(9, 0.5)).toEqual({ formula: '2d10+13', average: 24 });
  });
});

describe('getStatRangeForType', () => {
  it('maps every stat type to its range in getStatRangesForLevel', () => {
    const ranges = getStatRangesForLevel(5);
    expect(getStatRangeForType(5, 'ability')).toBe(ranges.abilityMod);
    expect(getStatRangeForType(5, 'perception')).toBe(ranges.perception);
    expect(getStatRangeForType(5, 'ac')).toBe(ranges.ac);
    expect(getStatRangeForType(5, 'hp')).toBe(ranges.hp);
    expect(getStatRangeForType(5, 'save')).toBe(ranges.saves);
    expect(getStatRangeForType(5, 'strikeAttack')).toBe(ranges.strikeAttack);
    expect(getStatRangeForType(5, 'skill')).toBe(ranges.skills);
    expect(getStatRangeForType(5, 'strikeDamage')).toBe(ranges.strikeDamage);
  });
});

describe('formatSpellSlotSummary', () => {
  it('returns empty for no slots or all-zero slots', () => {
    expect(formatSpellSlotSummary({})).toBe('');
    expect(formatSpellSlotSummary({ 1: 0, 2: 0 })).toBe('');
  });

  it('formats a single rank', () => {
    expect(formatSpellSlotSummary({ 1: 2 })).toBe('Rank 1: 2 slots');
  });

  it('formats a contiguous rank span with per-rank counts', () => {
    expect(formatSpellSlotSummary({ 1: 3, 2: 3, 3: 3, 4: 2 })).toBe('Ranks 1-4: 3/3/3/2 slots');
  });

  it('excludes rank 0 (cantrips) from the summary', () => {
    expect(formatSpellSlotSummary({ 0: 5, 1: 2 })).toBe('Rank 1: 2 slots');
    expect(formatSpellSlotSummary({ 0: 5 })).toBe('');
  });

  it('drops trailing zero-slot ranks from the span', () => {
    expect(formatSpellSlotSummary({ 1: 3, 2: 2, 3: 0 })).toBe('Ranks 1-2: 3/2 slots');
  });
});
