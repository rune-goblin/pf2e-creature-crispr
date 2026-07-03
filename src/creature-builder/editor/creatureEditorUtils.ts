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
   PERSISTENT_EXPECTED_ROUNDS,
   type StatRange,
   type StrikeDamageRange4
} from '@/creature-builder/logic/creatureStatTables';
import {
   BENCHMARK_VALUES,
   getNearestBenchmarkLabel4,
   type BenchmarkLabel,
   type BenchmarkLabel4,
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

/** Maximum roll of a dice formula ("1d4" → 4, "2d6+3" → 15, flat "6" → 6); 0 when empty/invalid. */
export function parseDiceFormulaMax(formula: string): number {
   const normalized = formula.replace(/\s+/g, '');
   const match = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/);
   if (match) {
      const count = parseInt(match[1], 10);
      const size = parseInt(match[2], 10);
      const bonus = match[3] ? parseInt(match[3], 10) : 0;
      return count * size + bonus;
   }
   if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);
   return 0;
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

/**
 * Persistent rider "enabled" sentinel. The rider's actual dice live in `customPersistentFormula`
 * (the source of truth); `persistentBenchmark` only records that the rider is on, so any defined
 * scalar works. Kept at moderate for historical continuity with the persisted item flag.
 */
export const PERSISTENT_BENCHMARK_VALUES = {
   moderate: 0.5
} as const;

/**
 * Seed a starting persistent-damage formula when the rider is first enabled. PF2e has no
 * persistent-by-level table, so we target the next Strike Damage tier above the strike's current
 * direct damage and express the per-round average it implies (direct + persistent ×
 * PERSISTENT_EXPECTED_ROUNDS = tier) as a plain NdX — persistent riders are conventionally
 * bonus-free dice. Only a suggestion; the user pushes past it freely.
 */
export function suggestPersistentFormula(level: number, directAverage = 0): string {
   const sd = getStatRangesForLevel(level).strikeDamage;
   const tierAverages = [sd.low.average, sd.moderate.average, sd.high.average, sd.extreme.average];
   const target = tierAverages.find((a) => a > directAverage) ?? sd.extreme.average;
   const perRound = Math.max(2.5, (target - directAverage) / PERSISTENT_EXPECTED_ROUNDS);
   return diceForAverage(perRound);
}

/** Nearest plain NdX (no flat bonus) whose average is closest to the target. */
function diceForAverage(targetAverage: number): string {
   let best = '1d4';
   let bestDiff = Infinity;
   for (const die of DICE_SIZES) {
      const count = Math.max(1, Math.round(targetAverage / ((die + 1) / 2)));
      const avg = (count * (die + 1)) / 2;
      const diff = Math.abs(avg - targetAverage);
      if (diff < bestDiff) {
         bestDiff = diff;
         best = `${count}d${die}`;
      }
   }
   return best;
}

// ============================================================================
// Effective-Damage Guidance Bar
// ============================================================================

export type DamageBarTone = 'below' | BenchmarkLabel4;

export interface BenchmarkBarMarker {
   label: string;
   value: number;
   position: number; // 0..1 along the track
}

export interface BenchmarkBarRow {
   markers: BenchmarkBarMarker[];
   basePosition: number;      // arrow — the base (direct) attack damage
   effectivePosition: number; // end-cap — base + the persistent rider's max roll
   midPosition: number;       // dot — base + the persistent rider's average addition
   hasPersistent: boolean;    // whether the persistent span (line/cap) is drawn
   showDot: boolean;          // whether to draw the average dot (false for flat values: avg == max)
   verdict: string;           // where the dot lands ("HIGH", "above Extreme", …)
   tone: DamageBarTone;
   // Value label(s) pinned to an edge the graph had to extend past the tiers (empty in range).
   overflowMarkers: { value: number; side: 'start' | 'end' }[];
}

/**
 * Map a damage value onto a "tier unit" axis: low=0, moderate=1, high=2, extreme=3, interpolating
 * linearly between tiers. Below low / above extreme it extrapolates past the ends at the adjacent
 * tier segment's value-density, so an out-of-range value gets a unit < 0 or > 3 instead of clamping.
 */
