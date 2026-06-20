/**
 * Utility functions and constants for the Creature Editor
 *
 * These are pure functions with no side effects, extracted from
 * CreatureEditor.svelte for better maintainability.
 */

import {
   getStatRangesForLevel,
   getStrikeDamageForScalar,
   getStrikeDamageBenchmarkLabel,
   calculateStrikeStats,
   parseDiceFormulaAverage,
   calculateEffectiveDamage,
   getPersistentDamageForLevel,
   type StatRange,
   type StrikeDamageRange4
} from '@/creature-builder/logic/creatureStatTables';
import {
   BENCHMARK_VALUES,
   type BenchmarkLabel,
   type SpellProgressionType,
   type SpellSlotLayout,
   type SpellFont
} from '@/creature-builder/logic/models';
import type { CreatureStrike, EditableCreature } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Available PF2e skills for creature skill selection */
export const SKILLS = [
   'Acrobatics', 'Arcana', 'Athletics', 'Crafting', 'Deception',
   'Diplomacy', 'Intimidation', 'Lore', 'Medicine', 'Nature',
   'Occultism', 'Performance', 'Religion', 'Society', 'Stealth',
   'Survival', 'Thievery'
] as const;

/** Valid dice sizes for damage formulas */
export const DICE_SIZES = [4, 6, 8, 10, 12] as const;
export type DiceSize = typeof DICE_SIZES[number];

/** PF2e Remaster damage types */
export const DAMAGE_TYPES = [
   // Physical
   'bludgeoning', 'piercing', 'slashing', 'bleed',
   // Energy
   'acid', 'cold', 'electricity', 'fire', 'force', 'sonic', 'vitality', 'void',
   // Other
   'mental', 'poison', 'spirit', 'untyped'
] as const;

/** Benchmark presets for easy selection */
export const BENCHMARKS: Array<{ key: BenchmarkLabel; label: string; value: number }> = [
   { key: 'terrible', label: 'Terrible', value: BENCHMARK_VALUES.terrible },
   { key: 'low', label: 'Low', value: BENCHMARK_VALUES.low },
   { key: 'moderate', label: 'Mod', value: BENCHMARK_VALUES.moderate },
   { key: 'high', label: 'High', value: BENCHMARK_VALUES.high },
   { key: 'extreme', label: 'Ext', value: BENCHMARK_VALUES.extreme }
];

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format a stat value with sign prefix (e.g., +5 or -2)
 */
export function formatStat(value: number | undefined): string {
   if (value === undefined) return '-';
   return value >= 0 ? `+${value}` : `${value}`;
}

// ============================================================================
// Dice Formula Functions
// ============================================================================

export interface ParsedDiceFormula {
   count: number;
   size: DiceSize;
   bonus: number;
}

/**
 * Parse a dice formula like "2d8+6" into components
 */
export function parseDiceFormula(formula: string): ParsedDiceFormula {
   const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/);
   if (!match) {
      return { count: 1, size: 8, bonus: 0 };
   }
   const count = parseInt(match[1], 10) || 1;
   const size = parseInt(match[2], 10) as DiceSize;
   const bonus = match[3] ? parseInt(match[3], 10) : 0;
   // Validate dice size
   const validSize = DICE_SIZES.includes(size) ? size : 8;
   return { count, size: validSize, bonus };
}

/**
 * Calculate average damage from dice components
 */
export function calculateAverageDamage(count: number, size: number, bonus: number): number {
   const avgPerDie = (size + 1) / 2;
   return count * avgPerDie + bonus;
}

/**
 * Build a dice formula string from components
 */
export function buildDiceFormula(count: number, size: DiceSize, bonus: number): string {
   const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
   return `${count}d${size}${bonusStr}`;
}

// ============================================================================
// Strike Computation Functions
// ============================================================================

export interface ComputedStrikeStats {
   attackBonus: number;
   damage: string;
   damageAverage: number;
   persistentDamage?: string;
   persistentAverage?: number;
   combinedDamageAverage: number;  // Direct + persistent (flat sum for benchmark comparison)
   effectiveDamageAverage: number; // Direct + persistent * expected rounds
}

/**
 * Compute stats for a strike based on benchmarks
 */
export function computeStrikeStats(
   level: number,
   strike: CreatureStrike
): ComputedStrikeStats {
   // Compute values from benchmarks, including persistent damage
   const computed = calculateStrikeStats(
      level,
      strike.attackBenchmark,
      strike.damageBenchmark,
      strike.customDamageFormula,
      strike.persistentBenchmark,
      strike.customPersistentFormula
   );

   // Combined damage: direct + persistent (flat sum, for benchmark comparison)
   const combinedDamageAverage = computed.damageAverage + (computed.persistentAverage ?? 0);

   return {
      attackBonus: computed.attackBonus,
      damage: computed.damage,
      damageAverage: computed.damageAverage,
      persistentDamage: computed.persistentDamage,
      persistentAverage: computed.persistentAverage,
      combinedDamageAverage,
      effectiveDamageAverage: computed.effectiveDamageAverage
   };
}

