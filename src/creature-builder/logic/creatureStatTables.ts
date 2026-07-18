/**
 * PF2e Creature Building Stat Tables Configuration
 *
 * Based on Pathfinder 2e Game Mastery Guide creature building rules.
 * Contains complete stat tables for levels -1 to 24 and functions for
 * interpolating between benchmark levels.
 *
 * SINGLE SOURCE OF TRUTH for all creature stat calculations.
 */

import type { CreatureBenchmarks, CreatureStats, AbilityScore, TroopSize } from './models';
import { BENCHMARK_VALUES, TROOP_SQUARES } from './models';
import { getSpellSlots, MAX_SPELL_RANK } from './spellSlotTables';

// Valid creature levels in PF2e
export type CreatureLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;

/**
 * Stat range for a single level, containing values at each benchmark (5-benchmark system)
 */
export interface StatRange {
  terrible: number;  // 0.00
  low: number;       // 0.25
  moderate: number;  // 0.50
  high: number;      // 0.75
  extreme: number;   // 1.00
}

/**
 * Stat range for stats with only 4 benchmarks (like ability modifiers)
 * Uses evenly distributed scalars: 0.00, 0.33, 0.67, 1.00
 */
export interface StatRange4 {
  low: number;       // 0.00
  moderate: number;  // 0.33
  high: number;      // 0.67
  extreme: number;   // 1.00
}

/**
 * Skill stat range - 4 benchmarks with "low" having a range
 * From PF2e GMG - Skills by Level
 * The "low" benchmark spans a range (e.g., "+2 to +1" at level -1)
 */
export interface SkillStatRange {
  lowMin: number;    // Bottom of low range (scalar 0.0)
  lowMax: number;    // Top of low range
  moderate: number;  // Moderate benchmark (scalar 0.33)
  high: number;      // High benchmark (scalar 0.67)
  extreme: number;   // Extreme benchmark (scalar 1.0)
}

/**
 * Strike damage entry - contains both the dice formula and the average damage
 */
export interface StrikeDamageEntry {
  formula: string;  // e.g., "2d8+6"
  average: number;  // e.g., 15
}

/**
 * Strike damage range for 4 benchmarks (low, moderate, high, extreme)
 */
export interface StrikeDamageRange4 {
  low: StrikeDamageEntry;
  moderate: StrikeDamageEntry;
  high: StrikeDamageEntry;
  extreme: StrikeDamageEntry;
}

/**
 * HP range entry - each benchmark has a min/max range
 * HP uses only 3 benchmarks: low, moderate, high
 */
export interface HPRangeEntry {
  low: { min: number; max: number };
  moderate: { min: number; max: number };
  high: { min: number; max: number };
}

/**
 * Linear interpolation between two values
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Inverse linear interpolation - find t given a value between a and b
 */
function inverseLerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return Math.max(0, Math.min(1, (value - a) / (b - a)));
}

/**
 * Interpolate a stat value based on scalar benchmark (0.0-1.0)
 * Uses the range values and lerps between them
 */
export function interpolateStat(scalar: number, range: StatRange): number {
  const s = Math.max(0, Math.min(1, scalar));  // Clamp to 0-1

  if (s <= 0.25) {
    return lerp(range.terrible, range.low, s / 0.25);
  } else if (s <= 0.50) {
    return lerp(range.low, range.moderate, (s - 0.25) / 0.25);
  } else if (s <= 0.75) {
    return lerp(range.moderate, range.high, (s - 0.50) / 0.25);
  } else {
    return lerp(range.high, range.extreme, (s - 0.75) / 0.25);
  }
}

/**
 * Reverse-engineer scalar benchmark from an actual stat value
 * Used when importing existing actors
 */
export function statToScalar(value: number, range: StatRange): number {
  // Handle edge cases
  if (value <= range.terrible) return 0;
  if (value >= range.extreme) return 1;

  // Find which segment the value falls into and calculate scalar
  if (value <= range.low) {
    return 0.25 * inverseLerp(range.terrible, range.low, value);
  } else if (value <= range.moderate) {
    return 0.25 + 0.25 * inverseLerp(range.low, range.moderate, value);
  } else if (value <= range.high) {
    return 0.50 + 0.25 * inverseLerp(range.moderate, range.high, value);
  } else {
    return 0.75 + 0.25 * inverseLerp(range.high, range.extreme, value);
  }
}

// ============================================================================
// 4-BENCHMARK INTERPOLATION (for ability modifiers)
// Scalars: low=0.00, moderate=0.33, high=0.67, extreme=1.00
// ============================================================================

/**
 * Interpolate a stat value based on scalar benchmark (0.0-1.0) for 4-benchmark stats
 * Segments: 0.00-0.33 (low→moderate), 0.33-0.67 (moderate→high), 0.67-1.00 (high→extreme)
 */
export function interpolateStat4(scalar: number, range: StatRange4): number {
  const s = Math.max(0, Math.min(1, scalar));  // Clamp to 0-1
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;

  if (s <= oneThird) {
    return lerp(range.low, range.moderate, s / oneThird);
  } else if (s <= twoThirds) {
    return lerp(range.moderate, range.high, (s - oneThird) / oneThird);
  } else {
    return lerp(range.high, range.extreme, (s - twoThirds) / oneThird);
  }
}

/**
 * Reverse-engineer scalar benchmark from an actual stat value (4-benchmark system)
 */
export function statToScalar4(value: number, range: StatRange4): number {
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;

  // Handle edge cases
  if (value <= range.low) return 0;
  if (value >= range.extreme) return 1;

  // Find which segment the value falls into and calculate scalar
  if (value <= range.moderate) {
    return oneThird * inverseLerp(range.low, range.moderate, value);
  } else if (value <= range.high) {
    return oneThird + oneThird * inverseLerp(range.moderate, range.high, value);
  } else {
    return twoThirds + oneThird * inverseLerp(range.high, range.extreme, value);
  }
}

// ============================================================================
// SKILL INTERPOLATION (4 benchmarks with low range)
// Scalars: lowMin=0.00, lowMax=0.17, moderate=0.33, high=0.67, extreme=1.00
// The low segment (0-0.33) is split: 0-0.17 for lowMin→lowMax, 0.17-0.33 for lowMax→moderate
// ============================================================================

/**
 * Interpolate a skill bonus based on scalar benchmark (0.0-1.0)
 * Handles the low range specially: 0-0.17 goes from lowMin to lowMax
 */
export function interpolateSkill(scalar: number, range: SkillStatRange): number {
  const s = Math.max(0, Math.min(1, scalar));
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;
  const lowMidpoint = oneThird / 2; // 0.167 - midpoint of low segment

  if (s <= lowMidpoint) {
    // 0 to 0.167: lowMin to lowMax
    return lerp(range.lowMin, range.lowMax, s / lowMidpoint);
  } else if (s <= oneThird) {
    // 0.167 to 0.333: lowMax to moderate
    return lerp(range.lowMax, range.moderate, (s - lowMidpoint) / lowMidpoint);
  } else if (s <= twoThirds) {
    // 0.333 to 0.667: moderate to high
    return lerp(range.moderate, range.high, (s - oneThird) / oneThird);
  } else {
    // 0.667 to 1.0: high to extreme
    return lerp(range.high, range.extreme, (s - twoThirds) / oneThird);
  }
}

/**
 * Reverse-engineer scalar benchmark from an actual skill bonus
 * Handles the low range specially
 */
export function skillToScalar(value: number, range: SkillStatRange): number {
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;
  const lowMidpoint = oneThird / 2; // 0.167

  // Handle edge cases
  if (value <= range.lowMin) return 0;
  if (value >= range.extreme) return 1;

  // Find which segment the value falls into and calculate scalar
  if (value <= range.lowMax) {
    // In the low range (lowMin to lowMax)
    return lowMidpoint * inverseLerp(range.lowMin, range.lowMax, value);
  } else if (value <= range.moderate) {
    // Between lowMax and moderate
    return lowMidpoint + lowMidpoint * inverseLerp(range.lowMax, range.moderate, value);
  } else if (value <= range.high) {
    // Between moderate and high
    return oneThird + oneThird * inverseLerp(range.moderate, range.high, value);
  } else {
    // Between high and extreme
    return twoThirds + oneThird * inverseLerp(range.high, range.extreme, value);
  }
}

// ============================================================================
// 3-BENCHMARK INTERPOLATION (for HP)
// Scalars: low=0.00, moderate=0.50, high=1.00
// ============================================================================

