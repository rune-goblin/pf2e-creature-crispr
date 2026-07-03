import { describe, it, expect } from 'vitest';
import {
  getStrikeEffectiveDamageBar,
  suggestPersistentFormula,
  parseDiceFormulaMax
} from '@/creature-builder/editor/creatureEditorUtils';
import { parseDiceFormulaAverage } from '@/creature-builder/logic/creatureStatTables';
import { getDamageTypeGroups } from '@/creature-builder/ui/vocab';

describe('parseDiceFormulaMax', () => {
  it('returns the maximum roll of a dice formula, a flat integer as itself, 0 when empty/invalid', () => {
    expect(parseDiceFormulaMax('1d4')).toBe(4);
    expect(parseDiceFormulaMax('2d6+3')).toBe(15);
    expect(parseDiceFormulaMax('6')).toBe(6);
    expect(parseDiceFormulaMax('')).toBe(0);
    expect(parseDiceFormulaMax('garbage')).toBe(0);
  });
});

describe('parseDiceFormulaAverage flat values', () => {
  it('treats a bare integer as its own average', () => {
    expect(parseDiceFormulaAverage('6')).toBe(6);
    expect(parseDiceFormulaAverage('1d6')).toBe(3.5);
    expect(parseDiceFormulaAverage('')).toBe(0);
  });
});

describe('getStrikeEffectiveDamageBar', () => {
  it('exposes the four L9 strike-damage tier averages as markers', () => {
    const row = getStrikeEffectiveDamageBar(9, 20, '');
    expect(row.markers.map((m) => m.value)).toEqual([16, 20, 24, 30]);
  });

  it('runs the line to base+max with a dot at the average addition (dice)', () => {
    // L9 markers 16/20/24/30. Base 16 (low). 1d4 → avg 2.5 (dot 18.5), max 4 (cap 20 = moderate).
    const row = getStrikeEffectiveDamageBar(9, 16, '1d4');
    expect(row.hasPersistent).toBe(true);
    expect(row.showDot).toBe(true);
    expect(row.basePosition).toBe(0); // 16 = low
    expect(row.effectivePosition).toBeCloseTo(1 / 3, 5); // cap 20 = moderate marker
    expect(row.midPosition).toBeGreaterThan(row.basePosition);
    expect(row.midPosition).toBeLessThan(row.effectivePosition);
    expect(row.overflowMarkers).toEqual([]);
  });

  it('accepts a flat integer and draws no dot (average == max)', () => {
    const row = getStrikeEffectiveDamageBar(9, 16, '6');
    expect(row.hasPersistent).toBe(true); // line + cap still drawn
    expect(row.showDot).toBe(false); // no average dot for a flat value
  });

  it('omits the persistent span when there is no rider', () => {
    const row = getStrikeEffectiveDamageBar(9, 20, '');
    expect(row.hasPersistent).toBe(false);
    expect(row.basePosition).toBe(row.effectivePosition);
    expect(row.midPosition).toBe(row.basePosition);
    expect(row.verdict).toBe('MODERATE');
    expect(row.tone).toBe('moderate');
  });

  it('rescales above extreme and labels the cap value at the right edge', () => {
    // base 24 (high) + 4d8 (avg 18 → dot 42, max 32 → cap 56), both past extreme (30)
    const row = getStrikeEffectiveDamageBar(9, 24, '4d8');
    expect(row.verdict).toBe('above Extreme');
    expect(row.tone).toBe('extreme');
    expect(row.effectivePosition).toBeCloseTo(1, 5); // cap = rightmost, pinned to the edge
    const extreme = row.markers[3].position;
    expect(extreme).toBeLessThan(1); // Extreme tick no longer at the right edge
    expect(row.midPosition).toBeGreaterThan(extreme); // dot sits past the Extreme tick
    expect(row.overflowMarkers).toEqual([{ value: 56, side: 'end' }]); // base 24 + max 32
  });

  it('rescales below low and labels the base value at the left edge', () => {
    const row = getStrikeEffectiveDamageBar(9, 1, ''); // base far below low (16)
    expect(row.verdict).toBe('below Low');
    expect(row.tone).toBe('below');
    expect(row.basePosition).toBe(0); // base = leftmost
    expect(row.markers[0].position).toBeGreaterThan(0); // Low tick no longer at the left edge
    expect(row.overflowMarkers).toEqual([{ value: 1, side: 'start' }]); // base value at the edge
  });

  it('keeps the four tier ticks at even thirds and no edge labels when in range', () => {
    const row = getStrikeEffectiveDamageBar(9, 20, '1d6'); // avg 3.5, max 6 → cap 26 ≤ extreme 30
    expect(row.markers.map((m) => m.position)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(row.overflowMarkers).toEqual([]);
  });
});

describe('suggestPersistentFormula', () => {
  it('seeds a plain NdX dice formula with no flat bonus', () => {
    const formula = suggestPersistentFormula(9, 20);
    expect(formula).toMatch(/^\d+d\d+$/);
    expect(parseDiceFormulaAverage(formula)).toBeGreaterThan(0);
  });
});

describe('getDamageTypeGroups', () => {
  it('offers bleed only on the persistent rider, never the primary attack', () => {
    const primary = getDamageTypeGroups().flatMap((g) => g.options.map((o) => o.value));
    const rider = getDamageTypeGroups({ includeBleed: true }).flatMap((g) => g.options.map((o) => o.value));
    expect(primary).not.toContain('bleed');
    expect(rider).toContain('bleed');
  });

  it('groups the canonical physical / energy / mental damage types', () => {
    const all = getDamageTypeGroups().flatMap((g) => g.options.map((o) => o.value));
    for (const t of ['bludgeoning', 'piercing', 'slashing', 'fire', 'acid', 'mental', 'spirit', 'poison']) {
      expect(all).toContain(t);
    }
  });
});