/**
 * Format the damage average display string for a strike.
 * Shows combined format when persistent damage exists: "13+3.5 = 16.5 avg"
 * Otherwise shows simple format: "13 avg"
 */
export function formatDamageAverageDisplay(
   damageAverage: number,
   persistentAverage?: number
): string {
   if (persistentAverage) {
      const combined = damageAverage + persistentAverage;
      return `${damageAverage}+${persistentAverage} = ${combined} avg`;
   }
   return `${damageAverage} avg`;
}

export type DamageBenchmarkLabel = 'low' | 'moderate' | 'high' | 'extreme';

export interface StrikeDamageBenchmarkInfo {
   baseLabel: DamageBenchmarkLabel;      // Benchmark based on direct damage only
   effectiveLabel: DamageBenchmarkLabel; // Benchmark based on combined (direct + persistent)
   isExact: boolean;                     // Whether direct damage exactly matches benchmark
   isUpgraded: boolean;                  // Whether persistent pushes to a higher tier
}

/** Benchmark tier order for comparison */
const BENCHMARK_ORDER: DamageBenchmarkLabel[] = ['low', 'moderate', 'high', 'extreme'];

/**
 * Get the damage benchmark info for a strike.
 * Returns both base (direct only) and effective (combined) benchmarks.
 */
export function getStrikeDamageBenchmarkInfo(
   level: number,
   strike: CreatureStrike,
   editingDiceAvg?: number
): StrikeDamageBenchmarkInfo | null {
   const ranges = getStatRangesForLevel(level);

   // Get the direct damage average (from editing if provided, otherwise computed)
   const directAvg = editingDiceAvg ?? calculateStrikeStats(
      level,
      strike.attackBenchmark,
      strike.damageBenchmark
   ).damageAverage;

   // Helper: convert damage average to scalar (0-1) based on range
   const damageToScalar = (avg: number, range: StrikeDamageRange4): number => {
      const min = range.low.average;
      const max = range.extreme.average;
      return Math.max(0, Math.min(1, (avg - min) / (max - min)));
   };

   // Calculate base benchmark (direct damage only)
   const baseScalar = damageToScalar(directAvg, ranges.strikeDamage);
   const baseLabel = getStrikeDamageBenchmarkLabel(baseScalar);

   // Include persistent damage for effective benchmark
   const persistentAvg = strike.customPersistentFormula
      ? parseDiceFormulaAverage(strike.customPersistentFormula)
      : 0;
   const combinedAvg = directAvg + persistentAvg;
   const effectiveScalar = damageToScalar(combinedAvg, ranges.strikeDamage);
   const effectiveLabel = getStrikeDamageBenchmarkLabel(effectiveScalar);

   // Check if it's an exact benchmark match (based on direct damage only)
   const entry = getStrikeDamageForScalar(strike.damageBenchmark, ranges.strikeDamage);
   const isExact = Math.abs(directAvg - entry.average) < 0.01;

   // Check if persistent damage upgrades the benchmark tier
   const baseIndex = BENCHMARK_ORDER.indexOf(baseLabel);
   const effectiveIndex = BENCHMARK_ORDER.indexOf(effectiveLabel);
   const isUpgraded = effectiveIndex > baseIndex;

   return { baseLabel, effectiveLabel, isExact, isUpgraded };
}

/**
 * Get the average damage values for each strike damage benchmark at a given level.
 * Returns an object with low/moderate/high/extreme averages.
 */
export function getStrikeDamageBenchmarkAverages(level: number): Record<DamageBenchmarkLabel, number> {
   const ranges = getStatRangesForLevel(level);
   return {
      low: ranges.strikeDamage.low.average,
      moderate: ranges.strikeDamage.moderate.average,
      high: ranges.strikeDamage.high.average,
      extreme: ranges.strikeDamage.extreme.average
   };
}

// ============================================================================
// Persistent Damage Functions
// ============================================================================

export type PersistentBenchmarkLabel = 'low' | 'moderate' | 'high';

/**
 * Get the persistent damage formula and average for each benchmark at a given level.
 */
export function getPersistentDamageBenchmarkInfo(level: number): Record<PersistentBenchmarkLabel, { formula: string; average: number }> {
   const range = getPersistentDamageForLevel(level);
   return {
      low: { formula: range.low, average: parseDiceFormulaAverage(range.low) },
      moderate: { formula: range.moderate, average: parseDiceFormulaAverage(range.moderate) },
      high: { formula: range.high, average: parseDiceFormulaAverage(range.high) }
   };
}

/**
 * Get just the averages for persistent damage benchmarks at a given level.
 */
export function getPersistentDamageBenchmarkAverages(level: number): Record<PersistentBenchmarkLabel, number> {
   const info = getPersistentDamageBenchmarkInfo(level);
   return {
      low: info.low.average,
      moderate: info.moderate.average,
      high: info.high.average
   };
}

/**
 * Convert a persistent damage average to a benchmark scalar (0-1).
 * Uses 3-benchmark system: 0 = low, 0.5 = moderate, 1 = high
 */