/**
 * Interpolate HP based on scalar benchmark (0.0-1.0) for 3-benchmark stats
 * Interpolates within each range to preserve relative position when scaling
 * Segments: 0-1/3 (low), 1/3-2/3 (moderate), 2/3-1 (high)
 */
export function interpolateHP(scalar: number, range: HPRangeEntry): number {
  const s = Math.max(0, Math.min(1, scalar));
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;

  if (s <= oneThird) {
    // Low range: interpolate from low.min to low.max
    const t = s / oneThird;
    return Math.round(range.low.min + t * (range.low.max - range.low.min));
  } else if (s <= twoThirds) {
    // Moderate range: interpolate from moderate.min to moderate.max
    const t = (s - oneThird) / oneThird;
    return Math.round(range.moderate.min + t * (range.moderate.max - range.moderate.min));
  } else {
    // High range: interpolate from high.min to high.max
    const t = (s - twoThirds) / oneThird;
    return Math.round(range.high.min + t * (range.high.max - range.high.min));
  }
}

/**
 * Get the HP range for display based on current scalar
 */
export function getHPRange(scalar: number, range: HPRangeEntry): { min: number; max: number } {
  const s = Math.max(0, Math.min(1, scalar));
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;

  if (s <= oneThird) {
    return range.low;
  } else if (s <= twoThirds) {
    return range.moderate;
  } else {
    return range.high;
  }
}

/**
 * Get the benchmark label for HP based on scalar
 */
export function getHPBenchmarkLabel(scalar: number): 'low' | 'moderate' | 'high' {
  const s = Math.max(0, Math.min(1, scalar));
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;

  if (s <= oneThird) return 'low';
  if (s <= twoThirds) return 'moderate';
  return 'high';
}

/**
 * Reverse-engineer scalar from HP value (3-benchmark system)
 * Calculates position within the range to preserve relative position when scaling
 */
export function hpToScalar(value: number, range: HPRangeEntry): number {
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;

  // Handle edge cases
  if (value <= range.low.min) return 0;
  if (value >= range.high.max) return 1;

  if (value <= range.low.max) {
    // In low range - interpolate position within segment
    const t = (value - range.low.min) / (range.low.max - range.low.min);
    return t * oneThird;
  } else if (value < range.moderate.min) {
    // Between low and moderate (gap) - treat as start of moderate
    return oneThird;
  } else if (value <= range.moderate.max) {
    // In moderate range - interpolate position within segment
    const t = (value - range.moderate.min) / (range.moderate.max - range.moderate.min);
    return oneThird + t * oneThird;
  } else if (value < range.high.min) {
    // Between moderate and high (gap) - treat as start of high
    return twoThirds;
  } else {
    // In high range - interpolate position within segment
    const t = (value - range.high.min) / (range.high.max - range.high.min);
    return twoThirds + t * oneThird;
  }
}

// ============================================================================
// ABILITY MODIFIER TABLE
// From PF2e GMG - Ability Modifiers by Level
// ============================================================================
// Note: Ability modifiers only have 4 benchmarks in PF2e GMG (low, moderate, high, extreme).
// Levels -1 and 0 have no extreme value, so extreme = high at those levels.
const ABILITY_MODIFIER_TABLE: Record<CreatureLevel, StatRange4> = {
  [-1]: { low: 0, moderate: 2, high: 3, extreme: 4 },
  [0]:  { low: 0, moderate: 2, high: 3, extreme: 4 },
  [1]:  { low: 1, moderate: 3, high: 4, extreme: 5 },
  [2]:  { low: 1, moderate: 3, high: 4, extreme: 5 },
  [3]:  { low: 1, moderate: 3, high: 4, extreme: 5 },
  [4]:  { low: 2, moderate: 3, high: 5, extreme: 6 },
  [5]:  { low: 2, moderate: 4, high: 5, extreme: 6 },
  [6]:  { low: 2, moderate: 4, high: 5, extreme: 7 },
  [7]:  { low: 2, moderate: 4, high: 6, extreme: 7 },
  [8]:  { low: 3, moderate: 4, high: 6, extreme: 7 },
  [9]:  { low: 3, moderate: 4, high: 6, extreme: 7 },
  [10]: { low: 3, moderate: 5, high: 7, extreme: 8 },
  [11]: { low: 3, moderate: 5, high: 7, extreme: 8 },
  [12]: { low: 4, moderate: 5, high: 7, extreme: 8 },
  [13]: { low: 4, moderate: 5, high: 8, extreme: 9 },
  [14]: { low: 4, moderate: 5, high: 8, extreme: 9 },
  [15]: { low: 4, moderate: 6, high: 8, extreme: 9 },
  [16]: { low: 5, moderate: 6, high: 9, extreme: 10 },
  [17]: { low: 5, moderate: 6, high: 9, extreme: 10 },
  [18]: { low: 5, moderate: 6, high: 9, extreme: 10 },
  [19]: { low: 5, moderate: 6, high: 10, extreme: 11 },
  [20]: { low: 6, moderate: 7, high: 10, extreme: 11 },
  [21]: { low: 6, moderate: 7, high: 10, extreme: 11 },
  [22]: { low: 6, moderate: 8, high: 10, extreme: 11 },
  [23]: { low: 6, moderate: 8, high: 10, extreme: 11 },
  [24]: { low: 7, moderate: 9, high: 12, extreme: 13 }
};

// ============================================================================
// PERCEPTION TABLE
// From PF2e GMG - Perception by Level
// ============================================================================
const PERCEPTION_TABLE: Record<CreatureLevel, StatRange> = {
  [-1]: { terrible: 0, low: 2, moderate: 5, high: 8, extreme: 9 },
  [0]:  { terrible: 1, low: 3, moderate: 6, high: 9, extreme: 10 },
  [1]:  { terrible: 2, low: 4, moderate: 7, high: 10, extreme: 11 },
  [2]:  { terrible: 3, low: 5, moderate: 8, high: 11, extreme: 12 },
  [3]:  { terrible: 4, low: 6, moderate: 9, high: 12, extreme: 14 },
  [4]:  { terrible: 6, low: 8, moderate: 11, high: 14, extreme: 15 },
  [5]:  { terrible: 7, low: 9, moderate: 12, high: 15, extreme: 17 },
  [6]:  { terrible: 8, low: 11, moderate: 14, high: 17, extreme: 18 },
  [7]:  { terrible: 10, low: 12, moderate: 15, high: 18, extreme: 20 },
  [8]:  { terrible: 11, low: 13, moderate: 16, high: 19, extreme: 21 },
  [9]:  { terrible: 12, low: 15, moderate: 18, high: 21, extreme: 23 },
  [10]: { terrible: 14, low: 16, moderate: 19, high: 22, extreme: 24 },
  [11]: { terrible: 15, low: 18, moderate: 21, high: 24, extreme: 26 },
  [12]: { terrible: 16, low: 19, moderate: 22, high: 25, extreme: 27 },
  [13]: { terrible: 18, low: 20, moderate: 23, high: 26, extreme: 29 },
  [14]: { terrible: 19, low: 22, moderate: 25, high: 28, extreme: 30 },
  [15]: { terrible: 20, low: 23, moderate: 26, high: 29, extreme: 32 },
  [16]: { terrible: 22, low: 25, moderate: 28, high: 30, extreme: 33 },
  [17]: { terrible: 23, low: 26, moderate: 29, high: 32, extreme: 35 },
  [18]: { terrible: 24, low: 27, moderate: 30, high: 33, extreme: 36 },
  [19]: { terrible: 26, low: 29, moderate: 32, high: 35, extreme: 38 },
  [20]: { terrible: 27, low: 30, moderate: 33, high: 36, extreme: 39 },
  [21]: { terrible: 28, low: 32, moderate: 35, high: 38, extreme: 41 },
  [22]: { terrible: 30, low: 33, moderate: 36, high: 39, extreme: 43 },
  [23]: { terrible: 31, low: 34, moderate: 37, high: 40, extreme: 44 },
  [24]: { terrible: 32, low: 36, moderate: 38, high: 42, extreme: 46 }
};