function damageToTierUnit(value: number, tiers: [number, number, number, number]): number {
   const [low, mod, high, extreme] = tiers;
   if (value <= low) return (mod - low) > 0 ? (value - low) / (mod - low) : 0;
   if (value <= mod) return (value - low) / (mod - low);
   if (value <= high) return 1 + (value - mod) / (high - mod);
   if (value <= extreme) return 2 + (value - high) / (extreme - high);
   return (extreme - high) > 0 ? 3 + (value - extreme) / (extreme - high) : 3;
}

/**
 * Build the guidance-bar row for a strike. The arrow marks the base (direct) attack. A persistent
 * rider adds its own range on top of the base: a line runs from the arrow out to base + the rider's
 * max roll (e.g. 1d4 → +4), with a dot at base + the rider's *average* addition and an end-cap at
 * the max. A flat value (e.g. "6") has average = max, so its dot lands on the cap. The verdict/tone
 * reflect the dot — where the persistent typically pushes the base.
 *
 * The track is laid out on a tier-unit axis (low=0…extreme=3) and normalized over the full visible
 * range, so when a value falls outside low→extreme the whole graph rescales to show it — keeping
 * ticks at the four tier breakpoints. In-range, the tiers sit at the usual even thirds.
 * Informational only; the engine never trims to it. `persistentFormula` is the rider's dice/flat
 * formula ("" = no rider).
 */
export function getStrikeEffectiveDamageBar(
   level: number,
   directAverage: number,
   persistentFormula = ''
): BenchmarkBarRow {
   const sd = getStatRangesForLevel(level).strikeDamage;
   const tiers: [number, number, number, number] = [
      sd.low.average, sd.moderate.average, sd.high.average, sd.extreme.average
   ];

   const persistentAverage = parseDiceFormulaAverage(persistentFormula);
   const persistentMax = parseDiceFormulaMax(persistentFormula);

   const baseUnit = damageToTierUnit(directAverage, tiers);
   const midUnit = damageToTierUnit(directAverage + persistentAverage, tiers);
   const capUnit = damageToTierUnit(directAverage + persistentMax, tiers);

   // Visible domain always spans at least the four tiers (0..3), widening to include any overflow.
   const uMin = Math.min(0, baseUnit, midUnit, capUnit);
   const uMax = Math.max(3, baseUnit, midUnit, capUnit);
   const norm = (u: number) => (u - uMin) / (uMax - uMin);

   const markers: BenchmarkBarMarker[] = [
      { label: 'Low', value: sd.low.average, position: norm(0) },
      { label: 'Mod', value: sd.moderate.average, position: norm(1) },
      { label: 'High', value: sd.high.average, position: norm(2) },
      { label: 'Extreme', value: sd.extreme.average, position: norm(3) }
   ];

   const label = getNearestBenchmarkLabel4(Math.max(0, Math.min(3, midUnit)) / 3);
   const verdict = midUnit > 3 ? 'above Extreme' : midUnit < 0 ? 'below Low' : label.toUpperCase();
   const tone: DamageBarTone = midUnit < 0 ? 'below' : label;

   // Label the extended edge(s) with the value that pushed past the tiers: the cap on the right,
   // the base on the left (cap ≥ dot ≥ base, so those are the extremes).
   const overflowMarkers: { value: number; side: 'start' | 'end' }[] = [];
   if (capUnit > 3) overflowMarkers.push({ value: Math.round(directAverage + persistentMax), side: 'end' });
   if (baseUnit < 0) overflowMarkers.push({ value: Math.round(directAverage), side: 'start' });

   return {
      markers,
      basePosition: norm(baseUnit),
      effectivePosition: norm(capUnit),
      midPosition: norm(midUnit),
      hasPersistent: persistentMax > 0,
      // A flat value adds the same amount every time (avg == max), so there is no average to mark.
      showDot: persistentMax > 0 && persistentAverage < persistentMax,
      verdict,
      tone,
      overflowMarkers
   };
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