export function persistentDamageToScalar(avgDamage: number, level: number): number {
   const info = getPersistentDamageBenchmarkInfo(level);
   const lowAvg = info.low.average;
   const modAvg = info.moderate.average;
   const highAvg = info.high.average;

   if (avgDamage <= lowAvg) return 0;
   if (avgDamage >= highAvg) return 1;

   if (avgDamage <= modAvg) {
      // Between low and moderate
      const t = (avgDamage - lowAvg) / (modAvg - lowAvg);
      return t * 0.5;
   } else {
      // Between moderate and high
      const t = (avgDamage - modAvg) / (highAvg - modAvg);
      return 0.5 + t * 0.5;
   }
}

/**
 * Get the persistent damage formula for a benchmark scalar at a given level.
 */
export function getPersistentDamageForScalar(scalar: number, level: number): string {
   const range = getPersistentDamageForLevel(level);
   if (scalar < 0.33) return range.low;
   if (scalar < 0.67) return range.moderate;
   return range.high;
}

/**
 * Get the benchmark label for a persistent damage scalar.
 */
export function getPersistentBenchmarkLabel(scalar: number): PersistentBenchmarkLabel {
   if (scalar < 0.33) return 'low';
   if (scalar < 0.67) return 'moderate';
   return 'high';
}

/**
 * Get the default benchmark value for each persistent damage tier.
 */
export const PERSISTENT_BENCHMARK_VALUES = {
   low: 0,
   moderate: 0.5,
   high: 1
} as const;

/**
 * Convert a persistent damage formula string to a benchmark scalar.
 * Parses the formula, calculates the average, and converts to scalar.
 */
export function persistentFormulaToScalar(formula: string, level: number): number {
   const avg = parseDiceFormulaAverage(formula);
   if (avg <= 0) return PERSISTENT_BENCHMARK_VALUES.moderate; // Default if invalid
   return persistentDamageToScalar(avg, level);
}

/**
 * Get the default damage formula entry for a strike's benchmark
 */
export function getStrikeDefaultDamageEntry(
   level: number,
   damageBenchmark: number
): { formula: string; average: number } {
   const ranges = getStatRangesForLevel(level);
   return getStrikeDamageForScalar(damageBenchmark, ranges.strikeDamage);
}

// ============================================================================
// Stat Range Functions
// ============================================================================

export type StatType = 'ability' | 'perception' | 'ac' | 'hp' | 'save' | 'strikeAttack' | 'skill' | 'strikeDamage';

/**
 * Get the stat range for a given stat type at a level
 */
export function getStatRangeForType(level: number, statType: StatType): StatRange {
   const ranges = getStatRangesForLevel(level);
   switch (statType) {
      case 'ability': return ranges.abilityMod as unknown as StatRange;
      case 'perception': return ranges.perception;
      case 'ac': return ranges.ac as unknown as StatRange;
      case 'hp': return ranges.hp as unknown as StatRange;
      case 'save': return ranges.saves;
      case 'strikeAttack': return ranges.strikeAttack as unknown as StatRange;
      case 'skill': return ranges.skills as unknown as StatRange;
      case 'strikeDamage': return ranges.strikeDamage as unknown as StatRange;
      default: return ranges.abilityMod as unknown as StatRange;
   }
}

// ============================================================================
// Spell Progression Helpers
// ============================================================================

/** Display labels for spell progression types */
export const SPELL_PROGRESSION_LABELS: Record<SpellProgressionType, string> = {
   fullPrepared: 'Full Prepared',
   fullSpontaneous: 'Full Spontaneous',
   bounded: 'Bounded',
   innate: 'Innate',
   none: 'None'
};

/** Options for spell progression dropdown */
export const SPELL_PROGRESSION_OPTIONS: { value: SpellProgressionType; label: string }[] = [
   { value: 'fullPrepared', label: 'Full Prepared' },
   { value: 'fullSpontaneous', label: 'Full Spontaneous' },
   { value: 'bounded', label: 'Bounded' },
   { value: 'innate', label: 'Innate' }
];

/** Display labels for spell traditions */
export const SPELL_TRADITION_LABELS: Record<string, string> = {
   arcane: 'Arcane',
   divine: 'Divine',
   occult: 'Occult',
   primal: 'Primal'
};

/** Options for divine font dropdown */
export const SPELL_FONT_OPTIONS: { value: SpellFont | ''; label: string }[] = [
   { value: '', label: 'None' },
   { value: 'harm', label: 'Harm Font' },
   { value: 'heal', label: 'Heal Font' }
];

/**
 * Format a spell slot layout as a compact summary string.
 * Example: "Ranks 1-4: 3/3/3/2" or "Rank 1: 2"
 */
export function formatSpellSlotSummary(slots: SpellSlotLayout): string {
   const ranks = Object.keys(slots)
      .map(Number)
      .filter(r => r > 0 && slots[r] > 0)
      .sort((a, b) => a - b);

   if (ranks.length === 0) return '';

   const slotCounts = ranks.map(r => slots[r]);
   const rankLabel = ranks.length === 1
      ? `Rank ${ranks[0]}`
      : `Ranks ${ranks[0]}-${ranks[ranks.length - 1]}`;

   return `${rankLabel}: ${slotCounts.join('/')} slots`;
}