// ============================================================================
// ARMOR CLASS TABLE
// From PF2e GMG - AC by Level
// ============================================================================
// Note: AC only has 4 benchmarks in PF2e GMG (low, moderate, high, extreme).
const AC_TABLE: Record<CreatureLevel, StatRange4> = {
  [-1]: { low: 12, moderate: 14, high: 15, extreme: 18 },
  [0]:  { low: 13, moderate: 15, high: 16, extreme: 19 },
  [1]:  { low: 13, moderate: 15, high: 16, extreme: 19 },
  [2]:  { low: 15, moderate: 17, high: 18, extreme: 21 },
  [3]:  { low: 16, moderate: 18, high: 19, extreme: 22 },
  [4]:  { low: 18, moderate: 20, high: 21, extreme: 24 },
  [5]:  { low: 19, moderate: 21, high: 22, extreme: 25 },
  [6]:  { low: 21, moderate: 23, high: 24, extreme: 27 },
  [7]:  { low: 22, moderate: 24, high: 25, extreme: 28 },
  [8]:  { low: 24, moderate: 26, high: 27, extreme: 30 },
  [9]:  { low: 25, moderate: 27, high: 28, extreme: 31 },
  [10]: { low: 27, moderate: 29, high: 30, extreme: 33 },
  [11]: { low: 28, moderate: 30, high: 31, extreme: 34 },
  [12]: { low: 30, moderate: 32, high: 33, extreme: 36 },
  [13]: { low: 31, moderate: 33, high: 34, extreme: 37 },
  [14]: { low: 33, moderate: 35, high: 36, extreme: 39 },
  [15]: { low: 34, moderate: 36, high: 37, extreme: 40 },
  [16]: { low: 36, moderate: 38, high: 39, extreme: 42 },
  [17]: { low: 37, moderate: 39, high: 40, extreme: 43 },
  [18]: { low: 39, moderate: 41, high: 42, extreme: 45 },
  [19]: { low: 40, moderate: 42, high: 43, extreme: 46 },
  [20]: { low: 42, moderate: 44, high: 45, extreme: 48 },
  [21]: { low: 43, moderate: 45, high: 46, extreme: 49 },
  [22]: { low: 45, moderate: 47, high: 48, extreme: 51 },
  [23]: { low: 46, moderate: 48, high: 49, extreme: 52 },
  [24]: { low: 48, moderate: 50, high: 51, extreme: 54 }
};

// ============================================================================
// SAVING THROWS TABLE
// From PF2e GMG - Saves by Level
// ============================================================================
const SAVE_TABLE: Record<CreatureLevel, StatRange> = {
  [-1]: { terrible: 0, low: 2, moderate: 5, high: 8, extreme: 9 },
  [0]:  { terrible: 1, low: 3, moderate: 6, high: 9, extreme: 10 },
  [1]:  { terrible: 2, low: 4, moderate: 7, high: 10, extreme: 11 },
  [2]:  { terrible: 3, low: 5, moderate: 8, high: 11, extreme: 12 },
  [3]:  { terrible: 4, low: 6, moderate: 9, high: 12, extreme: 14 },
  [4]:  { terrible: 6, low: 8, moderate: 11, high: 14, extreme: 15 },
  [5]:  { terrible: 7, low: 9, moderate: 12, high: 15, extreme: 17 },
  [6]:  { terrible: 8, low: 11, moderate: 14, high: 17, extreme: 18 },
  [7]:  { terrible: 10, low: 12, moderate: 15, high: 18, extreme: 20 },
  [8]:  { terrible: 11, low: 13, moderate: 16, high: 19, extreme: 21 },
  [9]:  { terrible: 12, low: 15, moderate: 18, high: 21, extreme: 23 },
  [10]: { terrible: 14, low: 16, moderate: 19, high: 22, extreme: 24 },
  [11]: { terrible: 15, low: 18, moderate: 21, high: 24, extreme: 26 },
  [12]: { terrible: 16, low: 19, moderate: 22, high: 25, extreme: 27 },
  [13]: { terrible: 18, low: 20, moderate: 23, high: 26, extreme: 29 },
  [14]: { terrible: 19, low: 22, moderate: 25, high: 28, extreme: 30 },
  [15]: { terrible: 20, low: 23, moderate: 26, high: 29, extreme: 32 },
  [16]: { terrible: 22, low: 25, moderate: 28, high: 30, extreme: 33 },
  [17]: { terrible: 23, low: 26, moderate: 29, high: 32, extreme: 35 },
  [18]: { terrible: 24, low: 27, moderate: 30, high: 33, extreme: 36 },
  [19]: { terrible: 26, low: 29, moderate: 32, high: 35, extreme: 38 },
  [20]: { terrible: 27, low: 30, moderate: 33, high: 36, extreme: 39 },
  [21]: { terrible: 28, low: 32, moderate: 35, high: 38, extreme: 41 },
  [22]: { terrible: 30, low: 33, moderate: 36, high: 39, extreme: 43 },
  [23]: { terrible: 31, low: 34, moderate: 37, high: 40, extreme: 44 },
  [24]: { terrible: 32, low: 36, moderate: 38, high: 42, extreme: 46 }
};

// ============================================================================
// HIT POINTS TABLE
// From PF2e GMG - HP by Level
// HP uses only 3 benchmarks (low/moderate/high) with ranges
// ============================================================================
const HP_TABLE: Record<CreatureLevel, HPRangeEntry> = {
  [-1]: { low: { min: 5, max: 6 }, moderate: { min: 7, max: 8 }, high: { min: 9, max: 9 } },
  [0]:  { low: { min: 11, max: 13 }, moderate: { min: 14, max: 16 }, high: { min: 17, max: 20 } },
  [1]:  { low: { min: 14, max: 16 }, moderate: { min: 19, max: 21 }, high: { min: 24, max: 26 } },
  [2]:  { low: { min: 21, max: 25 }, moderate: { min: 28, max: 32 }, high: { min: 36, max: 40 } },
  [3]:  { low: { min: 31, max: 37 }, moderate: { min: 42, max: 48 }, high: { min: 53, max: 59 } },
  [4]:  { low: { min: 42, max: 48 }, moderate: { min: 57, max: 63 }, high: { min: 72, max: 78 } },
  [5]:  { low: { min: 53, max: 59 }, moderate: { min: 72, max: 78 }, high: { min: 91, max: 97 } },
  [6]:  { low: { min: 67, max: 75 }, moderate: { min: 91, max: 99 }, high: { min: 115, max: 123 } },
  [7]:  { low: { min: 82, max: 90 }, moderate: { min: 111, max: 119 }, high: { min: 140, max: 148 } },
  [8]:  { low: { min: 97, max: 105 }, moderate: { min: 131, max: 139 }, high: { min: 165, max: 173 } },
  [9]:  { low: { min: 112, max: 120 }, moderate: { min: 151, max: 159 }, high: { min: 190, max: 198 } },
  [10]: { low: { min: 127, max: 135 }, moderate: { min: 171, max: 179 }, high: { min: 215, max: 223 } },
  [11]: { low: { min: 142, max: 150 }, moderate: { min: 191, max: 199 }, high: { min: 240, max: 248 } },
  [12]: { low: { min: 157, max: 165 }, moderate: { min: 211, max: 219 }, high: { min: 265, max: 273 } },
  [13]: { low: { min: 172, max: 180 }, moderate: { min: 231, max: 239 }, high: { min: 290, max: 298 } },
  [14]: { low: { min: 187, max: 195 }, moderate: { min: 251, max: 259 }, high: { min: 315, max: 323 } },
  [15]: { low: { min: 202, max: 210 }, moderate: { min: 271, max: 279 }, high: { min: 340, max: 348 } },
  [16]: { low: { min: 217, max: 225 }, moderate: { min: 291, max: 299 }, high: { min: 365, max: 373 } },
  [17]: { low: { min: 232, max: 240 }, moderate: { min: 311, max: 319 }, high: { min: 390, max: 398 } },
  [18]: { low: { min: 247, max: 255 }, moderate: { min: 331, max: 339 }, high: { min: 415, max: 423 } },
  [19]: { low: { min: 262, max: 270 }, moderate: { min: 351, max: 359 }, high: { min: 440, max: 448 } },
  [20]: { low: { min: 277, max: 285 }, moderate: { min: 371, max: 379 }, high: { min: 465, max: 473 } },
  [21]: { low: { min: 295, max: 305 }, moderate: { min: 395, max: 405 }, high: { min: 495, max: 505 } },
  [22]: { low: { min: 317, max: 329 }, moderate: { min: 424, max: 436 }, high: { min: 532, max: 544 } },
  [23]: { low: { min: 339, max: 351 }, moderate: { min: 454, max: 466 }, high: { min: 569, max: 581 } },
  [24]: { low: { min: 367, max: 383 }, moderate: { min: 492, max: 508 }, high: { min: 617, max: 633 } }
};

