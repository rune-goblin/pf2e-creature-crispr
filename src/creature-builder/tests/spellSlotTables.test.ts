import { describe, it, expect } from 'vitest';
import {
  getHighestSpellRank,
  getFullPreparedSlots,
  getFullSpontaneousSlots,
  getBoundedSlots,
  getFontSlotCount,
  applyFontSlots,
  getSpellSlots,
  deduceSpellProgression,
  detectFont
} from '@/creature-builder/logic/spellSlotTables';

// Oracle = the reference tables transcribed from PF2e class data in the spellSlotTables docstrings,
// NOT copied from code output. If a progression function drifts from its documented spec, these fail.

describe('getHighestSpellRank', () => {
  it('unlocks a new rank every 2 levels, capping at rank 10 (level 19+)', () => {
    const expected: Record<number, number> = {
      [-1]: 1, 0: 1, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 18: 9, 19: 10, 20: 10
    };
    for (const [level, rank] of Object.entries(expected)) {
      expect(getHighestSpellRank(Number(level))).toBe(rank);
    }
  });
});

describe('getFullPreparedSlots', () => {
  // Cleric/Druid/Wizard/Witch: 3 slots per rank, 2 at a freshly-gained (odd-level) highest rank.
  const table: Record<number, Record<number, number>> = {
    [-1]: { 0: 3 },
    0: { 0: 3, 1: 1 },
    1: { 0: 5, 1: 2 },
    2: { 0: 5, 1: 3 },
    3: { 0: 5, 1: 3, 2: 2 },
    4: { 0: 5, 1: 3, 2: 3 },
    5: { 0: 5, 1: 3, 2: 3, 3: 2 },
    6: { 0: 5, 1: 3, 2: 3, 3: 3 },
    7: { 0: 5, 1: 3, 2: 3, 3: 3, 4: 2 },
    17: { 0: 5, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
    18: { 0: 5, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
    19: { 0: 5, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
    20: { 0: 5, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 }
  };
  for (const [level, slots] of Object.entries(table)) {
    it(`matches the reference layout at level ${level}`, () => {
      expect(getFullPreparedSlots(Number(level))).toEqual(slots);
    });
  }
});

describe('getFullSpontaneousSlots', () => {
  // Sorcerer/Oracle/Bard: 4 slots per rank, 3 at a freshly-gained (odd-level) highest rank.
  const table: Record<number, Record<number, number>> = {
    [-1]: { 0: 3 },
    0: { 0: 3, 1: 2 },
    1: { 0: 5, 1: 3 },
    2: { 0: 5, 1: 4 },
    3: { 0: 5, 1: 4, 2: 3 },
    4: { 0: 5, 1: 4, 2: 4 },
    5: { 0: 5, 1: 4, 2: 4, 3: 3 },
    6: { 0: 5, 1: 4, 2: 4, 3: 4 },
    19: { 0: 5, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 },
    20: { 0: 5, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4, 10: 1 }
  };
  for (const [level, slots] of Object.entries(table)) {
    it(`matches the reference layout at level ${level}`, () => {
      expect(getFullSpontaneousSlots(Number(level))).toEqual(slots);
    });
  }
});

describe('getBoundedSlots', () => {
  // Magus/Summoner: from level 5 up, exactly the top two ranks with 2 slots each; lower ranks drop off.
  const table: Record<number, Record<number, number>> = {
    [-1]: { 0: 3 },
    0: { 0: 3, 1: 1 },
    1: { 0: 5, 1: 1 },
    2: { 0: 5, 1: 2 },
    3: { 0: 5, 1: 2, 2: 1 },
    4: { 0: 5, 1: 2, 2: 2 },
    5: { 0: 5, 2: 2, 3: 2 },
    6: { 0: 5, 2: 2, 3: 2 },
    7: { 0: 5, 3: 2, 4: 2 },
    17: { 0: 5, 8: 2, 9: 2 }
  };
  for (const [level, slots] of Object.entries(table)) {
    it(`matches the reference layout at level ${level}`, () => {
      expect(getBoundedSlots(Number(level))).toEqual(slots);
    });
  }
});

describe('getBoundedSlots at fractional sub-1 levels', () => {
  // getBoundedSlots special-cases level<=-1 and level===0; anything in between (e.g. a
  // fractional level) falls through to getBoundedHighestRank's own level<1 guard, which
  // yields highestRank 0 and an early return of cantrips only.
  it('grants only cantrips just below level 1', () => {
    expect(getBoundedSlots(0.5)).toEqual({ 0: 5 });
  });

  it('grants only cantrips just above level -1', () => {
    expect(getBoundedSlots(-0.5)).toEqual({ 0: 5 });
  });
});

describe('divine font', () => {
  it('grants 4/5/6 slots across the level-4/14 boundaries', () => {
    expect([1, 4, 5, 14, 15, 20].map(getFontSlotCount)).toEqual([4, 4, 5, 5, 6, 6]);
  });

  it('adds the font slots to the highest non-cantrip rank only', () => {
    expect(applyFontSlots(getFullPreparedSlots(6), 6)).toEqual({ 0: 5, 1: 3, 2: 3, 3: 8 });
  });

  it('is a no-op when there is no non-cantrip rank', () => {
    expect(applyFontSlots({ 0: 5 }, 10)).toEqual({ 0: 5 });
  });
});

describe('getSpellSlots dispatch', () => {
  it('returns undefined for innate and none progressions', () => {
    expect(getSpellSlots('innate', 10)).toBeUndefined();
    expect(getSpellSlots('none', 10)).toBeUndefined();
  });

  it('dispatches to the matching progression', () => {
    expect(getSpellSlots('fullPrepared', 6)).toEqual(getFullPreparedSlots(6));
    expect(getSpellSlots('fullSpontaneous', 6)).toEqual(getFullSpontaneousSlots(6));
    expect(getSpellSlots('bounded', 6)).toEqual(getBoundedSlots(6));
  });

  it('layers font slots on when a font is supplied', () => {
    expect(getSpellSlots('fullPrepared', 6, 'heal')).toEqual({ 0: 5, 1: 3, 2: 3, 3: 8 });
  });
});

describe('deduceSpellProgression', () => {
  it('returns none for an empty slot profile', () => {
    expect(deduceSpellProgression('prepared', {}, 5)).toBe('none');
  });

  it('classifies a full spontaneous caster by its casting type', () => {
    expect(deduceSpellProgression('spontaneous', { 1: 4, 2: 4, 3: 3 }, 5)).toBe('fullSpontaneous');
  });

  it('classifies a full prepared caster by its casting type', () => {
    expect(deduceSpellProgression('prepared', { 1: 3, 2: 3, 3: 2 }, 5)).toBe('fullPrepared');
  });

  it('reads a 1-2 rank, ≤2 slot profile as bounded', () => {
    expect(deduceSpellProgression('prepared', { 1: 2, 2: 2 }, 4)).toBe('bounded');
  });

  it('is not fooled into bounded by a font-inflated highest rank', () => {
    expect(deduceSpellProgression('prepared', { 1: 3, 2: 3, 3: 7 }, 5)).toBe('fullPrepared');
  });
});

describe('detectFont', () => {
  it('reads a Heal-stacked excess at the highest rank as a heal font', () => {
    const spells = Array.from({ length: 5 }, () => ({ name: 'Heal', rank: 3 }));
    expect(detectFont({ 3: 7 }, 6, spells)).toBe('heal');
  });

  it('reads a Harm-stacked excess as a harm font', () => {
    const spells = Array.from({ length: 5 }, () => ({ name: 'Harm', rank: 3 }));
    expect(detectFont({ 3: 7 }, 6, spells)).toBe('harm');
  });

  it('reports no font when the highest rank carries no excess', () => {
    expect(detectFont({ 1: 3, 2: 3, 3: 3 }, 6, [])).toBeUndefined();
  });

  it('reports no font when there are no active spell ranks at all', () => {
    expect(detectFont({}, 5, [])).toBeUndefined();
  });

  it('reads a large excess as harm when Harm outnumbers Heal but neither alone reaches the excess', () => {
    const spells = [{ name: 'Harm', rank: 3 }, { name: 'Harm', rank: 3 }, { name: 'Heal', rank: 3 }];
    expect(detectFont({ 3: 6 }, 5, spells)).toBe('harm');
  });

  it('reads a large excess as heal when Heal is present and does not trail Harm, even below the excess threshold', () => {
    const spells = [{ name: 'Heal', rank: 3 }];
    expect(detectFont({ 3: 6 }, 5, spells)).toBe('heal');
  });

  it('reports no font for a large excess with no Heal or Harm spells at the highest rank', () => {
    expect(detectFont({ 3: 6 }, 5, [])).toBeUndefined();
  });

  it('reports no font for a moderate (exactly 3) excess unexplained by Heal/Harm', () => {
    expect(detectFont({ 3: 5 }, 5, [])).toBeUndefined();
  });
});