// ============================================================================
// STRIKE ATTACK BONUS TABLE
// From PF2e GMG - Strike Attack by Level
// Uses 4-benchmark system (no terrible)
// ============================================================================
const STRIKE_ATTACK_TABLE: Record<CreatureLevel, StatRange4> = {
  [-1]: { low: 4, moderate: 6, high: 8, extreme: 10 },
  [0]:  { low: 4, moderate: 6, high: 8, extreme: 10 },
  [1]:  { low: 5, moderate: 7, high: 9, extreme: 11 },
  [2]:  { low: 7, moderate: 9, high: 11, extreme: 13 },
  [3]:  { low: 8, moderate: 10, high: 12, extreme: 14 },
  [4]:  { low: 9, moderate: 12, high: 14, extreme: 16 },
  [5]:  { low: 11, moderate: 13, high: 15, extreme: 17 },
  [6]:  { low: 12, moderate: 15, high: 17, extreme: 19 },
  [7]:  { low: 13, moderate: 16, high: 18, extreme: 20 },
  [8]:  { low: 15, moderate: 18, high: 20, extreme: 22 },
  [9]:  { low: 16, moderate: 19, high: 21, extreme: 23 },
  [10]: { low: 17, moderate: 21, high: 23, extreme: 25 },
  [11]: { low: 19, moderate: 22, high: 24, extreme: 27 },
  [12]: { low: 20, moderate: 24, high: 26, extreme: 28 },
  [13]: { low: 21, moderate: 25, high: 27, extreme: 29 },
  [14]: { low: 23, moderate: 27, high: 29, extreme: 31 },
  [15]: { low: 24, moderate: 28, high: 30, extreme: 32 },
  [16]: { low: 25, moderate: 30, high: 32, extreme: 34 },
  [17]: { low: 27, moderate: 31, high: 33, extreme: 35 },
  [18]: { low: 28, moderate: 33, high: 35, extreme: 37 },
  [19]: { low: 29, moderate: 34, high: 36, extreme: 38 },
  [20]: { low: 31, moderate: 36, high: 38, extreme: 40 },
  [21]: { low: 32, moderate: 37, high: 39, extreme: 41 },
  [22]: { low: 33, moderate: 39, high: 41, extreme: 43 },
  [23]: { low: 35, moderate: 40, high: 42, extreme: 44 },
  [24]: { low: 36, moderate: 42, high: 44, extreme: 46 }
};

// ============================================================================
// STRIKE DAMAGE TABLE
// From PF2e GMG - Damage by Level
// Uses 4-benchmark system with dice formulas and averages
// ============================================================================
const STRIKE_DAMAGE_TABLE: Record<CreatureLevel, StrikeDamageRange4> = {
  [-1]: {
    low: { formula: '1d4', average: 2 },
    moderate: { formula: '1d4', average: 3 },
    high: { formula: '1d4+1', average: 3 },
    extreme: { formula: '1d6+1', average: 4 }
  },
  [0]: {
    low: { formula: '1d4+1', average: 3 },
    moderate: { formula: '1d4+2', average: 4 },
    high: { formula: '1d6+2', average: 5 },
    extreme: { formula: '1d6+3', average: 6 }
  },
  [1]: {
    low: { formula: '1d4+2', average: 4 },
    moderate: { formula: '1d6+2', average: 5 },
    high: { formula: '1d6+3', average: 6 },
    extreme: { formula: '1d8+4', average: 8 }
  },
  [2]: {
    low: { formula: '1d6+3', average: 6 },
    moderate: { formula: '1d8+4', average: 8 },
    high: { formula: '1d10+4', average: 9 },
    extreme: { formula: '1d12+4', average: 11 }
  },
  [3]: {
    low: { formula: '1d6+5', average: 8 },
    moderate: { formula: '1d8+6', average: 10 },
    high: { formula: '1d10+6', average: 12 },
    extreme: { formula: '1d12+8', average: 15 }
  },
  [4]: {
    low: { formula: '2d4+4', average: 9 },
    moderate: { formula: '2d6+5', average: 12 },
    high: { formula: '2d8+5', average: 14 },
    extreme: { formula: '2d10+7', average: 18 }
  },
  [5]: {
    low: { formula: '2d4+6', average: 11 },
    moderate: { formula: '2d6+6', average: 13 },
    high: { formula: '2d8+7', average: 16 },
    extreme: { formula: '2d12+7', average: 20 }
  },
  [6]: {
    low: { formula: '2d4+7', average: 12 },
    moderate: { formula: '2d6+8', average: 15 },
    high: { formula: '2d8+9', average: 18 },
    extreme: { formula: '2d12+10', average: 23 }
  },
  [7]: {
    low: { formula: '2d6+6', average: 13 },
    moderate: { formula: '2d8+8', average: 17 },
    high: { formula: '2d10+9', average: 20 },
    extreme: { formula: '2d12+12', average: 25 }
  },
  [8]: {
    low: { formula: '2d6+8', average: 15 },
    moderate: { formula: '2d8+9', average: 18 },
    high: { formula: '2d10+11', average: 22 },
    extreme: { formula: '2d12+15', average: 28 }
  },
  [9]: {
    low: { formula: '2d6+9', average: 16 },
    moderate: { formula: '2d8+11', average: 20 },
    high: { formula: '2d10+13', average: 24 },
    extreme: { formula: '2d12+17', average: 30 }
  },
  [10]: {
    low: { formula: '2d6+10', average: 17 },
    moderate: { formula: '2d10+11', average: 22 },
    high: { formula: '2d12+13', average: 26 },
    extreme: { formula: '2d12+20', average: 33 }
  },
  [11]: {
    low: { formula: '2d8+10', average: 19 },
    moderate: { formula: '2d10+12', average: 23 },
    high: { formula: '2d12+15', average: 28 },
    extreme: { formula: '2d12+22', average: 35 }
  },
  [12]: {
    low: { formula: '3d6+10', average: 20 },
    moderate: { formula: '3d8+12', average: 25 },
    high: { formula: '3d10+14', average: 30 },
    extreme: { formula: '3d12+19', average: 38 }
  },
  [13]: {
    low: { formula: '3d6+11', average: 21 },
    moderate: { formula: '3d8+14', average: 27 },
    high: { formula: '3d10+16', average: 32 },
    extreme: { formula: '3d12+21', average: 40 }
  },
  [14]: {
    low: { formula: '3d6+13', average: 23 },
    moderate: { formula: '3d8+15', average: 28 },
    high: { formula: '3d10+18', average: 34 },
    extreme: { formula: '3d12+24', average: 43 }
  },
  [15]: {
    low: { formula: '3d6+14', average: 24 },
    moderate: { formula: '3d10+14', average: 30 },
    high: { formula: '3d12+17', average: 36 },
    extreme: { formula: '3d12+26', average: 45 }
  },
  [16]: {
    low: { formula: '3d6+15', average: 25 },
    moderate: { formula: '3d10+15', average: 31 },
    high: { formula: '3d12+18', average: 37 },
    extreme: { formula: '3d12+29', average: 48 }
  },
  [17]: {
    low: { formula: '3d6+16', average: 26 },
    moderate: { formula: '3d10+16', average: 32 },
    high: { formula: '3d12+19', average: 38 },
    extreme: { formula: '3d12+31', average: 50 }
  },
  [18]: {
    low: { formula: '3d6+17', average: 27 },
    moderate: { formula: '3d10+17', average: 33 },
    high: { formula: '3d12+20', average: 40 },
    extreme: { formula: '3d12+34', average: 53 }
  },
  [19]: {
    low: { formula: '4d6+14', average: 28 },
    moderate: { formula: '4d8+17', average: 35 },
    high: { formula: '4d10+20', average: 42 },
    extreme: { formula: '4d12+29', average: 55 }
  },
  [20]: {
    low: { formula: '4d6+15', average: 29 },
    moderate: { formula: '4d8+19', average: 37 },
    high: { formula: '4d10+22', average: 44 },
    extreme: { formula: '4d12+32', average: 58 }
  },
  [21]: {
    low: { formula: '4d6+17', average: 31 },
    moderate: { formula: '4d8+20', average: 38 },
    high: { formula: '4d10+24', average: 46 },
    extreme: { formula: '4d12+34', average: 60 }
  },
  [22]: {
    low: { formula: '4d6+18', average: 32 },
    moderate: { formula: '4d8+22', average: 40 },
    high: { formula: '4d10+26', average: 48 },
    extreme: { formula: '4d12+37', average: 63 }
  },
  [23]: {
    low: { formula: '4d6+19', average: 33 },
    moderate: { formula: '4d10+20', average: 42 },
    high: { formula: '4d12+24', average: 50 },
    extreme: { formula: '4d12+39', average: 65 }
  },
  [24]: {
    low: { formula: '4d6+21', average: 35 },
    moderate: { formula: '4d10+22', average: 44 },
    high: { formula: '4d12+26', average: 52 },
    extreme: { formula: '4d12+42', average: 68 }
  }
};

// ============================================================================
// SKILL BONUS TABLE
// From PF2e GMG - Skills by Level
// The "Low" benchmark has a range (e.g., "+2 to +1" at level -1)
// ============================================================================
const SKILL_TABLE: Record<CreatureLevel, SkillStatRange> = {
  [-1]: { lowMin: 1,  lowMax: 2,  moderate: 4,  high: 5,  extreme: 8 },
  [0]:  { lowMin: 2,  lowMax: 3,  moderate: 5,  high: 6,  extreme: 9 },
  [1]:  { lowMin: 3,  lowMax: 4,  moderate: 6,  high: 7,  extreme: 10 },
  [2]:  { lowMin: 4,  lowMax: 5,  moderate: 7,  high: 8,  extreme: 11 },
  [3]:  { lowMin: 5,  lowMax: 7,  moderate: 9,  high: 10, extreme: 13 },
  [4]:  { lowMin: 7,  lowMax: 8,  moderate: 10, high: 12, extreme: 15 },
  [5]:  { lowMin: 8,  lowMax: 10, moderate: 12, high: 13, extreme: 16 },
  [6]:  { lowMin: 9,  lowMax: 11, moderate: 13, high: 15, extreme: 18 },
  [7]:  { lowMin: 11, lowMax: 13, moderate: 15, high: 17, extreme: 20 },
  [8]:  { lowMin: 12, lowMax: 14, moderate: 16, high: 18, extreme: 21 },
  [9]:  { lowMin: 13, lowMax: 16, moderate: 18, high: 20, extreme: 23 },
  [10]: { lowMin: 15, lowMax: 17, moderate: 19, high: 22, extreme: 25 },
  [11]: { lowMin: 16, lowMax: 19, moderate: 21, high: 23, extreme: 26 },
  [12]: { lowMin: 17, lowMax: 20, moderate: 22, high: 25, extreme: 28 },
  [13]: { lowMin: 19, lowMax: 22, moderate: 24, high: 27, extreme: 30 },
  [14]: { lowMin: 20, lowMax: 23, moderate: 25, high: 28, extreme: 31 },
  [15]: { lowMin: 21, lowMax: 25, moderate: 27, high: 30, extreme: 33 },
  [16]: { lowMin: 23, lowMax: 26, moderate: 28, high: 32, extreme: 35 },
  [17]: { lowMin: 24, lowMax: 28, moderate: 30, high: 33, extreme: 36 },
  [18]: { lowMin: 25, lowMax: 29, moderate: 31, high: 35, extreme: 38 },
  [19]: { lowMin: 27, lowMax: 31, moderate: 33, high: 37, extreme: 40 },
  [20]: { lowMin: 28, lowMax: 32, moderate: 34, high: 38, extreme: 41 },
  [21]: { lowMin: 29, lowMax: 34, moderate: 36, high: 40, extreme: 43 },
  [22]: { lowMin: 31, lowMax: 35, moderate: 37, high: 42, extreme: 45 },
  [23]: { lowMin: 32, lowMax: 36, moderate: 38, high: 43, extreme: 46 },
  [24]: { lowMin: 33, lowMax: 38, moderate: 40, high: 45, extreme: 48 }
};

// ============================================================================
// SPELL DC TABLE
// From PF2e GMG - Spell DC by Level
// ============================================================================
// ============================================================================
// SPELL DC AND SPELL ATTACK TABLES
// From PF2e GMG - Spell DC and Spell Attack Bonus by Level
// Uses 3-benchmark system (Moderate, High, Extreme)
// ============================================================================
interface SpellStatRange {
  moderate: number;
  high: number;
  extreme: number;
}

const SPELL_DC_TABLE: Record<CreatureLevel, SpellStatRange> = {
  [-1]: { moderate: 13, high: 16, extreme: 19 },
  [0]:  { moderate: 13, high: 16, extreme: 19 },
  [1]:  { moderate: 14, high: 17, extreme: 20 },
  [2]:  { moderate: 15, high: 18, extreme: 22 },
  [3]:  { moderate: 17, high: 20, extreme: 23 },
  [4]:  { moderate: 18, high: 21, extreme: 25 },
  [5]:  { moderate: 19, high: 22, extreme: 26 },
  [6]:  { moderate: 21, high: 24, extreme: 27 },
  [7]:  { moderate: 22, high: 25, extreme: 29 },
  [8]:  { moderate: 23, high: 26, extreme: 30 },
  [9]:  { moderate: 25, high: 28, extreme: 32 },
  [10]: { moderate: 26, high: 29, extreme: 33 },
  [11]: { moderate: 27, high: 30, extreme: 34 },
  [12]: { moderate: 29, high: 32, extreme: 36 },
  [13]: { moderate: 30, high: 33, extreme: 37 },
  [14]: { moderate: 31, high: 34, extreme: 39 },
  [15]: { moderate: 33, high: 36, extreme: 40 },
  [16]: { moderate: 34, high: 37, extreme: 41 },
  [17]: { moderate: 35, high: 38, extreme: 43 },
  [18]: { moderate: 37, high: 40, extreme: 44 },
  [19]: { moderate: 38, high: 41, extreme: 46 },
  [20]: { moderate: 39, high: 42, extreme: 47 },
  [21]: { moderate: 41, high: 44, extreme: 48 },
  [22]: { moderate: 42, high: 45, extreme: 50 },
  [23]: { moderate: 43, high: 46, extreme: 51 },
  [24]: { moderate: 45, high: 48, extreme: 52 }
};

const SPELL_ATTACK_TABLE: Record<CreatureLevel, SpellStatRange> = {
  [-1]: { moderate: 5,  high: 8,  extreme: 11 },
  [0]:  { moderate: 5,  high: 8,  extreme: 11 },
  [1]:  { moderate: 6,  high: 9,  extreme: 12 },
  [2]:  { moderate: 7,  high: 10, extreme: 14 },
  [3]:  { moderate: 9,  high: 12, extreme: 15 },
  [4]:  { moderate: 10, high: 13, extreme: 17 },
  [5]:  { moderate: 11, high: 14, extreme: 18 },
  [6]:  { moderate: 13, high: 16, extreme: 19 },
  [7]:  { moderate: 14, high: 17, extreme: 21 },
  [8]:  { moderate: 15, high: 18, extreme: 22 },
  [9]:  { moderate: 17, high: 20, extreme: 24 },
  [10]: { moderate: 18, high: 21, extreme: 25 },
  [11]: { moderate: 19, high: 22, extreme: 26 },
  [12]: { moderate: 21, high: 24, extreme: 28 },
  [13]: { moderate: 22, high: 25, extreme: 29 },
  [14]: { moderate: 23, high: 26, extreme: 31 },
  [15]: { moderate: 25, high: 28, extreme: 32 },
  [16]: { moderate: 26, high: 29, extreme: 33 },
  [17]: { moderate: 27, high: 30, extreme: 35 },
  [18]: { moderate: 29, high: 32, extreme: 36 },
  [19]: { moderate: 30, high: 33, extreme: 38 },
  [20]: { moderate: 31, high: 34, extreme: 39 },
  [21]: { moderate: 33, high: 36, extreme: 40 },
  [22]: { moderate: 34, high: 37, extreme: 42 },
  [23]: { moderate: 35, high: 38, extreme: 43 },
  [24]: { moderate: 37, high: 40, extreme: 44 }
};

// ============================================================================
// RESISTANCE/WEAKNESS TABLE
// ============================================================================

/**
 * Resistance/Weakness range for a level (min and max values)
 */
export interface ResistanceWeaknessRange {
  min: number;
  max: number;
}

/**
 * Resistance and weakness values by level
 * From PF2e GMG creature building guidelines
 */
const RESISTANCE_WEAKNESS_TABLE: Record<CreatureLevel, ResistanceWeaknessRange> = {
  [-1]: { min: 1, max: 1 },
  [0]:  { min: 1, max: 3 },
  [1]:  { min: 2, max: 3 },
  [2]:  { min: 2, max: 5 },
  [3]:  { min: 3, max: 6 },
  [4]:  { min: 4, max: 7 },
  [5]:  { min: 4, max: 8 },
  [6]:  { min: 5, max: 9 },
  [7]:  { min: 5, max: 10 },
  [8]:  { min: 6, max: 11 },
  [9]:  { min: 6, max: 12 },
  [10]: { min: 7, max: 13 },
  [11]: { min: 7, max: 14 },
  [12]: { min: 8, max: 15 },
  [13]: { min: 8, max: 16 },
  [14]: { min: 9, max: 17 },
  [15]: { min: 9, max: 18 },
  [16]: { min: 9, max: 19 },
  [17]: { min: 10, max: 19 },
  [18]: { min: 10, max: 20 },
  [19]: { min: 11, max: 21 },
  [20]: { min: 11, max: 22 },
  [21]: { min: 12, max: 23 },
  [22]: { min: 12, max: 24 },
  [23]: { min: 13, max: 25 },
  [24]: { min: 13, max: 26 }
};

/**
 * Get resistance/weakness range for a given level
 */
export function getResistanceWeaknessRange(level: number): ResistanceWeaknessRange {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;
  return RESISTANCE_WEAKNESS_TABLE[clampedLevel];
}

/**
 * Scale a resistance/weakness value from one level to another
 * Maintains the relative position within the min-max range
 */
export function scaleResistanceWeakness(value: number, fromLevel: number, toLevel: number): number {
  const fromRange = getResistanceWeaknessRange(fromLevel);
  const toRange = getResistanceWeaknessRange(toLevel);

  // Calculate scalar position within the from range (0 = min, 1 = max)
  const rangeSize = fromRange.max - fromRange.min;
  const scalar = rangeSize > 0 ? (value - fromRange.min) / rangeSize : 0.5;

  // Apply scalar to the target range
  const toRangeSize = toRange.max - toRange.min;
  return Math.round(toRange.min + scalar * toRangeSize);
}

/**
 * Convert a resistance/weakness value to a benchmark scalar (0-1)
 */
export function resistanceWeaknessToScalar(value: number, level: number): number {
  const range = getResistanceWeaknessRange(level);
  const rangeSize = range.max - range.min;
  if (rangeSize === 0) return 0.5;
  return Math.max(0, Math.min(1, (value - range.min) / rangeSize));
}

/**
 * Convert a benchmark scalar (0-1) to a resistance/weakness value
 */
export function scalarToResistanceWeakness(scalar: number, level: number): number {
  const range = getResistanceWeaknessRange(level);
  const rangeSize = range.max - range.min;
  return Math.round(range.min + scalar * rangeSize);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all stat ranges for a given level
 */
export function getStatRangesForLevel(level: number): {
  abilityMod: StatRange4;  // 4-benchmark system for abilities
  perception: StatRange;
  ac: StatRange4;          // 4-benchmark system for AC
  saves: StatRange;
  hp: HPRangeEntry;        // 3-benchmark system with ranges for HP
  strikeAttack: StatRange4; // 4-benchmark system for strike attack
  strikeDamage: StrikeDamageRange4; // 4-benchmark system with dice formulas
  skills: SkillStatRange;  // 4-benchmark system with low range
  spellDC: SpellStatRange;     // 3-benchmark system (moderate/high/extreme)
  spellAttack: SpellStatRange; // 3-benchmark system (moderate/high/extreme)
} {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;

  return {
    abilityMod: ABILITY_MODIFIER_TABLE[clampedLevel],
    perception: PERCEPTION_TABLE[clampedLevel],
    ac: AC_TABLE[clampedLevel],
    saves: SAVE_TABLE[clampedLevel],
    hp: HP_TABLE[clampedLevel],
    strikeAttack: STRIKE_ATTACK_TABLE[clampedLevel],
    strikeDamage: STRIKE_DAMAGE_TABLE[clampedLevel],
    skills: SKILL_TABLE[clampedLevel],
    spellDC: SPELL_DC_TABLE[clampedLevel],
    spellAttack: SPELL_ATTACK_TABLE[clampedLevel]
  };
}

/**
 * Interpolate a value for the 3-benchmark spell stat system (DC or Attack)
 * scalar: 0 = moderate, 0.5 = high, 1 = extreme
 */
function interpolateSpellStat(scalar: number, range: SpellStatRange): number {
  const s = Math.max(0, Math.min(1, scalar));

  if (s <= 0.5) {
    // Interpolate between moderate and high
    const t = s / 0.5;
    return range.moderate + t * (range.high - range.moderate);
  } else {
    // Interpolate between high and extreme
    const t = (s - 0.5) / 0.5;
    return range.high + t * (range.extreme - range.high);
  }
}

/**
 * Convert a spell stat value (DC or Attack) to a scalar (0-1) for the 3-benchmark system
 * 0 = moderate, 0.5 = high, 1 = extreme
 */
export function spellStatToScalar(value: number, range: SpellStatRange): number {
  if (value <= range.moderate) return 0;
  if (value >= range.extreme) return 1;

  if (value <= range.high) {
    // Between moderate and high
    return 0.5 * (value - range.moderate) / (range.high - range.moderate);
  } else {
    // Between high and extreme
    return 0.5 + 0.5 * (value - range.high) / (range.extreme - range.high);
  }
}

/**
 * Get the strike damage entry for a given scalar benchmark (4-benchmark system)
 * Returns the damage entry for the nearest benchmark
 */
export function getStrikeDamageForScalar(scalar: number, range: StrikeDamageRange4): StrikeDamageEntry {
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;
  const s = Math.max(0, Math.min(1, scalar));

  // Use boundary-based selection (not nearest)
  if (s < oneThird / 2) return range.low;
  if (s < (oneThird + twoThirds) / 2) return range.moderate;
  if (s < (twoThirds + 1) / 2) return range.high;
  return range.extreme;
}

/**
 * Interpolate the target average damage for a given scalar benchmark (4-benchmark system)
 * Uses linear interpolation between benchmark averages to preserve relative damage position
 */
export function interpolateStrikeDamageAverage(scalar: number, range: StrikeDamageRange4): number {
  const oneThird = 1 / 3;
  const twoThirds = 2 / 3;
  const s = Math.max(0, Math.min(1, scalar));

  if (s <= oneThird) {
    // Interpolate between low and moderate
    const t = s / oneThird;
    return range.low.average + t * (range.moderate.average - range.low.average);
  } else if (s <= twoThirds) {
    // Interpolate between moderate and high
    const t = (s - oneThird) / oneThird;
    return range.moderate.average + t * (range.high.average - range.moderate.average);
  } else {
    // Interpolate between high and extreme
    const t = (s - twoThirds) / oneThird;
    return range.high.average + t * (range.extreme.average - range.high.average);
  }
}

/**
 * Adjust a dice formula's modifier to hit a target average damage
 * Returns the original formula if it already matches, otherwise adjusts the modifier
 *
 * @param baseFormula - The base dice formula (e.g., "2d8+6")
 * @param targetAverage - The desired average damage
 * @returns Adjusted formula with modified bonus to hit target average
 */
export function adjustDamageFormulaToAverage(baseFormula: string, targetAverage: number): string {
  const baseAverage = parseDiceFormulaAverage(baseFormula);

  // If the base formula already matches, use it directly
  if (Math.abs(baseAverage - targetAverage) < 0.5) {
    return baseFormula;
  }

  // Parse the base formula to extract dice and modifier
  const normalized = baseFormula.replace(/\s+/g, '');
  const match = normalized.match(/^(\d+d\d+)([+-]\d+)?$/);
  if (!match) return baseFormula;

  const diceOnly = match[1];
  const diceAverage = parseDiceFormulaAverage(diceOnly);

  // Calculate the new modifier needed to hit the target average
  const newModifier = Math.round(targetAverage - diceAverage);

  if (newModifier === 0) {
    return diceOnly;
  } else if (newModifier > 0) {
    return `${diceOnly}+${newModifier}`;
  } else {
    return `${diceOnly}${newModifier}`;
  }
}

/**
 * Scale strike damage for a given scalar benchmark, preserving relative damage position
 *
 * This function:
 * 1. Calculates the target average damage by interpolating between benchmark averages
 * 2. Finds the closest benchmark formula
 * 3. If the target matches the benchmark exactly, uses the benchmark formula
 * 4. Otherwise, adjusts the modifier to hit the target average
 *
 * @param scalar - The damage benchmark scalar (0-1)
 * @param range - The strike damage range for the target level
 * @returns Object with formula and average damage
 */
export function scaleStrikeDamage(scalar: number, range: StrikeDamageRange4): StrikeDamageEntry {
  const targetAverage = interpolateStrikeDamageAverage(scalar, range);
  const closestEntry = getStrikeDamageForScalar(scalar, range);

  // If the closest benchmark matches the target average, use it directly
  if (Math.abs(closestEntry.average - targetAverage) < 0.5) {
    return closestEntry;
  }

  // Otherwise, adjust the formula to hit the target average
  const adjustedFormula = adjustDamageFormulaToAverage(closestEntry.formula, targetAverage);
  const adjustedAverage = Math.round(targetAverage);

  return {
    formula: adjustedFormula,
    average: adjustedAverage
  };
}

/**
 * Get the benchmark label for a strike damage scalar (4-benchmark system)
 */
export function getStrikeDamageBenchmarkLabel(scalar: number): 'low' | 'moderate' | 'high' | 'extreme' {
  const sixth = 1 / 6;
  if (scalar <= sixth) return 'low';
  if (scalar <= 0.5) return 'moderate';
  if (scalar <= 5 / 6) return 'high';
  return 'extreme';
}

/**
 * Convert average damage to a dice formula
 * Uses common PF2e dice progressions
 */
export function averageToDiceFormula(avgDamage: number): string {
  // Common dice progressions with their averages
  const diceOptions = [
    { dice: '1d4', avg: 2.5 },
    { dice: '1d6', avg: 3.5 },
    { dice: '1d8', avg: 4.5 },
    { dice: '1d10', avg: 5.5 },
    { dice: '1d12', avg: 6.5 },
    { dice: '2d4', avg: 5 },
    { dice: '2d6', avg: 7 },
    { dice: '2d8', avg: 9 },
    { dice: '2d10', avg: 11 },
    { dice: '2d12', avg: 13 },
    { dice: '3d6', avg: 10.5 },
    { dice: '3d8', avg: 13.5 },
    { dice: '3d10', avg: 16.5 },
    { dice: '3d12', avg: 19.5 },
    { dice: '4d6', avg: 14 },
    { dice: '4d8', avg: 18 },
    { dice: '4d10', avg: 22 },
    { dice: '4d12', avg: 26 },
    { dice: '5d6', avg: 17.5 },
    { dice: '5d8', avg: 22.5 },
    { dice: '5d10', avg: 27.5 },
    { dice: '5d12', avg: 32.5 },
    { dice: '6d6', avg: 21 },
    { dice: '6d8', avg: 27 },
    { dice: '6d10', avg: 33 },
    { dice: '6d12', avg: 39 }
  ];

  // Find the best matching dice, then add/subtract a modifier
  let bestMatch = diceOptions[0];
  let bestDiff = Math.abs(avgDamage - bestMatch.avg);

  for (const option of diceOptions) {
    const diff = Math.abs(avgDamage - option.avg);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = option;
    }
  }

  const modifier = Math.round(avgDamage - bestMatch.avg);

  if (modifier === 0) {
    return bestMatch.dice;
  } else if (modifier > 0) {
    return `${bestMatch.dice}+${modifier}`;
  } else {
    return `${bestMatch.dice}${modifier}`;
  }
}

/**
 * Calculate all stats for a creature based on level and scalar benchmarks
 */
export function calculateCreatureStats(
  level: number,
  benchmarks: CreatureBenchmarks
): CreatureStats {
  const ranges = getStatRangesForLevel(level);

  // Get the damage entry based on the benchmark scalar, preserving relative position
  const damageEntry = scaleStrikeDamage(benchmarks.strikeDamage, ranges.strikeDamage);

  return {
    // Abilities use 4-benchmark interpolation
    str: Math.round(interpolateStat4(benchmarks.abilities.str, ranges.abilityMod)),
    dex: Math.round(interpolateStat4(benchmarks.abilities.dex, ranges.abilityMod)),
    con: Math.round(interpolateStat4(benchmarks.abilities.con, ranges.abilityMod)),
    int: Math.round(interpolateStat4(benchmarks.abilities.int, ranges.abilityMod)),
    wis: Math.round(interpolateStat4(benchmarks.abilities.wis, ranges.abilityMod)),
    cha: Math.round(interpolateStat4(benchmarks.abilities.cha, ranges.abilityMod)),

    // AC uses 4-benchmark interpolation
    ac: Math.round(interpolateStat4(benchmarks.ac, ranges.ac)),
    // HP uses 3-benchmark interpolation with ranges
    hp: interpolateHP(benchmarks.hp, ranges.hp),

    fortitude: Math.round(interpolateStat(benchmarks.saves.fortitude, ranges.saves)),
    reflex: Math.round(interpolateStat(benchmarks.saves.reflex, ranges.saves)),
    will: Math.round(interpolateStat(benchmarks.saves.will, ranges.saves)),

    perception: Math.round(interpolateStat(benchmarks.perception, ranges.perception)),

    // Strike attack uses 4-benchmark interpolation
    strikeAttackBonus: Math.round(interpolateStat4(benchmarks.strikeAttack, ranges.strikeAttack)),
    // Strike damage uses the formula from the table
    strikeDamage: damageEntry.formula,
    strikeDamageAverage: damageEntry.average,

    skills: benchmarks.skills.reduce((acc, { skill, benchmark }) => {
      acc[skill] = Math.round(interpolateSkill(benchmark, ranges.skills));
      return acc;
    }, {} as Record<string, number>),

    // Spell DC and Attack use 3-benchmark system (moderate=0, high=0.5, extreme=1)
    spellDC: benchmarks.spellDC !== undefined
      ? Math.round(interpolateSpellStat(benchmarks.spellDC, ranges.spellDC))
      : undefined,
    spellAttack: benchmarks.spellAttack !== undefined
      ? Math.round(interpolateSpellStat(benchmarks.spellAttack, ranges.spellAttack))
      : undefined,

    // Spell slot layout computed from progression type (includes font slots if applicable)
    // Per-rank overrides from benchmarks.spellSlotOverrides replace the computed counts.
    spellSlots: benchmarks.spellProgression && benchmarks.spellProgression !== 'none' && benchmarks.spellProgression !== 'innate'
      ? applySpellSlotOverrides(
          getSpellSlots(benchmarks.spellProgression, level, benchmarks.spellFont),
          benchmarks.spellSlotOverrides
        )
      : undefined
  };
}

/**
 * Merge per-rank slot overrides onto a computed spell slot layout.
 * Overrides are absolute values that replace the computed count for that rank.
 *
 * An override may introduce a rank the level curve never produced — a high-level creature whose
 * casting is all low-rank, or one reaching past its level — so the layout is not a filter here.
 * A count of 0 is how the editor expresses "this rank is gone"; the actor write path zeroes it.
 */
function applySpellSlotOverrides(
  layout: Record<number, number> | undefined,
  overrides: Record<number, number> | undefined
): Record<number, number> | undefined {
  if (!layout) return layout;
  if (!overrides) return layout;
  const result = { ...layout };
  for (const [rankStr, count] of Object.entries(overrides)) {
    const rank = Number(rankStr);
    if (!Number.isInteger(rank) || rank < 0 || rank > MAX_SPELL_RANK) continue;
    result[rank] = Math.max(0, count);
  }
  return result;
}

/**
 * Expected number of rounds persistent damage deals damage before being removed.
 * Based on DC 15 flat check (35% success rate to remove).
 * Expected rounds = 1 / 0.35 ≈ 2.86 (includes the initial round)
 */
export const PERSISTENT_EXPECTED_ROUNDS = 2.86;

/**
 * Parse a dice formula and calculate its average damage
 * Handles formulas like "2d6+9", "2d6 + 9", "1d10 - 2"
 */
export function parseDiceFormulaAverage(formula: string): number {
  // Normalize: remove all spaces
  const normalized = formula.replace(/\s+/g, '');
  const match = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (match) {
    const count = parseInt(match[1], 10);
    const size = parseInt(match[2], 10);
    const bonus = match[3] ? parseInt(match[3], 10) : 0;
    const avgPerDie = (size + 1) / 2;
    return count * avgPerDie + bonus;
  }

  // A flat value (e.g. "6") is a valid damage formula — its average is itself.
  if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);
  return 0;
}

/**
 * Calculate effective damage combining direct and persistent damage.
 * Persistent damage is multiplied by expected rounds (2.86) to get total expected damage.
 */
export function calculateEffectiveDamage(
  directAverage: number,
  persistentFormula?: string
): number {
  if (!persistentFormula) return directAverage;
  const persistentAvg = parseDiceFormulaAverage(persistentFormula);
  return directAverage + (persistentAvg * PERSISTENT_EXPECTED_ROUNDS);
}

/**
 * Calculate computed stats for a single strike based on its benchmarks and creature level
 */
export function calculateStrikeStats(
  level: number,
  attackBenchmark: number,
  damageBenchmark: number,
  customDamageFormula?: string,
  persistentBenchmark?: number,
  customPersistentFormula?: string
): {
  attackBonus: number;
  damage: string;
  damageAverage: number;
  persistentDamage?: string;
  persistentAverage?: number;
  effectiveDamageAverage: number;
} {
  const ranges = getStatRangesForLevel(level);
  const attackBonus = Math.round(interpolateStat4(attackBenchmark, ranges.strikeAttack));

  // Calculate direct damage
  let damage: string;
  let damageAverage: number;

  if (customDamageFormula) {
    // Parse custom formula to get average
    const avg = parseDiceFormulaAverage(customDamageFormula);
    if (avg > 0) {
      damage = customDamageFormula;
      damageAverage = avg;
    } else {
      // Invalid formula, fallback to benchmark with relative position preserved
      const damageEntry = scaleStrikeDamage(damageBenchmark, ranges.strikeDamage);
      damage = damageEntry.formula;
      damageAverage = damageEntry.average;
    }
  } else {
    // Scale damage preserving relative position
    const damageEntry = scaleStrikeDamage(damageBenchmark, ranges.strikeDamage);
    damage = damageEntry.formula;
    damageAverage = damageEntry.average;
  }

  // Persistent damage is the user's explicit formula written verbatim — never generated from a
  // benchmark. PF2e publishes no persistent-by-level table; the rider's weight is judged as
  // effective damage in the editor (direct + persistent × PERSISTENT_EXPECTED_ROUNDS), not
  // snapped to a tier here. `persistentBenchmark` survives only as the "rider enabled" flag.
  let persistentDamage: string | undefined;
  let persistentAverage: number | undefined;

  if (persistentBenchmark !== undefined && customPersistentFormula) {
    const avg = parseDiceFormulaAverage(customPersistentFormula);
    if (avg > 0) {
      persistentDamage = customPersistentFormula;
      persistentAverage = avg;
    }
  }

  // Calculate effective damage (direct + persistent expected)
  const effectiveDamageAverage = calculateEffectiveDamage(damageAverage, persistentDamage);

  return {
    attackBonus,
    damage,
    damageAverage,
    persistentDamage,
    persistentAverage,
    effectiveDamageAverage
  };
}

/**
 * Analyze an actor's stats and determine scalar benchmarks
 * Used when importing existing Foundry actors
 */
export function analyzeStatsForBenchmarks(
  level: number,
  stats: Partial<CreatureStats>
): Partial<CreatureBenchmarks> {
  const ranges = getStatRangesForLevel(level);
  const benchmarks: Partial<CreatureBenchmarks> = {};

  // Analyze ability modifiers (using 4-benchmark system)
  const abilities: Partial<Record<AbilityScore, number>> = {};
  if (stats.str !== undefined) abilities.str = statToScalar4(stats.str, ranges.abilityMod);
  if (stats.dex !== undefined) abilities.dex = statToScalar4(stats.dex, ranges.abilityMod);
  if (stats.con !== undefined) abilities.con = statToScalar4(stats.con, ranges.abilityMod);
  if (stats.int !== undefined) abilities.int = statToScalar4(stats.int, ranges.abilityMod);
  if (stats.wis !== undefined) abilities.wis = statToScalar4(stats.wis, ranges.abilityMod);
  if (stats.cha !== undefined) abilities.cha = statToScalar4(stats.cha, ranges.abilityMod);

  if (Object.keys(abilities).length > 0) {
    benchmarks.abilities = abilities as Record<AbilityScore, number>;
  }

  // Analyze other stats
  if (stats.perception !== undefined) {
    benchmarks.perception = statToScalar(stats.perception, ranges.perception);
  }
  // AC uses 4-benchmark system
  if (stats.ac !== undefined) {
    benchmarks.ac = statToScalar4(stats.ac, ranges.ac);
  }
  // HP uses 3-benchmark system with ranges
  if (stats.hp !== undefined) {
    benchmarks.hp = hpToScalar(stats.hp, ranges.hp);
  }
  if (stats.fortitude !== undefined || stats.reflex !== undefined || stats.will !== undefined) {
    benchmarks.saves = {
      fortitude: stats.fortitude !== undefined ? statToScalar(stats.fortitude, ranges.saves) : BENCHMARK_VALUES.moderate,
      reflex: stats.reflex !== undefined ? statToScalar(stats.reflex, ranges.saves) : BENCHMARK_VALUES.moderate,
      will: stats.will !== undefined ? statToScalar(stats.will, ranges.saves) : BENCHMARK_VALUES.moderate
    };
  }
  // Strike attack uses 4-benchmark system
  if (stats.strikeAttackBonus !== undefined) {
    benchmarks.strikeAttack = statToScalar4(stats.strikeAttackBonus, ranges.strikeAttack);
  }
  // Spell DC and Attack benchmarks - both use 3-benchmark system (moderate=0, high=0.5, extreme=1)
  if (stats.spellDC !== undefined) {
    benchmarks.spellDC = spellStatToScalar(stats.spellDC, ranges.spellDC);
  }
  if (stats.spellAttack !== undefined) {
    benchmarks.spellAttack = spellStatToScalar(stats.spellAttack, ranges.spellAttack);
  }

  // Analyze skills (using skill-specific interpolation with low range)
  if (stats.skills && Object.keys(stats.skills).length > 0) {
    benchmarks.skills = Object.entries(stats.skills).map(([skill, value]) => ({
      skill,
      benchmark: skillToScalar(value, ranges.skills)
    }));
  }

  return benchmarks;
}

// ============================================================================
// TROOP CALCULATIONS
// ============================================================================

/**
 * Troop HP thresholds - troops have threshold segments at 2/3 and 1/3 HP
 */
export interface TroopThresholds {
  maxHP: number;
  threshold1: number;  // First threshold at 2/3 HP remaining
  threshold2: number;  // Second threshold at 1/3 HP remaining
  squares: {
    full: number;
    atThreshold1: number;
    atThreshold2: number;
  };
}

/**
 * Calculate troop HP thresholds based on max HP and troop size
 */
export function calculateTroopThresholds(maxHP: number, troopSize: TroopSize = 'gargantuan'): TroopThresholds {
  const squares = TROOP_SQUARES[troopSize];
  return {
    maxHP,
    threshold1: Math.floor(maxHP * 2 / 3),
    threshold2: Math.floor(maxHP / 3),
    squares: {
      full: squares.full,
      atThreshold1: squares.threshold1,
      atThreshold2: squares.threshold2
    }
  };
}

/**
 * Troop area/splash weakness values by level.
 * Published medians across all 162 troop-trait NPCs (2026-07-18 sweep): area = splash, stepping
 * 5 (≤L6) → 8 (L7–8) → 10 (L9–12) → 12 (L13) → 15 (L14–18) → 20 (L19+), floor 2 below level 2.
 */
export interface TroopWeaknessValues {
  area: number;
  splash: number;
}

const TROOP_WEAKNESS_TABLE: Record<CreatureLevel, TroopWeaknessValues> = {
  [-1]: { area: 2, splash: 2 },
  [0]:  { area: 2, splash: 2 },
  [1]:  { area: 2, splash: 2 },
  [2]:  { area: 5, splash: 5 },
  [3]:  { area: 5, splash: 5 },
  [4]:  { area: 5, splash: 5 },
  [5]:  { area: 5, splash: 5 },
  [6]:  { area: 5, splash: 5 },
  [7]:  { area: 8, splash: 8 },
  [8]:  { area: 8, splash: 8 },
  [9]:  { area: 10, splash: 10 },
  [10]: { area: 10, splash: 10 },
  [11]: { area: 10, splash: 10 },
  [12]: { area: 10, splash: 10 },
  [13]: { area: 12, splash: 12 },
  [14]: { area: 15, splash: 15 },
  [15]: { area: 15, splash: 15 },
  [16]: { area: 15, splash: 15 },
  [17]: { area: 15, splash: 15 },
  [18]: { area: 15, splash: 15 },
  [19]: { area: 20, splash: 20 },
  [20]: { area: 20, splash: 20 },
  [21]: { area: 20, splash: 20 },
  [22]: { area: 20, splash: 20 },
  [23]: { area: 20, splash: 20 },
  [24]: { area: 20, splash: 20 }
};

// Form Up's splash is half area, rounding half to even — the published cluster is 5/2, 10/5, 15/8.
function halfAreaSplash(area: number): number {
  const half = area / 2;
  if (Number.isInteger(half)) return half;
  const floor = Math.floor(half);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Get troop weakness values for area and splash damage at a given level.
 * `formUp` seeds the Form Up variant (splash at half area).
 */
export function getTroopWeaknessValues(level: number, opts: { formUp?: boolean } = {}): TroopWeaknessValues {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;
  const { area, splash } = TROOP_WEAKNESS_TABLE[clampedLevel];
  return opts.formUp ? { area, splash: halfAreaSplash(area) } : { area, splash };
}
