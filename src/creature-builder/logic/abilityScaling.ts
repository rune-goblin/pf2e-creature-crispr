/**
 * Ability Scaling Service
 *
 * Parses special ability descriptions to find damage formulas and DCs,
 * then scales them appropriately when creature level changes.
 *
 * Uses the official PF2e Spell DC/Attack table (3-benchmark: Moderate, High, Extreme)
 */

import type { SpecialAbility, ScalableValue } from './models';
import {
  getStatRangesForLevel,
  scaleStrikeDamage
} from './creatureStatTables';
import { troopLineFactor, TROOP_DAMAGE_TIER, type TroopAttackLine } from './troopBenchmarks';

// ============================================================================
// ABILITY DC AND SPELL ATTACK TABLES
// From PF2e Building Creatures rules - 3 benchmark system
// ============================================================================

interface AbilityDCRange {
  moderate: number;
  high: number;
  extreme: number;
}

interface SpellAttackRange {
  moderate: number;
  high: number;
  extreme: number;
}

type CreatureLevel = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;

const ABILITY_DC_TABLE: Record<CreatureLevel, AbilityDCRange> = {
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

const SPELL_ATTACK_TABLE: Record<CreatureLevel, SpellAttackRange> = {
  [-1]: { moderate: 5, high: 8, extreme: 11 },
  [0]:  { moderate: 5, high: 8, extreme: 11 },
  [1]:  { moderate: 6, high: 9, extreme: 12 },
  [2]:  { moderate: 7, high: 10, extreme: 14 },
  [3]:  { moderate: 9, high: 12, extreme: 15 },
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
// PERSISTENT DAMAGE TABLE
// Persistent damage scales more slowly than strike damage.
// Values are dice formulas for low/moderate/high benchmarks.
// Based on analysis of PF2e monsters across levels.
// ============================================================================

interface PersistentDamageRange {
  low: string;      // Low persistent damage
  moderate: string; // Moderate persistent damage
  high: string;     // High persistent damage
}

const PERSISTENT_DAMAGE_TABLE: Record<CreatureLevel, PersistentDamageRange> = {
  [-1]: { low: '1d4', moderate: '1d4', high: '1d6' },
  [0]:  { low: '1d4', moderate: '1d4', high: '1d6' },
  [1]:  { low: '1d4', moderate: '1d6', high: '1d6' },
  [2]:  { low: '1d4', moderate: '1d6', high: '1d8' },
  [3]:  { low: '1d6', moderate: '1d6', high: '2d4' },
  [4]:  { low: '1d6', moderate: '1d8', high: '2d6' },
  [5]:  { low: '1d6', moderate: '1d8', high: '2d6' },
  [6]:  { low: '1d6', moderate: '2d4', high: '2d6' },
  [7]:  { low: '1d6', moderate: '2d6', high: '2d8' },
  [8]:  { low: '1d8', moderate: '2d6', high: '2d8' },
  [9]:  { low: '1d8', moderate: '2d6', high: '3d6' },
  [10]: { low: '2d4', moderate: '2d6', high: '3d6' },
  [11]: { low: '2d6', moderate: '2d8', high: '3d6' },
  [12]: { low: '2d6', moderate: '2d8', high: '3d8' },
  [13]: { low: '2d6', moderate: '3d6', high: '3d8' },
  [14]: { low: '2d6', moderate: '3d6', high: '4d6' },
  [15]: { low: '2d8', moderate: '3d6', high: '4d6' },
  [16]: { low: '2d8', moderate: '3d8', high: '4d6' },
  [17]: { low: '3d6', moderate: '3d8', high: '4d8' },
  [18]: { low: '3d6', moderate: '4d6', high: '4d8' },
  [19]: { low: '3d6', moderate: '4d6', high: '5d6' },
  [20]: { low: '3d8', moderate: '4d6', high: '5d6' },
  [21]: { low: '3d8', moderate: '4d8', high: '5d8' },
  [22]: { low: '4d6', moderate: '4d8', high: '5d8' },
  [23]: { low: '4d6', moderate: '5d6', high: '6d6' },
  [24]: { low: '4d8', moderate: '5d6', high: '6d6' }
};

// ============================================================================
// FAST HEALING / REGENERATION MODERATE LINES
// PF2e publishes no benchmark table for either ability, so both moderate lines
// are fitted to the published bestiary corpus (docs/regeneration-analysis.html):
//   - fast healing:  0.82 + 0.82×level — the corpus linear trend, adopted exactly
//   - regeneration:  7 → 34 across levels 0–25 (7 + 1.08×level) — regeneration
//     runs a full band above fast healing on a large flat base; the two are
//     different populations and must not share a curve.
// Low/high bracket the observed spread. 3-benchmark system (low/moderate/high).
// ============================================================================

export type HealingKind = 'fast-healing' | 'regeneration';

interface FastHealingRange {
  low: number;
  moderate: number;
  high: number;
}

// Highest regeneration ever printed (Treerazer, L25); nothing scaled should exceed it.
const REGEN_MAX = 50;

function healingModerateAt(level: number, kind: HealingKind): number {
  const L = Math.max(-1, Math.min(25, level));
  return kind === 'regeneration' ? 7 + 1.08 * L : 0.82 + 0.82 * L;
}

/** Printed regeneration ≥ 10 is (near-)always a multiple of 5 and never exceeds REGEN_MAX. */
function snapHealingValue(value: number, kind: HealingKind): number {
  if (kind === 'regeneration') {
    const v = Math.min(REGEN_MAX, value);
    if (v >= 10) return Math.round(v / 5) * 5;
    return Math.max(1, Math.round(v));
  }
  return Math.max(1, Math.round(value));
}

function getFastHealingRange(level: number, kind: HealingKind = 'fast-healing'): FastHealingRange {
  const mod = healingModerateAt(level, kind);
  const moderate = Math.max(1, Math.round(mod));
  const low = Math.max(1, Math.round(0.6 * mod));
  const high = Math.max(moderate + 1, Math.round((kind === 'regeneration' ? 1.6 : 1.5) * mod));
  return { low, moderate, high: kind === 'regeneration' ? Math.min(REGEN_MAX, high) : high };
}

// ============================================================================
// BENCHMARK VALUES FOR 3-BENCHMARK SYSTEM
// ============================================================================

/** Scalar values for 3-benchmark system (moderate=0, high=0.5, extreme=1) */
export const ABILITY_BENCHMARK_VALUES = {
  moderate: 0,
  high: 0.5,
  extreme: 1
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAbilityDCRange(level: number): AbilityDCRange {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;
  return ABILITY_DC_TABLE[clampedLevel];
}

function getSpellAttackRange(level: number): SpellAttackRange {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;
  return SPELL_ATTACK_TABLE[clampedLevel];
}

function getPersistentDamageRange(level: number): PersistentDamageRange {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;
  return PERSISTENT_DAMAGE_TABLE[clampedLevel];
}

/**
 * Interpolate a value in a 3-benchmark range
 * scalar: 0 = moderate, 0.5 = high, 1 = extreme
 */
function interpolateAbilityValue(scalar: number, range: AbilityDCRange | SpellAttackRange): number {
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
 * Convert a value to a scalar in a 3-benchmark range
 * Returns: 0 = moderate, 0.5 = high, 1 = extreme
 */
function valueToAbilityScalar(value: number, range: AbilityDCRange | SpellAttackRange): number {
  if (value <= range.moderate) return 0;
  if (value >= range.extreme) return 1;

  if (value <= range.high) {
    // Between moderate and high
    const t = (value - range.moderate) / (range.high - range.moderate);
    return t * 0.5;
  } else {
    // Between high and extreme
    const t = (value - range.high) / (range.extreme - range.high);
    return 0.5 + t * 0.5;
  }
}

/**
 * Get the benchmark label for a scalar value
 */
export function getAbilityBenchmarkLabel(scalar: number): 'moderate' | 'high' | 'extreme' {
  if (scalar < 0.25) return 'moderate';
  if (scalar < 0.75) return 'high';
  return 'extreme';
}

// ============================================================================
// DAMAGE TYPES (PF2e Remaster)
// ============================================================================

const DAMAGE_TYPES = [
  // Physical
  'bludgeoning', 'piercing', 'slashing', 'bleed',
  // Energy
  'acid', 'cold', 'electricity', 'fire', 'force', 'sonic', 'vitality', 'void',
  // Other
  'mental', 'poison', 'spirit', 'untyped'
];

// ============================================================================
// REGEX PATTERNS
// ============================================================================

// Matches dice formulas like "2d6", "1d8+4", "3d10-2", "2d6+5 fire"
const DICE_FORMULA_PATTERN = /(\d+d\d+(?:[+-]\d+)?)\s*(?:points?\s+of\s+)?(\w+)?\s*damage/gi;

// Matches persistent damage like "1d6 persistent fire damage", "2d6 persistent poison"
const PERSISTENT_DAMAGE_PATTERN = /(\d+d\d+(?:[+-]\d+)?)\s+persistent\s+(\w+)(?:\s+damage)?/gi;

// Matches DC values like "DC 25", "DC 22 Fortitude", "basic Reflex DC 20"
const DC_PATTERN = /(?:DC\s*(\d+)|(\d+)\s*DC)\s*(?:basic\s+)?(?:Fortitude|Reflex|Will)?/gi;

// A plain "DC N" starting within this many chars of an @Check macro is the same DC already
// captured by the @Check pass — skip it to avoid a duplicate scalable value.
const CHECK_DEDUP_WINDOW = 50;

// Matches a whole @Check[...] macro; the inner segments are parsed by hand (the DC may be in any
// position and the check type may be a save, skill, or hyphenated/spaced lore — parsed inline in parseAbilityDescription).
const AT_CHECK_MACRO = /@Check\[([^\]]+)\]/gi;

// Matches a whole @Damage[...] macro, tolerating one level of bracket nesting (the [type] / [splash]
// / [precision] sub-brackets). The PF2e @Damage grammar is recursive — parenthesised sums, nested
// precision/splash, comma-separated multi-instance, |options flags, @actor.level expressions — so we
// capture the whole macro and tokenise it in extractDamageInstance rather than match a fixed shape.
const AT_DAMAGE_MACRO = /@Damage\[(?:[^\[\]]|\[[^\]]*\])*\]/gi;

// A whole @Template[...] macro. Group 1 is the inner segment list (type:burst|distance:10).
const AT_TEMPLATE_MACRO = /@Template\[([^\]]+)\]/gi;

// An area effect's delivery range, e.g. "within 50 feet". Only read on descriptions that already
// carry an area @Template — elsewhere "within N feet" is usually a trigger condition, not a number
// the author is choosing.
const AREA_RANGE_PATTERN = /within\s+(\d+)\s*(?:-|\s)?f(?:ee|oo)t/gi;

// Published troop attacks in the two grammars the sweep/volley generators emit.
// Sweep: a "1 to N" glyph header (N = 3, or 2 for slowed troops like shamblers), then one
// glyph-numbered damage line per action count.
const SWEEP_HEADER = /<span class="action-glyph">1<\/span>\s*to\s*<span class="action-glyph">([23])<\/span>/i;
const SWEEP_GLYPH = /<span class="action-glyph">([123])<\/span>/gi;
// Volley: the burst shrinks at the troop's segment threshold. Detected structurally — two burst
// @Templates with the later one smaller — because the prose varies ("reduced to 2 segments",
// "2 or fewer segments", "8 or fewer squares") and regexing English missed 8 of 13 shipped salvos.
const SALVO_BURST = /@Template\[[^\]]*burst[^\]]*\]/gi;
// The threshold phrase, used only to label the shrunken burst's distance row.
const SALVO_MARKER = /reduced to \d+(?: or fewer)? (?:segments?|squares?)/i;

/**
 * Resolve which troop attack line a damage macro at `index` belongs to, so its benchmark ladder can
 * be scaled to that line's share of a round. Returns undefined for everything that isn't one of the
 * two published troop attack grammars — the match is deliberately narrow, since misreading a
 * dragon's breath weapon as a salvo would rescale its whole ladder.
 */
interface ResolvedTroopLine {
  line: TroopAttackLine;
  /** For sweep lines: the glyph's actual action count (display-only; differs on "1 to 2" sweeps). */
  actions?: 1 | 2 | 3;
}

/**
 * How much of the strike-damage ladder one scalable value is judged against: its line's share of a
 * round, narrowed again by its own share of that line when the line splits across damage types.
 *
 * This is the single place the two factors combine. Every benchmark, classification and tier
 * recommendation for a troop-line value goes through it, so a term can never be scored against the
 * whole line's budget.
 */
export function troopLineScale(sv: Pick<ScalableValue, 'troopLine' | 'troopLineShare'>): number {
  return troopLineFactor(sv.troopLine) * (sv.troopLineShare ?? 1);
}

/**
 * Stamp one troop attack line across the plain-damage values that make it up, benchmarking the
 * line's TOTAL and giving each term its share of it. A single-term line gets no share (it is 1).
 */
function stampTroopLine(
  scalableValues: ScalableValue[],
  indexes: number[],
  resolved: ResolvedTroopLine,
  level: number
): void {
  if (!indexes.length) return;
  const averages = indexes.map((i) => parseDiceFormulaAverage(scalableValues[i].originalValue));
  const total = averages.reduce((sum, a) => sum + a, 0);
  if (total <= 0) return;

  indexes.forEach((i, n) => {
    const sv = scalableValues[i];
    sv.troopLine = resolved.line;
    if (resolved.actions !== undefined) sv.troopLineActions = resolved.actions;
    if (indexes.length > 1) sv.troopLineShare = averages[n] / total;
    sv.benchmark = damageToBenchmark(averages[n], level, troopLineScale(sv));
  });
}

function troopAttackLineResolver(description: string): (index: number) => ResolvedTroopLine | undefined {
  const header = SWEEP_HEADER.exec(description);
  if (header) {
    const topLine = Number(header[1]) as 2 | 3;
    // A "1 to 2" sweep is a slowed troop's whole round in two actions, and its published lines sit
    // one rung up the share-of-round ladder: Shambler Troop (L4) and Clockwork Shambler Horde (L9)
    // both put the 2-action line at ~1.1x the high strike column and the 1-action line at ~0.83x —
    // the 3-/2-action factors, not the 2-/1-action ones. Shift so the top glyph line is always the
    // full-round line; troopLine is a share-of-round position, not the glyph's action count.
    const shift = 3 - topLine;
    const marks: Array<{ index: number; mark: ResolvedTroopLine }> = [];
    const glyphs = new RegExp(SWEEP_GLYPH.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = glyphs.exec(description)) !== null) {
      if (m.index < header.index + header[0].length) continue; // the header's own two glyphs
      const glyph = Number(m[1]);
      if (glyph > topLine) continue;
      marks.push({
        index: m.index,
        mark: { line: (glyph + shift) as 1 | 2 | 3, actions: glyph as 1 | 2 | 3 }
      });
    }
    if (marks.length > 0) {
      return (index) => {
        let found: ResolvedTroopLine | undefined;
        for (const mark of marks) {
          if (mark.index < index) found = mark.mark;
        }
        return found;
      };
    }
  }
  // Salvo: at least two burst templates with the last strictly smaller than the first (the volley
  // that shrinks at the segment threshold). Still deliberately narrow — a breath weapon has one
  // burst, so nothing single-area can be misread as a salvo.
  const bursts = [...description.matchAll(new RegExp(SALVO_BURST.source, 'gi'))]
    .map((m2) => /distance:(\d+)/i.exec(m2[0]))
    .filter((d): d is RegExpExecArray => d !== null)
    .map((d) => Number(d[1]));
  if (bursts.length >= 2 && bursts[bursts.length - 1] < bursts[0]) return () => ({ line: 'salvo' });
  return () => undefined;
}

/** How a @Template's area type reads in the editable-values list. */
function templateDistanceLabel(templateType: string): string {
  const type = templateType.toLowerCase();
  if (type === 'cone' || type === 'line') return `${type[0].toUpperCase()}${type.slice(1)} length`;
  return `${type[0].toUpperCase()}${type.slice(1)} radius`;
}

// PF2e conditions that carry a numeric value (the only ones worth exposing/scaling).
const VALUED_CONDITIONS = new Set([
  'clumsy', 'doomed', 'drained', 'dying', 'enfeebled', 'frightened',
  'sickened', 'slowed', 'stunned', 'stupefied', 'wounded'
]);

// A condition link with a value in its label, e.g. @UUID[…conditionitems.Item.Drained]{Drained 2}.
// Groups: 1 = slug (Drained), 2 = label name, 3 = numeric value.
const VALUED_CONDITION_LINK = /@UUID\[[^\]]*conditionitems\.Item\.([A-Za-z]+)\]\{([^}]*?)\s+(\d+)\}/gi;

// A whole @UUID content link with its {label} (tolerating one nested {placeholder}). Used to keep a
// condition's value placeholder a plain value — wrapping it in the inline <span> would break the link.
const AT_UUID_LABEL = /@UUID\[[^\]]+\]\{(?:[^{}]|\{[^}]*\})*\}/gi;

// The three saves whose @Check DC is the creature's own ability DC (and so scales with level). Any
// other check type (medicine, athletics, a lore…) is a mundane skill DC — surfaced but left flat.
const DC_SAVES = new Set(['fortitude', 'reflex', 'will']);

// There's no PF2e benchmark for condition values; the level-appropriate *guidance* (shown, never
// applied) nudges by 1 roughly every this-many levels from the base — a coarse, honest hint.
const CONDITION_LEVELS_PER_STEP = 5;

// Official PF2e "Level-Based DCs" table — the standard DC for a task of a given level. The skill-DC
// guidance shifts the original by this table's level-to-level delta (a fixed medicine/athletics DC
// is a level-keyed task, not a creature save), so it tracks the table GMs recognise.
const DC_BY_LEVEL: Record<number, number> = {
  0: 14, 1: 15, 2: 16, 3: 18, 4: 19, 5: 20, 6: 22, 7: 23, 8: 24, 9: 26, 10: 27, 11: 28, 12: 30,
  13: 31, 14: 32, 15: 34, 16: 35, 17: 36, 18: 38, 19: 39, 20: 40, 21: 42, 22: 44, 23: 46, 24: 48
};
export function dcByLevel(level: number): number {
  const L = Math.round(level);
  if (L <= 0) return DC_BY_LEVEL[0];
  if (L >= 24) return DC_BY_LEVEL[24] + 2 * (L - 24); // extrapolate +2/level past the table
  return DC_BY_LEVEL[L];
}

/**
 * Whether a value's recommendation tracks creature level. False for conditions (no benchmark, and a
 * flat value is what GMs want — they're exposed purely so they're editable) and for mundane
 * skill-check DCs (a fixed medicine/athletics DC isn't the creature's DC). Those are surfaced with
 * their original value as the starting point and never auto-scaled.
 */
export function scalesWithLevel(sv: ScalableValue): boolean {
  if (sv.type === 'condition' || sv.type === 'distance') return false;
  if (sv.type === 'dc' && sv.checkType !== undefined && !DC_SAVES.has(sv.checkType)) return false;
  return true;
}

/**
 * The level-appropriate value a flat field *would* take if tied to level — shown as guidance beside
 * conditions and skill-check DCs (which stay flat). Conditions shift ±1 per CONDITION_LEVELS_PER_STEP
 * levels from base; a skill DC reports the Level-Based DCs table value for the level (the standard
 * task DC GMs recognise). For values that already scale this is just their recommendation.
 */
export function getLevelGuidance(sv: ScalableValue, level: number): string {
  if (sv.type === 'distance') return sv.originalValue;
  if (sv.type === 'condition') {
    const original = parseInt(sv.originalValue, 10) || 1;
    if (sv.baseLevel === undefined) return String(original);
    const step = Math.round((level - sv.baseLevel) / CONDITION_LEVELS_PER_STEP);
    return String(Math.max(1, original + step));
  }
  if (sv.type === 'dc' && !scalesWithLevel(sv)) return String(dcByLevel(level));
  return getScaledRecommendation(sv, level);
}

// Extracts the leading dice/flat formula of a single damage instance, but only when it's a *clean*
// value — a bare NdM[±B] or flat integer that ends at a `)`, `[`, `,`, `|`, or end. Compound sums
// like "(2d6 + 4 + (2d6[precision]))" deliberately fail (more expression follows), so we skip them
// instead of corrupting the macro. Surrounding parens and [type]/[splash]/[precision] brackets are
// matched outside the capture group so they're preserved when only group 1 is swapped for a placeholder.
const INSTANCE_FORMULA_PATTERN = /^\(?\s*(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*(?=$|\)|\[|,|\|)/;

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * Parse a dice formula and calculate its average damage
 * Handles formulas like "2d6+9", "2d6 + 9", "1d10 - 2"
 */
export function parseDiceFormulaAverage(formula: string): number {
  const components = parseDiceComponents(formula);
  if (!components) return 0;
  const avgPerDie = (components.die + 1) / 2;
  return components.count * avgPerDie + components.bonus;
}

/**
 * Parse a simple dice formula (e.g. "2d6+4", "1d10", "3d8-1") into its structural
 * components. Returns `null` if the formula isn't a simple `NdM[+B]` shape — e.g.
 * compound formulas like "1d6+1d4" or anything with multiple dice terms.
 *
 * Used by the ability editor's structured dice input to initialise its sub-fields.
 */
export function parseDiceComponents(
  formula: string
): { count: number; die: number; bonus: number } | null {
  const normalized = formula.replace(/\s+/g, '');
  const match = normalized.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  return {
    count: parseInt(match[1], 10),
    die: parseInt(match[2], 10),
    bonus: match[3] ? parseInt(match[3], 10) : 0
  };
}

/**
 * Build a dice formula string from structural components. Omits a `+0` suffix.
 * Count is clamped to ≥1, die to valid PF2e die faces, bonus passed through.
 */
export function formatDiceFormula(count: number, die: number, bonus: number): string {
  const safeCount = Math.max(1, Math.floor(count));
  const safeDie = Math.max(2, Math.floor(die));
  const base = `${safeCount}d${safeDie}`;
  if (bonus === 0) return base;
  return bonus > 0 ? `${base}+${bonus}` : `${base}${bonus}`;
}

/**
 * Determine the benchmark scalar for a damage value at a given level
 * Uses the 4-benchmark strike damage table, scaled by `factor` (a troop attack line's share of a
 * round — see troopLineFactor; 1 for everything else).
 */
export function damageToBenchmark(avgDamage: number, level: number, factor = 1): number {
  const ranges = getStatRangesForLevel(level);
  const dmgRange = ranges.strikeDamage;

  // Find the closest benchmark based on average damage
  const benchmarks = [
    { scalar: 0, avg: dmgRange.low.average * factor },
    { scalar: 1 / 3, avg: dmgRange.moderate.average * factor },
    { scalar: 2 / 3, avg: dmgRange.high.average * factor },
    { scalar: 1, avg: dmgRange.extreme.average * factor }
  ];

  let closest = benchmarks[0];
  let closestDiff = Math.abs(avgDamage - closest.avg);

  for (const bm of benchmarks) {
    const diff = Math.abs(avgDamage - bm.avg);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = bm;
    }
  }

  // If the value is between benchmarks, interpolate
  for (let i = 0; i < benchmarks.length - 1; i++) {
    const low = benchmarks[i];
    const high = benchmarks[i + 1];
    if (avgDamage >= low.avg && avgDamage <= high.avg) {
      const t = (avgDamage - low.avg) / (high.avg - low.avg);
      return low.scalar + t * (high.scalar - low.scalar);
    }
  }

  return closest.scalar;
}

/**
 * Determine the benchmark scalar for a DC value at a given level
 * Uses the 3-benchmark ability DC table (moderate=0, high=0.5, extreme=1)
 */
export function dcToBenchmark(dc: number, level: number): number {
  const range = getAbilityDCRange(level);
  return valueToAbilityScalar(dc, range);
}

/**
 * Determine the benchmark scalar for a spell attack bonus at a given level
 * Uses the 3-benchmark spell attack table (moderate=0, high=0.5, extreme=1)
 */
export function spellAttackToBenchmark(bonus: number, level: number): number {
  const range = getSpellAttackRange(level);
  return valueToAbilityScalar(bonus, range);
}

/**
 * Calculate scaled damage formula for a benchmark at a new level
 * Preserves relative damage position by interpolating the target average
 * and adjusting the closest benchmark formula if needed
 */
export function scaleDamage(benchmark: number, newLevel: number): string {
  const ranges = getStatRangesForLevel(newLevel);
  const entry = scaleStrikeDamage(benchmark, ranges.strikeDamage);
  return entry.formula;
}

/**
 * Calculate scaled DC for a benchmark at a new level
 */
export function scaleDC(benchmark: number, newLevel: number): number {
  const range = getAbilityDCRange(newLevel);
  return Math.round(interpolateAbilityValue(benchmark, range));
}

/**
 * Calculate scaled spell attack bonus for a benchmark at a new level
 */
export function scaleSpellAttack(benchmark: number, newLevel: number): number {
  const range = getSpellAttackRange(newLevel);
  return Math.round(interpolateAbilityValue(benchmark, range));
}

/**
 * Determine the benchmark scalar for persistent damage at a given level
 * Uses a 3-benchmark system (0 = low, 0.5 = moderate, 1 = high)
 */
export function persistentDamageToBenchmark(avgDamage: number, level: number): number {
  const range = getPersistentDamageRange(level);

  // Calculate averages for each benchmark
  const lowAvg = parseDiceFormulaAverage(range.low);
  const modAvg = parseDiceFormulaAverage(range.moderate);
  const highAvg = parseDiceFormulaAverage(range.high);

  // Find which benchmark we're closest to
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
 * Calculate scaled persistent damage formula for a benchmark at a new level
 */
export function scalePersistentDamage(benchmark: number, newLevel: number): string {
  const range = getPersistentDamageRange(newLevel);

  // Map scalar to benchmark: 0-0.33 = low, 0.33-0.67 = moderate, 0.67-1 = high
  if (benchmark < 0.33) return range.low;
  if (benchmark < 0.67) return range.moderate;
  return range.high;
}

/**
 * Get the benchmark label for persistent damage
 */
export function getPersistentBenchmarkLabel(scalar: number): 'low' | 'moderate' | 'high' {
  if (scalar < 0.33) return 'low';
  if (scalar < 0.67) return 'moderate';
  return 'high';
}

/**
 * Determine the benchmark scalar for a fast-healing / regeneration amount at a given level.
 * Uses a 3-benchmark system (0 = low, 0.5 = moderate, 1 = high).
 */
export function healingToBenchmark(amount: number, level: number, kind: HealingKind = 'fast-healing'): number {
  const range = getFastHealingRange(level, kind);
  if (amount <= range.low) return 0;
  if (amount >= range.high) return 1;
  if (amount <= range.moderate) {
    const t = (amount - range.low) / (range.moderate - range.low);
    return t * 0.5;
  }
  const t = (amount - range.moderate) / (range.high - range.moderate);
  return 0.5 + t * 0.5;
}

/**
 * Calculate the scaled fast-healing / regeneration amount for a benchmark at a new level.
 * Maps the scalar to the nearest tier (0-0.33 low, 0.33-0.67 moderate, 0.67-1 high).
 */
export function scaleHealing(benchmark: number, newLevel: number, kind: HealingKind = 'fast-healing'): number {
  const range = getFastHealingRange(newLevel, kind);
  const raw = benchmark < 0.33 ? range.low : benchmark < 0.67 ? range.moderate : range.high;
  return snapHealingValue(raw, kind);
}

/**
 * Benchmark tier values per scalable-value type.
 * Damage uses the 4-benchmark strike-damage table;
 * DC and persistent use 3-benchmark tables.
 */
const DAMAGE_TIERS: readonly number[] = [0, 1 / 3, 2 / 3, 1];
const DC_TIERS: readonly number[] = [0, 0.5, 1];
const PERSISTENT_TIERS: readonly number[] = [0, 0.5, 1];
const HEALING_TIERS: readonly number[] = [0, 0.5, 1];

function getTiersForType(type: ScalableValue['type']): readonly number[] {
  if (type === 'damage') return DAMAGE_TIERS;
  if (type === 'persistent') return PERSISTENT_TIERS;
  if (type === 'healing') return HEALING_TIERS;
  return DC_TIERS;
}

/**
 * Get the effective benchmark for a scalable value.
 * Returns the override if set, otherwise the original parsed benchmark.
 * Note: this does NOT account for customValue — use `getEffectiveValue` for display text.
 */
export function getEffectiveBenchmark(sv: ScalableValue): number {
  return sv.override ?? sv.benchmark;
}

// ============================================================================
// PROPORTIONAL SCALING HELPERS
// Preserve the original dice shape and scale to a target average that trends
// smoothly up or down with level, instead of snapping to discrete tier formulas.
// ============================================================================

export interface TierAverages {
  low: number;
  mod: number;
  high: number;
  extreme?: number;
}

/**
 * Tier averages for damage (4-tier strike-damage table). The `extreme` entry is populated.
 */
export function getDamageTierAveragesForLevel(level: number, factor = 1): TierAverages {
  const range = getStatRangesForLevel(level).strikeDamage;
  return {
    low: range.low.average * factor,
    mod: range.moderate.average * factor,
    high: range.high.average * factor,
    extreme: range.extreme.average * factor
  };
}

/**
 * Tier averages for persistent damage (3-tier table). No `extreme`.
 */
export function getPersistentTierAveragesForLevel(level: number): TierAverages {
  const row = getPersistentDamageRange(level);
  return {
    low: parseDiceFormulaAverage(row.low),
    mod: parseDiceFormulaAverage(row.moderate),
    high: parseDiceFormulaAverage(row.high)
  };
}

/**
 * Tier averages for fast healing / regeneration (3-tier table). No `extreme`.
 */
function getHealingTierAveragesForLevel(level: number, kind: HealingKind = 'fast-healing'): TierAverages {
  const row = getFastHealingRange(level, kind);
  return { low: row.low, mod: row.moderate, high: row.high };
}

function getTierAveragesForLevel(type: 'damage' | 'persistent' | 'healing', level: number): TierAverages {
  if (type === 'damage') return getDamageTierAveragesForLevel(level);
  if (type === 'healing') return getHealingTierAveragesForLevel(level);
  return getPersistentTierAveragesForLevel(level);
}

/**
 * Compute a level-to-level scale factor for the given value type, using the
 * moderate tier as the reference point (the "spine" of the PF2e progression curve).
 * Returns 1 when base and target are the same level.
 */
function computeLevelScaleFactor(type: 'damage' | 'persistent' | 'healing', baseLevel: number, targetLevel: number): number {
  if (baseLevel === targetLevel) return 1;
  const baseTiers = getTierAveragesForLevel(type, baseLevel);
  const targetTiers = getTierAveragesForLevel(type, targetLevel);
  if (baseTiers.mod <= 0) return 1;
  return targetTiers.mod / baseTiers.mod;
}

/**
 * Build a dice formula that approximates a given target average, preserving the
 * preferred die face. Chooses the smallest count whose residual fits in a modest
 * flat bonus, keeping formulas like `2d10+3` rather than `1d10+8`.
 *
 * Edge cases: very small targets may produce negative bonuses (e.g. `1d10-3`),
 * which are valid PF2e formulas though visually unusual.
 */
function buildFormulaForAverage(targetAvg: number, preferDie: number): string {
  const perDie = (preferDie + 1) / 2;
  const maxBonusPerStep = Math.max(1, Math.floor(perDie) - 1);

  let count = 1;
  while (targetAvg - count * perDie > maxBonusPerStep) {
    count++;
    if (count > 50) break; // safety
  }
  const bonus = Math.round(targetAvg - count * perDie);
  return formatDiceFormula(count, preferDie, bonus);
}

/**
 * Scale a scalable value proportionally to the target level, preserving the
 * original dice shape where possible.
 *
 * For damage and persistent damage:
 *   1. Parse the original formula into {count, die, bonus} components.
 *   2. Compute a level-to-level scale factor from tier-moderate averages.
 *   3. Multiply the original's average by that factor to get a target average.
 *   4. Rebuild a formula with the original die face + a count/bonus matching the target.
 *
 * For DC: `scaleDC` already interpolates proportionally.
 *
 * Falls back to the old tier-snap scalers when the original isn't a simple `NdM[+B]`
 * shape (e.g. compound formulas) or when baseLevel is missing.
 */
export function scaleProportionally(sv: ScalableValue, level: number): string {
  // Conditions and distances are surfaced for editing only — flat, never scaled. A burst radius or
  // range is an authoring choice, not a level-derived number: PF2e keeps published areas fixed as a
  // creature's damage grows.
  if (sv.type === 'condition' || sv.type === 'distance') return sv.originalValue;

  // Save DCs are the creature's own DC and scale; mundane skill-check DCs are surfaced but flat.
  if (sv.type === 'dc') {
    return scalesWithLevel(sv) ? String(scaleDC(sv.benchmark, level)) : sv.originalValue;
  }

  // Flat healing (fast-healing / regeneration rule amounts) scales ADDITIVELY along its
  // corpus moderate line — new = old + (mod(target) − mod(base)) — preserving a spike as an
  // offset, then snaps to the published grain. Ratio scaling is wrong here: regeneration's
  // ratio-to-level collapses as level grows (docs/regeneration-analysis.html), so multiplying
  // a spike like the troll's Regeneration 20 @ L5 explodes (×2.5 → 50 at L14, the corpus
  // all-time ceiling reserved for level-16+ apex creatures).
  if (sv.type === 'healing' && /^\s*\d+\s*$/.test(sv.originalValue) && sv.baseLevel !== undefined) {
    const kind = sv.healingKind ?? 'fast-healing';
    const delta = healingModerateAt(level, kind) - healingModerateAt(sv.baseLevel, kind);
    return String(snapHealingValue(parseInt(sv.originalValue, 10) + delta, kind));
  }

  // Other flat numeric values — flat damage like @Damage[7[piercing]] /
  // @Damage[5[persistent,acid]] — have no dice to reshape. Scale the integer by the
  // level-to-level factor and keep it flat.
  if (/^\s*\d+\s*$/.test(sv.originalValue) && sv.baseLevel !== undefined) {
    const original = parseInt(sv.originalValue, 10);
    const factor = computeLevelScaleFactor(sv.type === 'persistent' ? 'persistent' : 'damage', sv.baseLevel, level);
    return String(Math.max(1, Math.round(original * factor)));
  }

  const components = parseDiceComponents(sv.originalValue);
  if (!components || sv.baseLevel === undefined) {
    if (sv.type === 'damage') return scaleDamage(sv.benchmark, level);
    if (sv.type === 'healing') return String(scaleHealing(sv.benchmark, level, sv.healingKind));
    return scalePersistentDamage(sv.benchmark, level);
  }

  const originalAverage = components.count * ((components.die + 1) / 2) + components.bonus;
  const factor = computeLevelScaleFactor(sv.type, sv.baseLevel, level);
  const targetAverage = originalAverage * factor;

  // A clean NdM original (no flat modifier — area/spell-like damage, the way PF2e notates it) stays
  // clean: pick the closest whole dice count rather than emit an insignificant ±1 residual bonus.
  // Stepwise and slightly approximate by design. Strikes (which carry a real "+mod") keep the
  // flat-bonus fit below.
  if (components.bonus === 0) {
    const perDie = (components.die + 1) / 2;
    return formatDiceFormula(Math.max(1, Math.round(targetAverage / perDie)), components.die, 0);
  }

  return buildFormulaForAverage(targetAverage, components.die);
}

/**
 * Returns the closest tier label for a scalable value at a given level, plus
 * whether the current effective value matches that tier exactly.
 *
 * Returns `null` when the value can't be reliably classified — e.g. `customValue`
 * is set with an unparseable compound formula. When the value is proportionally
 * scaled (no override), the closest tier is returned with `exact: false`.
 */
/**
 * The tier label an on-benchmark troop attack line reads at. Derived from TROOP_DAMAGE_TIER through
 * the same scalar mapping every other tier label uses, so the two cannot drift apart.
 */
export const TROOP_TARGET_TIER: 'low' | 'moderate' | 'high' | 'extreme' =
  classifyByBenchmarkScalar('damage', TROOP_DAMAGE_TIER).label;

export function getTierInfo(
  sv: ScalableValue,
  level: number
): TierVerdict<'low' | 'moderate' | 'high' | 'extreme'> | null {
  if (sv.type === 'condition' || sv.type === 'distance') return null; // no benchmark tiers
  // For customValue we classify by matching the averaged effective value against tier averages.
  if (sv.customValue !== undefined && sv.customValue.length > 0) {
    if (sv.type === 'dc') {
      const dc = parseInt(sv.customValue, 10);
      if (Number.isNaN(dc)) return null;
      return classifyDcByValue(dc, level);
    }
    if (sv.type === 'healing') {
      const amount = parseInt(sv.customValue, 10);
      if (Number.isNaN(amount)) return null;
      return classifyHealingByValue(amount, level, sv.healingKind);
    }
    const components = parseDiceComponents(sv.customValue);
    if (!components) return null;
    const avg = components.count * ((components.die + 1) / 2) + components.bonus;
    return classifyDamageByAverage(sv.type, avg, level, troopLineScale(sv));
  }

  // Otherwise use the benchmark scalar (override or original). A scalar is clamped to the ladder by
  // construction, so this path can never be off-scale.
  const b = getEffectiveBenchmark(sv);
  return { ...classifyByBenchmarkScalar(sv.type, b), offScale: null };
}

function classifyByBenchmarkScalar(
  type: ScalableValue['type'],
  b: number
): { label: 'low' | 'moderate' | 'high' | 'extreme'; exact: boolean } {
  const epsilon = 1e-3;
  if (type === 'damage') {
    // 4 tiers: [0, 1/3, 2/3, 1]
    if (b < 1 / 6) return { label: 'low', exact: Math.abs(b) < epsilon };
    if (b < 3 / 6) return { label: 'moderate', exact: Math.abs(b - 1 / 3) < epsilon };
    if (b < 5 / 6) return { label: 'high', exact: Math.abs(b - 2 / 3) < epsilon };
    return { label: 'extreme', exact: Math.abs(b - 1) < epsilon };
  }
  if (type === 'persistent' || type === 'healing') {
    // 3 tiers: [0, 0.5, 1] → low/mod/high
    if (b < 0.25) return { label: 'low', exact: Math.abs(b) < epsilon };
    if (b < 0.75) return { label: 'moderate', exact: Math.abs(b - 0.5) < epsilon };
    return { label: 'high', exact: Math.abs(b - 1) < epsilon };
  }
  // DC: 3 tiers [0, 0.5, 1] → moderate/high/extreme
  if (b < 0.25) return { label: 'moderate', exact: Math.abs(b) < epsilon };
  if (b < 0.75) return { label: 'high', exact: Math.abs(b - 0.5) < epsilon };
  return { label: 'extreme', exact: Math.abs(b - 1) < epsilon };
}

/** A tier verdict: the nearest tier, whether the value sits exactly on it, and whether it fell off
 * either end of the ladder entirely. `offScale` is what a content audit keys on — a value below the
 * bottom tier or above the top one is not merely "low"/"extreme", it is off the published curve. */
export interface TierVerdict<L extends string> {
  label: L;
  exact: boolean;
  offScale: 'below' | 'above' | null;
}

/**
 * Nearest tier for `value` among ascending `entries`.
 *
 * A value only counts as off the ladder when it misses an end tier by more than half the spacing of
 * the tier beside it — a strict `< low` test would call most published content off-curve and bury
 * the real outliers.
 */
function nearestTier<L extends string>(
  value: number,
  entries: ReadonlyArray<{ label: L; avg: number }>
): TierVerdict<L> {
  let closest = entries[0];
  let closestDiff = Math.abs(value - closest.avg);
  for (const e of entries) {
    const d = Math.abs(value - e.avg);
    if (d < closestDiff) {
      closestDiff = d;
      closest = e;
    }
  }

  const first = entries[0];
  const last = entries[entries.length - 1];
  let offScale: 'below' | 'above' | null = null;
  if (entries.length > 1) {
    const lowGap = entries[1].avg - first.avg;
    const highGap = last.avg - entries[entries.length - 2].avg;
    if (value < first.avg - lowGap / 2) offScale = 'below';
    else if (value > last.avg + highGap / 2) offScale = 'above';
  }

  return { label: closest.label, exact: closestDiff < 0.5, offScale };
}

export function classifyDamageByAverage(
  type: 'damage' | 'persistent',
  avg: number,
  level: number,
  factor = 1
): TierVerdict<'low' | 'moderate' | 'high' | 'extreme'> {
  const tiers = type === 'damage'
    ? getDamageTierAveragesForLevel(level, factor)
    : getPersistentTierAveragesForLevel(level);
  const entries = type === 'damage'
    ? [
        { label: 'low' as const, avg: tiers.low },
        { label: 'moderate' as const, avg: tiers.mod },
        { label: 'high' as const, avg: tiers.high },
        { label: 'extreme' as const, avg: tiers.extreme! }
      ]
    : [
        { label: 'low' as const, avg: tiers.low },
        { label: 'moderate' as const, avg: tiers.mod },
        { label: 'high' as const, avg: tiers.high }
      ];
  return nearestTier(avg, entries);
}

export function classifyHealingByValue(
  amount: number,
  level: number,
  kind: HealingKind = 'fast-healing'
): TierVerdict<'low' | 'moderate' | 'high'> {
  const range = getFastHealingRange(level, kind);
  return nearestTier(amount, [
    { label: 'low' as const, avg: range.low },
    { label: 'moderate' as const, avg: range.moderate },
    { label: 'high' as const, avg: range.high }
  ]);
}

export function classifyDcByValue(
  dc: number,
  level: number
): TierVerdict<'moderate' | 'high' | 'extreme'> {
  const range = getAbilityDCRange(level);
  const entries: Array<{ label: 'moderate' | 'high' | 'extreme'; avg: number }> = [
    { label: 'moderate', avg: range.moderate },
    { label: 'high', avg: range.high },
    { label: 'extreme', avg: range.extreme }
  ];
  return nearestTier(dc, entries);
}

/**
 * The clean dice formula each benchmark tier maps to at `level`, in the value's own die face — so a
 * GM tuning a damage ability sees what Low / Moderate / High / Extreme looks like as clean NdM
 * rather than the strike table's mixed-dice formulas. Damage has 4 tiers, persistent 3; non-roll
 * types (DC / healing) return [].
 */
export function getRecommendedTierFormulas(
  sv: ScalableValue,
  level: number
): Array<{ label: 'low' | 'moderate' | 'high' | 'extreme'; formula: string }> {
  if (sv.type !== 'damage' && sv.type !== 'persistent') return [];
  const die = parseDiceComponents(sv.originalValue)?.die ?? 6;
  const perDie = (die + 1) / 2;
  const toFormula = (avg: number): string =>
    formatDiceFormula(Math.max(1, Math.round(avg / perDie)), die, 0);

  if (sv.type === 'damage') {
    const t = getDamageTierAveragesForLevel(level, troopLineScale(sv));
    // Every troop attack line keeps a flat bonus, sweep or salvo: one whole die is a wider step
    // than the gap between adjacent tier targets, so bare dice collapse neighbouring tiers onto
    // the same formula and nothing the GM picks can land on the curve — at L6 a d8 salvo has no
    // whole-dice count that reads high at all. Published volleys are mostly bare dice but not
    // exclusively (Hellknight Hunter Squad's 5d6+9, Skeleton Infantry's 2d6+10), so the bonus is
    // in-grammar. Never a negative bonus — published lines floor at bare dice.
    const isTroopLine = sv.troopLine !== undefined;
    const lineFormula = (avg: number): string => {
      if (!isTroopLine) return toFormula(avg);
      const parts = parseDiceComponents(buildFormulaForAverage(avg, die));
      if (!parts) return toFormula(avg);
      if (parts.bonus >= 0) return formatDiceFormula(parts.count, die, parts.bonus);
      // Drop a die rather than clamp the bonus to 0: clamping keeps the larger count and overshoots
      // by most of a die (L1 d4 wanted 3.8 and got 2d4=5 instead of 1d4+1=3.5). One die is the floor.
      const count = Math.max(1, parts.count - 1);
      return formatDiceFormula(count, die, Math.max(0, Math.round(avg - count * perDie)));
    };
    return [
      { label: 'low', formula: lineFormula(t.low) },
      { label: 'moderate', formula: lineFormula(t.mod) },
      { label: 'high', formula: lineFormula(t.high) },
      { label: 'extreme', formula: lineFormula(t.extreme ?? t.high) }
    ];
  }
  const t = getPersistentTierAveragesForLevel(level);
  return [
    { label: 'low', formula: toFormula(t.low) },
    { label: 'moderate', formula: toFormula(t.mod) },
    { label: 'high', formula: toFormula(t.high) }
  ];
}

/** The clean tier formula a benchmark scalar maps to, for a roll-type value. Null for DC/healing. */
function cleanTierFormula(sv: ScalableValue, level: number, scalar: number): string | null {
  const tiers = getRecommendedTierFormulas(sv, level);
  if (!tiers.length) return null;
  const { label } = classifyByBenchmarkScalar(sv.type, scalar);
  return (tiers.find(t => t.label === label) ?? tiers[0]).formula;
}

/**
 * The single tier recommendation that matches the value's currently-selected benchmark (the one the
 * BenchmarkButtons highlight) — what the editor shows on the "recommended" line. Null for DC/healing.
 */
export function getActiveTierFormula(
  sv: ScalableValue,
  level: number
): { label: 'low' | 'moderate' | 'high' | 'extreme'; formula: string } | null {
  const tiers = getRecommendedTierFormulas(sv, level);
  if (!tiers.length) return null;
  const { label } = classifyByBenchmarkScalar(sv.type, getDisplayBenchmark(sv, level));
  return tiers.find(t => t.label === label) ?? tiers[0];
}

/**
 * True if the scalable value has any user-set override — either an absolute
 * customValue or a tier override distinct from the originally-parsed benchmark.
 */
export function hasOverride(sv: ScalableValue): boolean {
  if (sv.customValue !== undefined && sv.customValue.length > 0) return true;
  if (sv.override !== undefined && Math.abs(sv.override - sv.benchmark) > 1e-6) return true;
  return false;
}

/**
 * Compute a benchmark scalar that reflects the CURRENT effective value — suitable
 * for driving `BenchmarkButtons`' active-tier highlight as the GM edits.
 *
 *   - If `override` is set → use it directly (explicit tier selection).
 *   - If `customValue` is set → reverse-map the custom value's average / DC back
 *     to a benchmark scalar at the current level, so typing `1d10+13` lights up
 *     `Hig` instead of staying stuck on the parse-time classification of `1d10`.
 *   - Otherwise → the stored `benchmark`.
 *
 * Returns a scalar in roughly [0, 1]; BenchmarkButtons clamps and classifies.
 */
export function getDisplayBenchmark(sv: ScalableValue, level: number): number {
  if (sv.override !== undefined) return sv.override;

  if (sv.customValue !== undefined && sv.customValue.length > 0) {
    if (sv.type === 'dc') {
      const dc = parseInt(sv.customValue, 10);
      if (Number.isNaN(dc)) return sv.benchmark;
      return dcToBenchmark(dc, level);
    }
    if (sv.type === 'healing') {
      const amount = parseInt(sv.customValue, 10);
      if (Number.isNaN(amount)) return sv.benchmark;
      return healingToBenchmark(amount, level, sv.healingKind);
    }
    const avg = parseDiceFormulaAverage(sv.customValue);
    if (avg === 0) return sv.benchmark; // unparseable formula — fall back
    if (sv.type === 'damage') return damageToBenchmark(avg, level, troopLineScale(sv));
    return persistentDamageToBenchmark(avg, level);
  }

  return sv.benchmark;
}

const TIER_EPSILON = 1e-6;

/**
 * Step a scalable value's effective benchmark by one tier.
 *
 * `+1` returns the smallest tier strictly greater than the current effective benchmark,
 * or the current benchmark if already at or above the highest tier.
 * `-1` returns the largest tier strictly less than the current effective benchmark,
 * or the current benchmark if already at or below the lowest tier.
 *
 * This "next-above / next-below" semantics avoids jumps when the current value is
 * interpolated between tiers — e.g. 0.55 `+` → high (0.67), not extreme.
 */
export function stepBenchmarkTier(sv: ScalableValue, delta: -1 | 1): number {
  const tiers = getTiersForType(sv.type);
  const current = getEffectiveBenchmark(sv);

  if (delta === 1) {
    for (const tier of tiers) {
      if (tier > current + TIER_EPSILON) return tier;
    }
    return current;
  } else {
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (tiers[i] < current - TIER_EPSILON) return tiers[i];
    }
    return current;
  }
}

/**
 * True if there is no tier strictly above the current effective benchmark.
 */
export function isAtMaxTier(sv: ScalableValue): boolean {
  const tiers = getTiersForType(sv.type);
  const current = getEffectiveBenchmark(sv);
  return current >= tiers[tiers.length - 1] - TIER_EPSILON;
}

/**
 * True if there is no tier strictly below the current effective benchmark.
 */
export function isAtMinTier(sv: ScalableValue): boolean {
  const tiers = getTiersForType(sv.type);
  const current = getEffectiveBenchmark(sv);
  return current <= tiers[0] + TIER_EPSILON;
}

/**
 * Result of parsing an ability description
 */
export interface ParsedAbility {
  template: string;           // Description with {0}, {1}, etc. placeholders
  scalableValues: ScalableValue[];
}

/** Why the parser left an inline element alone (skipped) or judged it broken (malformed). */
export type InlineReason =
  | 'self-scaling'        // carries @-expressions Foundry resolves itself — healthy, not scalable here
  | 'compound-formula'    // arithmetic the clean-instance extractor refuses to mangle
  | 'flat-check'          // a fixed flat DC is not a creature statistic
  | 'derived-dc'          // against:/defense:/dc:resolve() — the DC is computed elsewhere
  | 'external-dc'         // dc:0 sentinel for an externally-supplied DC
  | 'no-dc'               // a non-flat check with no DC source at all — a data defect
  | 'missing-payload'     // @Damage/@Check with no [...] payload, or an empty one
  | 'unclosed-bracket'    // the [...] payload never closes
  | 'unsupported-syntax'; // well-bracketed but beyond the macro grammar (e.g. double-nested brackets)

/**
 * One @Damage/@Check inline element, accounted for exactly once. An audit keys on this: `scaled`
 * values are on a curve, `skipped` ones are deliberate (with the reason), `malformed` ones are data
 * defects captured verbatim. Structured fields are provided so consumers never re-parse `text`.
 */
export interface InlineReportEntry {
  kind: 'damage' | 'check';
  /** The macro verbatim (for malformed elements: a snippet from the defect onward). */
  text: string;
  /** Offset in the original description. */
  start: number;
  disposition: 'scaled' | 'skipped' | 'malformed';
  /** Indexes into `scalableValues` extracted from this element. */
  values: number[];
  /** Damage instances inside the macro left verbatim (compound sums, @-expressions). */
  leftover: string[];
  reason?: InlineReason;
  statistic?: string;
  dc?: number;
  basic?: boolean;
}

export interface ParsedAbilityReport extends ParsedAbility {
  inlines: InlineReportEntry[];
}

/** Split on `delim`, but only at the top bracket/paren nesting level. */
function splitTopLevel(s: string, delim: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    if (c === delim && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Average of a dice formula or a flat integer ("7" → 7, "2d6+4" → 11). */
function formulaAverage(formula: string): number {
  return /^\s*\d+\s*$/.test(formula) ? parseInt(formula, 10) : parseDiceFormulaAverage(formula);
}

interface DamageInstance {
  formula: string;        // the exact substring to swap for a placeholder (e.g. "2d10+10", "7")
  damageType?: string;
  persistent: boolean;
  healing: boolean;       // @Damage[N[healing]] is self-healing, not damage
}

/**
 * Tokenise a single damage instance (already comma-split) into its scalable leading formula plus
 * type/persistent flags. Returns null when the instance isn't a clean dice/flat value — compound
 * sums and precision/splash arithmetic — so the caller leaves it untouched rather than mangle it.
 */
function extractDamageInstance(instance: string): DamageInstance | null {
  const m = instance.match(INSTANCE_FORMULA_PATTERN);
  if (!m) return null;
  const tokens = [...instance.matchAll(/\[([^\]]+)\]/g)].flatMap(b =>
    b[1].split(',').map(t => t.trim().toLowerCase())
  );
  return {
    formula: m[1],
    persistent: tokens.includes('persistent'),
    healing: tokens.includes('healing'),
    damageType: tokens.find(t => DAMAGE_TYPES.includes(t))
  };
}

// ============================================================================
// LEVEL-EXPRESSION EVALUATOR
// PF2e writes many @Damage dice counts as level-derived expressions —
// floor(1 + @actor.level/2)d6, ceil(@actor.level/2)d4, (@actor.level)d6. Foundry resolves these
// against the actor at render time, but the editor has no actor (so @actor.level reads 0 →
// floor(1) → 1d6) and the count never surfaces as an editable value. We instead evaluate the
// count at the creature's base level into a concrete NdM. This is a small total arithmetic
// evaluator: it returns null on anything it doesn't recognise (other @-variables, resolve(),
// unknown functions), so unhandled forms fall back to being left verbatim — the prior behaviour.
// ============================================================================

type ExprToken =
  | { t: 'num'; v: number }
  | { t: 'level' }
  | { t: 'ident'; v: string }
  | { t: 'sym'; v: string };

function tokenizeLevelExpr(expr: string): ExprToken[] | null {
  const tokens: ExprToken[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (expr.startsWith('@actor.level', i)) { tokens.push({ t: 'level' }); i += '@actor.level'.length; continue; }
    if (c === '@') return null; // any other @-variable can't be resolved without Foundry
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = Number(expr.slice(i, j));
      if (!Number.isFinite(num)) return null;
      tokens.push({ t: 'num', v: num }); i = j; continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[a-zA-Z]/.test(expr[j])) j++;
      tokens.push({ t: 'ident', v: expr.slice(i, j).toLowerCase() }); i = j; continue;
    }
    if ('+-*/(),'.includes(c)) { tokens.push({ t: 'sym', v: c }); i++; continue; }
    return null;
  }
  return tokens;
}

const UNARY_FNS: Record<string, (x: number) => number> = {
  floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs
};
const COMPARE_FNS: Record<string, (a: number, b: number) => number> = {
  gte: (a, b) => (a >= b ? 1 : 0), gt: (a, b) => (a > b ? 1 : 0),
  lte: (a, b) => (a <= b ? 1 : 0), lt: (a, b) => (a < b ? 1 : 0),
  eq: (a, b) => (a === b ? 1 : 0), ne: (a, b) => (a !== b ? 1 : 0)
};

/**
 * Evaluate a PF2e level-derived count expression at a concrete level. Supports + - * /,
 * parentheses, @actor.level, the floor/ceil/round/abs unary fns, variadic max/min, the
 * gte/gt/lte/lt/eq/ne comparators, and ternary(cond, then, else). Returns null on any token,
 * function, or arity it doesn't recognise so callers can leave the macro untouched.
 */
export function evalLevelExpression(expr: string, level: number): number | null {
  const tokens = tokenizeLevelExpr(expr);
  if (!tokens) return null;
  let pos = 0;
  const fail = Symbol('parse-fail');
  const peek = (): ExprToken | undefined => tokens[pos];
  const isSym = (tk: ExprToken | undefined, v: string): boolean => !!tk && tk.t === 'sym' && tk.v === v;

  const applyFn = (name: string, args: number[]): number => {
    if (name in UNARY_FNS) { if (args.length !== 1) throw fail; return UNARY_FNS[name](args[0]); }
    if (name in COMPARE_FNS) { if (args.length !== 2) throw fail; return COMPARE_FNS[name](args[0], args[1]); }
    if (name === 'max') { if (!args.length) throw fail; return Math.max(...args); }
    if (name === 'min') { if (!args.length) throw fail; return Math.min(...args); }
    if (name === 'ternary') { if (args.length !== 3) throw fail; return args[0] ? args[1] : args[2]; }
    throw fail;
  };
  const parsePrimary = (): number => {
    const tk = peek();
    if (!tk) throw fail;
    if (tk.t === 'num') { pos++; return tk.v; }
    if (tk.t === 'level') { pos++; return level; }
    if (isSym(tk, '-')) { pos++; return -parsePrimary(); }
    if (isSym(tk, '+')) { pos++; return parsePrimary(); }
    if (isSym(tk, '(')) {
      pos++; const v = parseExpr();
      if (!isSym(peek(), ')')) throw fail;
      pos++; return v;
    }
    if (tk.t === 'ident') {
      pos++;
      if (!isSym(peek(), '(')) throw fail;
      pos++;
      const args = [parseExpr()];
      while (isSym(peek(), ',')) { pos++; args.push(parseExpr()); }
      if (!isSym(peek(), ')')) throw fail;
      pos++;
      return applyFn(tk.v, args);
    }
    throw fail;
  };
  const parseTerm = (): number => {
    let v = parsePrimary();
    while (isSym(peek(), '*') || isSym(peek(), '/')) {
      const op = (peek() as { v: string }).v; pos++;
      const r = parsePrimary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  function parseExpr(): number {
    let v = parseTerm();
    while (isSym(peek(), '+') || isSym(peek(), '-')) {
      const op = (peek() as { v: string }).v; pos++;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  try {
    const v = parseExpr();
    if (pos !== tokens.length) return null; // trailing tokens — malformed
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    if (e === fail) return null;
    throw e;
  }
}

/**
 * Extract a damage instance whose dice COUNT is a level-derived expression
 * (e.g. "floor(1 + @actor.level/2)d6[void]"). The count is evaluated at `level` to a concrete
 * NdM so it becomes an ordinary, editable, scalable damage value. `matchText` is the exact
 * "<countExpr>dM" substring to swap for the placeholder, leaving any wrapping parens and
 * [type] brackets in the template. Returns null for anything not of this shape.
 */
function extractLevelDerivedDiceInstance(
  instance: string,
  level: number
): (DamageInstance & { matchText: string }) | null {
  if (!instance.includes('@actor.level')) return null;
  const tokens = [...instance.matchAll(/\[([^\]]+)\]/g)].flatMap(b =>
    b[1].split(',').map(t => t.trim().toLowerCase())
  );

  const diceRe = /d(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = diceRe.exec(instance)) !== null) {
    const diceEnd = m.index + m[0].length;
    const pre = instance.slice(0, m.index);
    const post = instance.slice(diceEnd);
    if (!pre.includes('@actor.level')) continue;
    // The dice must be the whole damage term — only wrap-closing parens and [type] brackets may follow.
    if (!/^\)*\s*(?:\[[^\]]*\]\s*)*$/.test(post)) continue;

    // Strip the leading wrap parens (those left unclosed within `pre`) so the count alone remains.
    let depth = 0;
    for (const c of pre) { if (c === '(') depth++; else if (c === ')') depth--; }
    if (depth < 0) continue;
    let start = 0;
    for (let removed = 0; removed < depth; start++) {
      if (start >= pre.length) return null;
      if (pre[start] === '(') removed++;
      else if (!/\s/.test(pre[start])) return null; // a non-paren before the wrap → not our shape
    }

    const countExpr = pre.slice(start).trim();
    if (!countExpr.includes('@actor.level')) continue;
    const value = evalLevelExpression(countExpr, level);
    if (value === null) continue;

    const count = Math.max(1, Math.round(value));
    return {
      matchText: instance.slice(start, diceEnd),
      formula: `${count}d${m[1]}`,
      persistent: tokens.includes('persistent'),
      healing: tokens.includes('healing'),
      damageType: tokens.find(t => DAMAGE_TYPES.includes(t))
    };
  }
  return null;
}

/**
 * Parse an ability description and extract scalable values
 * Returns a template with placeholders and the extracted values
 */
export function parseAbilityDescription(
  description: string,
  level: number,
  inlineReport?: InlineReportEntry[]
): ParsedAbility {
  const scalableValues: ScalableValue[] = [];
  let template = description;
  let placeholderIndex = 0;

  // Each entry replaces description[start, end) with `text`; applied right-to-left at the end so
  // earlier offsets stay valid. Position-based (not content-based) so a fragment that repeats
  // elsewhere in the prose can't be substituted at the wrong occurrence.
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  // Track which formulas we've already processed (to avoid double-matching persistent + regular)
  const processedFormulas = new Set<string>();

  const troopLineAt = troopAttackLineResolver(description);

  // Find PF2e @Damage macros FIRST so we preserve the macro shape in the template. Each macro may
  // hold several comma-separated damage instances (e.g. "5d6[fire],5d6[void]"); we extract a
  // scalable value per instance and substitute only its formula, leaving parens, [type]/[splash]/
  // [precision] brackets and trailing |options flags verbatim. Macros with @actor/expression markers
  // are skipped — they already rescale themselves in Foundry.
  let atDamageMatch;
  const atDamageRegex = new RegExp(AT_DAMAGE_MACRO.source, 'gi');
  while ((atDamageMatch = atDamageRegex.exec(description)) !== null) {
    const macro = atDamageMatch[0];
    const macroStart = atDamageMatch.index;
    const inner = macro.slice('@Damage['.length, -1);
    const instances = splitTopLevel(splitTopLevel(inner, '|')[0], ',');

    const account: InlineReportEntry | undefined = inlineReport && {
      kind: 'damage', text: macro, start: macroStart, disposition: 'skipped', values: [], leftover: []
    };
    if (account) inlineReport!.push(account);

    let templatedMacro = macro;
    let matched = false;
    // Every plain-damage instance in the macro is part of one troop line: published designers budget
    // the line as a whole and split it across damage types, so the line total is what sits on the
    // curve (across the 66 multi-term published lines the summed 3-action line reads 1.03x the high
    // strike column, the first term alone 0.71x). Stamped after the loop, once the total is known.
    const lineOfMacro = troopLineAt(macroStart);
    const plainIndexes: number[] = [];
    for (const instance of instances) {
      // A clean static instance replaces its own formula; a level-derived dice count
      // (floor(1 + @actor.level/2)d6) is evaluated at this level to a concrete NdM and swaps the
      // whole count expression. Anything else (compound sums, @item expressions) is left verbatim.
      const stat = extractDamageInstance(instance);
      const extracted = stat
        ? { ...stat, matchText: stat.formula }
        : extractLevelDerivedDiceInstance(instance, level);
      if (!extracted) {
        if (account && instance.trim()) account.leftover.push(instance.trim());
        continue;
      }

      const avgDamage = formulaAverage(extracted.formula);
      const plainDamage = !extracted.healing && !extracted.persistent;
      const value: ScalableValue = {
        type: extracted.healing ? 'healing' : extracted.persistent ? 'persistent' : 'damage',
        benchmark: extracted.healing
          ? healingToBenchmark(avgDamage, level)
          : extracted.persistent
            ? persistentDamageToBenchmark(avgDamage, level)
            : damageToBenchmark(avgDamage, level),
        originalValue: extracted.formula,
        baseLevel: level,
        damageType: extracted.healing ? undefined : extracted.damageType
      };

      templatedMacro = templatedMacro.replace(extracted.matchText, `{${placeholderIndex}}`);
      processedFormulas.add(extracted.formula);
      scalableValues.push(value);
      if (plainDamage) plainIndexes.push(scalableValues.length - 1);
      account?.values.push(scalableValues.length - 1);
      placeholderIndex++;
      matched = true;
    }

    if (lineOfMacro !== undefined) stampTroopLine(scalableValues, plainIndexes, lineOfMacro, level);

    if (account) {
      if (!inner.trim()) {
        account.disposition = 'malformed';
        account.reason = 'missing-payload';
      } else if (account.values.length) {
        account.disposition = 'scaled';
      } else {
        account.reason = account.leftover.some((t) => t.includes('@')) ? 'self-scaling' : 'compound-formula';
      }
    }

    if (matched) {
      replacements.push({ start: macroStart, end: macroStart + macro.length, text: templatedMacro });
    }
  }

  // Find persistent damage FIRST (before regular damage, so we don't double-match)
  let persistentMatch;
  const persistentRegex = new RegExp(PERSISTENT_DAMAGE_PATTERN.source, 'gi');
  while ((persistentMatch = persistentRegex.exec(description)) !== null) {
    const formula = persistentMatch[1];
    const damageType = persistentMatch[2]?.toLowerCase();

    // Validate it's a real damage type
    const validType = DAMAGE_TYPES.includes(damageType);
    if (!validType) continue;

    // Mark this formula as processed
    processedFormulas.add(formula);

    const avgDamage = parseDiceFormulaAverage(formula);
    const benchmark = persistentDamageToBenchmark(avgDamage, level);

    const value: ScalableValue = {
      type: 'persistent',
      benchmark,
      originalValue: formula,
      baseLevel: level,
      damageType: damageType
    };

    replacements.push({ start: persistentMatch.index, end: persistentMatch.index + formula.length, text: `{${placeholderIndex}}` });

    scalableValues.push(value);
    placeholderIndex++;
  }

  // Find regular damage formulas (skip any we already processed as persistent)
  let damageMatch;
  const damageRegex = new RegExp(DICE_FORMULA_PATTERN.source, 'gi');
  const proseLines = new Map<string, { resolved: ResolvedTroopLine; indexes: number[] }>();
  while ((damageMatch = damageRegex.exec(description)) !== null) {
    const formula = damageMatch[1];
    const damageType = damageMatch[2]?.toLowerCase();

    // Skip if we already processed this as persistent damage
    if (processedFormulas.has(formula)) continue;

    // Validate it's a real damage type or no type specified
    const validType = !damageType || DAMAGE_TYPES.includes(damageType);
    if (!validType) continue;

    const avgDamage = parseDiceFormulaAverage(formula);
    const resolved = troopLineAt(damageMatch.index);

    const value: ScalableValue = {
      type: 'damage',
      benchmark: damageToBenchmark(avgDamage, level),
      originalValue: formula,
      baseLevel: level,
      damageType: damageType
    };

    replacements.push({ start: damageMatch.index, end: damageMatch.index + formula.length, text: `{${placeholderIndex}}` });

    scalableValues.push(value);
    if (resolved !== undefined) {
      const key = String(resolved.line);
      const group = proseLines.get(key) ?? { resolved, indexes: [] };
      group.indexes.push(scalableValues.length - 1);
      proseLines.set(key, group);
    }
    placeholderIndex++;
  }
  // Prose damage carries no macro to group by, so the line itself is the group: every bare formula
  // sitting under the same glyph is one line, exactly as the comma-separated instances of a macro are.
  for (const { resolved, indexes } of proseLines.values()) stampTroopLine(scalableValues, indexes, resolved, level);

  // Find PF2e @Check macros. Process these FIRST so we can skip them when scanning plain DC patterns.
  // The DC may sit in any |segment (@Check[reflex|basic|dc:25|options:area-effect]) and the check
  // type may be a save, skill, or hyphenated/spaced lore. Only a literal dc:N is scalable; flat
  // checks, defense:/against: targets and dc:resolve(...) auto-derive their DC and are left alone.
  const processedCheckPositions = new Set<number>();
  let checkMatch;
  const checkRegex = new RegExp(AT_CHECK_MACRO.source, 'gi');
  while ((checkMatch = checkRegex.exec(description)) !== null) {
    processedCheckPositions.add(checkMatch.index);
    const segments = checkMatch[1].split('|').map(s => s.trim());
    const checkType = segments[0].toLowerCase();
    const dcSegment = segments.find(s => /^dc:\d+$/.test(s));

    const account: InlineReportEntry | undefined = inlineReport && {
      kind: 'check', text: checkMatch[0], start: checkMatch.index,
      disposition: 'skipped', values: [], leftover: [],
      statistic: checkType,
      basic: segments.some((s) => s === 'basic' || s === 'basic:true'),
      ...(dcSegment ? { dc: parseInt(dcSegment.slice(3), 10) } : {})
    };
    if (account) inlineReport!.push(account);

    if (checkType === 'flat') {
      if (account) account.reason = 'flat-check';
      continue;
    }

    if (!dcSegment) {
      // defense:/against:/resolve() — auto-derived, nothing to scale
      if (account) {
        const derived = segments.some(
          (s) => s.startsWith('against:') || s.startsWith('defense:') || /^dc:resolve/.test(s)
        );
        if (derived) {
          account.reason = 'derived-dc';
        } else {
          account.disposition = 'malformed';
          account.reason = 'no-dc';
        }
      }
      continue;
    }
    const dcValue = parseInt(dcSegment.slice(3), 10);
    if (dcValue <= 0) {
      if (account) account.reason = 'external-dc'; // dc:0 is a sentinel for an externally-supplied DC
      continue;
    }

    const value: ScalableValue = {
      type: 'dc',
      benchmark: dcToBenchmark(dcValue, level),
      originalValue: String(dcValue),
      baseLevel: level,
      checkType
    };

    const replacementText = checkMatch[0].replace(`dc:${dcValue}`, `dc:{${placeholderIndex}}`);
    replacements.push({ start: checkMatch.index, end: checkMatch.index + checkMatch[0].length, text: replacementText });

    scalableValues.push(value);
    if (account) {
      account.disposition = 'scaled';
      account.values.push(scalableValues.length - 1);
    }
    placeholderIndex++;
  }

  // Find all plain DC values (e.g., "DC 25")
  let dcMatch;
  const dcRegex = new RegExp(DC_PATTERN.source, 'gi');
  while ((dcMatch = dcRegex.exec(description)) !== null) {
    const dcValue = parseInt(dcMatch[1] || dcMatch[2], 10);
    if (isNaN(dcValue)) continue;

    // Skip if this position was already processed as an @Check
    // This prevents double-processing of DCs that appear in @Check format
    const isWithinCheck = Array.from(processedCheckPositions).some(
      pos => dcMatch!.index >= pos && dcMatch!.index < pos + CHECK_DEDUP_WINDOW
    );
    if (isWithinCheck) continue;

    const benchmark = dcToBenchmark(dcValue, level);

    const value: ScalableValue = {
      type: 'dc',
      benchmark,
      originalValue: String(dcValue),
      baseLevel: level
    };

    // Replace only the "DC N" / "N DC" clause, leaving any trailing save name. The clause sits at
    // the match start; its length runs to the end of the digits (DC-first) or of "DC" (digits-first).
    const rawDigits = dcMatch[1] || dcMatch[2];
    const clauseLen = dcMatch[1]
      ? dcMatch[0].indexOf(rawDigits) + rawDigits.length
      : dcMatch[0].search(/dc/i) + 2;
    const clauseText = description.slice(dcMatch.index, dcMatch.index + clauseLen);
    replacements.push({
      start: dcMatch.index,
      end: dcMatch.index + clauseLen,
      text: clauseText.replace(rawDigits, `{${placeholderIndex}}`)
    });

    scalableValues.push(value);
    placeholderIndex++;
  }

  // Find @Template areas, exposing each distance so a GM can retune a burst/emanation/cone without
  // hand-editing the macro. A troop's second area is the shrunken one it drops to at its segment
  // threshold — label it by that threshold so two "Burst radius" rows can be told apart.
  const segmentThreshold = SALVO_MARKER.exec(description);
  let templateMatch;
  const templateRegex = new RegExp(AT_TEMPLATE_MACRO.source, 'gi');
  let sawAreaTemplate = false;
  while ((templateMatch = templateRegex.exec(description)) !== null) {
    sawAreaTemplate = true;
    const segments = templateMatch[1].split('|').map((s) => s.trim());
    const distanceSegment = segments.find((s) => /^distance:\d+$/.test(s));
    if (!distanceSegment) continue;
    const distance = parseInt(distanceSegment.slice('distance:'.length), 10);
    if (distance <= 0) continue;

    const typeSegment = segments.find((s) => s.startsWith('type:')) ?? segments[0];
    const areaType = typeSegment.startsWith('type:') ? typeSegment.slice('type:'.length) : typeSegment;
    const reduced = segmentThreshold !== null && templateMatch.index > segmentThreshold.index;

    const value: ScalableValue = {
      type: 'distance',
      benchmark: 0,
      originalValue: String(distance),
      baseLevel: level,
      distanceLabel: reduced
        ? `${templateDistanceLabel(areaType)} (${segmentThreshold[0].replace(/^reduced to /i, '')})`
        : templateDistanceLabel(areaType)
    };

    replacements.push({
      start: templateMatch.index,
      end: templateMatch.index + templateMatch[0].length,
      text: templateMatch[0].replace(distanceSegment, `distance:{${placeholderIndex}}`)
    });

    scalableValues.push(value);
    placeholderIndex++;
  }

  if (sawAreaTemplate) {
    let rangeMatch;
    const rangeRegex = new RegExp(AREA_RANGE_PATTERN.source, 'gi');
    while ((rangeMatch = rangeRegex.exec(description)) !== null) {
      const range = parseInt(rangeMatch[1], 10);
      if (range <= 0) continue;

      scalableValues.push({
        type: 'distance',
        benchmark: 0,
        originalValue: String(range),
        baseLevel: level,
        distanceLabel: 'Range'
      });

      replacements.push({
        start: rangeMatch.index,
        end: rangeMatch.index + rangeMatch[0].length,
        text: rangeMatch[0].replace(rangeMatch[1], `{${placeholderIndex}}`)
      });
      placeholderIndex++;
    }
  }

  // Find valued-condition links: @UUID[…conditionitems.Item.<Slug>]{<Name> <N>}. The numeric value is
  // exposed as a 'condition' scalable so it can be edited/scaled; only known valued conditions match,
  // and only the trailing number (not the link target or name) is swapped for the placeholder.
  let conditionMatch;
  const conditionRegex = new RegExp(VALUED_CONDITION_LINK.source, 'gi');
  while ((conditionMatch = conditionRegex.exec(description)) !== null) {
    const slug = conditionMatch[1];
    const labelName = conditionMatch[2].trim();
    const condValue = parseInt(conditionMatch[3], 10);
    if (!VALUED_CONDITIONS.has(slug.toLowerCase()) || isNaN(condValue)) continue;

    const value: ScalableValue = {
      type: 'condition',
      benchmark: 0,
      originalValue: String(condValue),
      baseLevel: level,
      conditionSlug: slug,
      conditionLabel: labelName
    };

    const macro = conditionMatch[0];
    const valueLen = conditionMatch[3].length;
    replacements.push({
      start: conditionMatch.index,
      end: conditionMatch.index + macro.length,
      text: macro.slice(0, macro.length - 1 - valueLen) + `{${placeholderIndex}}}`
    });

    scalableValues.push(value);
    placeholderIndex++;
  }

  // Apply right-to-left so each splice leaves earlier offsets valid.
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    template = template.slice(0, r.start) + r.text + template.slice(r.end);
  }

  return { template, scalableValues };
}

// How much verbatim context a malformed inline's snippet carries.
const MALFORMED_SNIPPET_LENGTH = 80;

/**
 * Parse an ability description AND account for every @Damage/@Check inline element it contains —
 * scaled, deliberately skipped (with the reason), or malformed (verbatim). `parseAbilityDescription`
 * is deliberately lenient and silently leaves alone what it cannot read; an audit exists to surface
 * exactly that, so this is the entry point audits consume. Scalable values with no referencing
 * inline entry were read from bare prose (dice formulas, plain "DC N" clauses, templates,
 * conditions), not from a macro.
 */
export function parseAbilityDescriptionWithReport(description: string, level: number): ParsedAbilityReport {
  const inlines: InlineReportEntry[] = [];
  const { template, scalableValues } = parseAbilityDescription(description, level, inlines);

  // Anything the macro grammars never matched is broken syntax: diagnose it by hand-scanning the
  // brackets so the defect is reported rather than silently ignored.
  for (const token of description.matchAll(/@(Damage|Check)\b/g)) {
    const at = token.index;
    if (inlines.some((e) => at >= e.start && at < e.start + e.text.length)) continue;

    const entry: InlineReportEntry = {
      kind: token[1] === 'Damage' ? 'damage' : 'check',
      text: description.slice(at, at + MALFORMED_SNIPPET_LENGTH),
      start: at,
      disposition: 'malformed',
      values: [],
      leftover: [],
      reason: 'unsupported-syntax'
    };

    const bracket = at + token[0].length;
    if (description[bracket] !== '[') {
      entry.reason = 'missing-payload';
    } else {
      let depth = 0;
      let close = -1;
      for (let i = bracket + 1; i < description.length; i++) {
        const c = description[i];
        if (c === '[') depth++;
        else if (c === ']') {
          if (depth === 0) { close = i; break; }
          depth--;
        }
      }
      if (close === -1) entry.reason = 'unclosed-bracket';
      else if (!description.slice(bracket + 1, close).trim()) entry.reason = 'missing-payload';
      else entry.text = description.slice(at, close + 1);
    }

    inlines.push(entry);
  }

  inlines.sort((a, b) => a.start - b.start);
  return { template, scalableValues, inlines };
}

/**
 * Compute the "scaled recommendation" for a scalable value at a given level —
 * i.e. what the value should be if the user has not customised it. This is what
 * the Reset button returns to, and what the UI surfaces as a hint.
 *
 * - At `baseLevel`: returns the literal `originalValue` (preserves exact import identity).
 * - Away from `baseLevel`: uses `scaleProportionally` so the value trends smoothly up
 *   or down with level, preserving the original die shape and matching an interpolated
 *   target average. This replaces the previous tier-snap behaviour, which could
 *   produce regressions like `1d10` (avg 5.5) at level 7 → `1d8` (avg 4.5) at level 8.
 */
export function getScaledRecommendation(sv: ScalableValue, level: number): string {
  if (sv.baseLevel !== undefined && sv.baseLevel === level) {
    return sv.originalValue;
  }
  return scaleProportionally(sv, level);
}

/**
 * Compute the effective display value (dice formula or integer string) for a scalable value.
 *
 * This is the single source of truth for "what value should be shown / persisted right now?"
 * Both the HTML description renderer and the editor stepper read through this so they can't
 * drift apart.
 *
 * Precedence:
 *   1. `customValue` — absolute override, used verbatim, does not auto-scale with level
 *   2. `override`    — tier-based override (benchmark scalar), scales with level
 *   3. scaled recommendation — baseLevel-aware fallback to originalValue or benchmark-scaled
 */
export function getEffectiveValue(sv: ScalableValue, level: number): string {
  if (sv.customValue !== undefined && sv.customValue.length > 0) {
    return sv.customValue;
  }
  if (sv.override !== undefined) {
    // Damage/persistent resolve to the same clean NdM the recommendation shows for that tier, so
    // selecting a benchmark sets clean dice rather than the strike table's mixed-dice formula.
    if (sv.type === 'damage' || sv.type === 'persistent') {
      return cleanTierFormula(sv, level, sv.override)
        ?? (sv.type === 'damage' ? scaleDamage(sv.override, level) : scalePersistentDamage(sv.override, level));
    }
    if (sv.type === 'healing') return String(scaleHealing(sv.override, level, sv.healingKind));
    if (sv.type === 'dc') return String(scaleDC(sv.override, level));
    // condition: no tier override — fall through to the recommendation
  }
  return getScaledRecommendation(sv, level);
}

/**
 * Render an ability description with scaled values for a given level
 */
export function renderAbilityDescription(
  template: string,
  scalableValues: ScalableValue[],
  level: number
): string {
  let result = template;

  for (let i = 0; i < scalableValues.length; i++) {
    const scaledValue = getEffectiveValue(scalableValues[i], level);
    result = result.replace(`{${i}}`, scaledValue);
  }

  return result;
}

/**
 * Render an ability description as HTML with each scalable value wrapped in a
 * `<span class="scalable-inline" data-scalable-index="N">…</span>` tag so the
 * editor UI can visually tag and cross-highlight values with the stepper inputs
 * rendered alongside the description.
 *
 * `activeIndex`, if provided, marks the corresponding span with `scalable-inline--active`.
 * Spans with an override-distinct benchmark are marked with `scalable-inline--overridden`.
 */
export function renderAbilityDescriptionHtml(
  template: string,
  scalableValues: ScalableValue[],
  level: number,
  activeIndex?: number
): string {
  // A placeholder inside an @Check/@Damage/@Template macro must stay a plain value: wrapping it in
  // the inline <span> corrupts the macro's brackets, so Foundry can't enrich it and the raw
  // "@Check[…]" text leaks into the rendered description. Only free-text placeholders get the
  // cross-highlightable tag; in-macro values stay editable via the stepper list instead.
  const macroRanges: Array<[number, number]> = [];
  for (const pattern of [AT_CHECK_MACRO, AT_DAMAGE_MACRO, AT_TEMPLATE_MACRO, AT_UUID_LABEL]) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(template)) !== null) macroRanges.push([m.index, m.index + m[0].length]);
  }
  const insideMacro = (offset: number): boolean =>
    macroRanges.some(([start, end]) => offset >= start && offset < end);

  return template.replace(/\{(\d+)\}/g, (match, digits: string, offset: number) => {
    const i = Number(digits);
    const sv = scalableValues[i];
    if (!sv) return match;
    const scaledValue = getEffectiveValue(sv, level);
    if (insideMacro(offset)) return scaledValue;
    const classes = [
      'scalable-inline',
      hasOverride(sv) ? 'scalable-inline--overridden' : '',
      activeIndex === i ? 'scalable-inline--active' : ''
    ].filter(Boolean).join(' ');
    return `<span class="${classes}" data-scalable-index="${i}">${scaledValue}</span>`;
  });
}

/**
 * Stamp `troopLine` onto damage values parsed before troop lines existed, re-benchmarking them on
 * the line's own ladder. Returns the same array when nothing changes.
 *
 * Stored scalable values win over re-parsing on load (they carry the user's edits), so without this
 * a troop saved earlier would keep scoring its 1-action line against the full strike ladder. Only
 * the derived `benchmark` moves; a user's `override`/`customValue` is left exactly as set.
 */
export function backfillTroopLines(
  template: string,
  scalableValues: ScalableValue[],
  level: number
): ScalableValue[] {
  const resolve = troopAttackLineResolver(template);
  const groups = new Map<string, { resolved: ResolvedTroopLine; indexes: number[] }>();

  scalableValues.forEach((sv, i) => {
    if (sv.type !== 'damage' || sv.troopLine !== undefined) return;
    const at = template.search(new RegExp(`\\{${i}\\}`));
    if (at < 0) return;
    const resolved = resolve(at);
    if (resolved === undefined) return;
    const key = String(resolved.line);
    const group = groups.get(key) ?? { resolved, indexes: [] };
    group.indexes.push(i);
    groups.set(key, group);
  });

  if (groups.size === 0) return scalableValues;

  // Stamping mutates, so copy first — callers hold the stored array.
  const next = scalableValues.map((sv) => ({ ...sv }));
  for (const { resolved, indexes } of groups.values()) {
    stampTroopLine(next, indexes, resolved, next[indexes[0]].baseLevel ?? level);
  }
  return next;
}

/**
 * Process a special ability to add scaling support
 * Call this when importing a creature to enable level scaling
 */
export function processAbilityForScaling(
  ability: SpecialAbility,
  level: number
): SpecialAbility {
  const { template, scalableValues } = parseAbilityDescription(ability.description, level);

  // Only add scaling data if we found scalable values
  if (scalableValues.length === 0) {
    return ability;
  }

  return {
    ...ability,
    descriptionTemplate: template,
    scalableValues
  };
}

/**
 * Get the rendered description for an ability at a given level
 * If the ability has scaling data, renders with scaled values
 * Otherwise returns the original description
 */
export function getAbilityDescription(ability: SpecialAbility, level: number): string {
  const template = ability.customDescriptionTemplate ?? ability.descriptionTemplate;
  if (template && ability.scalableValues && ability.scalableValues.length > 0) {
    return renderAbilityDescription(template, ability.scalableValues, level);
  }
  // No placeholders, but the user may have provided a freeform override text.
  if (ability.customDescriptionTemplate) return ability.customDescriptionTemplate;
  return ability.description;
}

/**
 * Process all abilities on a creature for scaling
 */
export function processAbilitiesForScaling(
  abilities: SpecialAbility[],
  level: number
): SpecialAbility[] {
  return abilities.map(ability => processAbilityForScaling(ability, level));
}

// ============================================================================
// FAST HEALING / REGENERATION RULE-ELEMENT HELPERS
// The healing amount lives on a PF2e FastHealing rule element + the item name,
// not in the description. These pure helpers read/write that shape so the
// Foundry-coupled services can stay thin.
// ============================================================================

/** The fields of a PF2e FastHealing rule element this module reads/writes. */
export interface FastHealingRuleData {
  key: string;
  type?: 'fast-healing' | 'regeneration';
  value: number | string;
  deactivatedBy?: string[];
  [extra: string]: unknown;
}

type RuleLike = Record<string, unknown>;

/**
 * Find the FastHealing rule in an item's `system.rules` and return its kind, numeric value, and
 * deactivation types. `value` is null when the rule's amount is a formula/expression (e.g.
 * `@item.system.badge.value * 3`) — those self-scale in Foundry and must be left untouched.
 */
export function readFastHealingRule(
  rules: readonly RuleLike[] | undefined
): { kind: 'fast-healing' | 'regeneration'; value: number | null; deactivatedBy: string[] } | null {
  if (!Array.isArray(rules)) return null;
  const rule = rules.find((r) => r && r.key === 'FastHealing') as FastHealingRuleData | undefined;
  if (!rule) return null;
  const kind = rule.type === 'regeneration' ? 'regeneration' : 'fast-healing';
  const value = typeof rule.value === 'number' && Number.isFinite(rule.value) ? rule.value : null;
  const deactivatedBy = Array.isArray(rule.deactivatedBy)
    ? rule.deactivatedBy.filter((t): t is string => typeof t === 'string')
    : [];
  return { kind, value, deactivatedBy };
}

/** Build a fresh FastHealing rule element for a new item. */
export function buildFastHealingRule(
  kind: 'fast-healing' | 'regeneration',
  value: number,
  deactivatedBy?: string[]
): FastHealingRuleData {
  const rule: FastHealingRuleData = { key: 'FastHealing', type: kind, value };
  if (kind === 'regeneration') rule.deactivatedBy = deactivatedBy ?? [];
  return rule;
}

/**
 * Return a copy of `rules` with the FastHealing rule's `value` replaced. If no FastHealing rule is
 * present, appends one built from `kind`/`deactivatedBy` so a creature that gained the ability in the
 * editor still gets a working rule.
 */
export function setFastHealingRuleValue(
  rules: readonly RuleLike[] | undefined,
  value: number,
  kind: 'fast-healing' | 'regeneration',
  deactivatedBy?: string[]
): RuleLike[] {
  const list = Array.isArray(rules) ? rules.map((r) => ({ ...r })) : [];
  const existing = list.find((r) => r.key === 'FastHealing');
  if (existing) {
    existing.value = value;
    return list;
  }
  list.push(buildFastHealingRule(kind, value, deactivatedBy) as RuleLike);
  return list;
}

/**
 * Compose the display name for a fast-healing/regeneration ability, swapping the amount in.
 * Replaces the first run of digits in the existing name (preserving any localized suffix such as
 * "(Deactivated by Fire or Electricity)"); appends the value when the name carries no number.
 */
export function composeFastHealingName(currentName: string, value: number | string): string {
  if (/\d+/.test(currentName)) return currentName.replace(/\d+/, String(value));
  return `${currentName.trim()} ${value}`;
}

// ============================================================================
// EXPORTS FOR DIRECT TABLE ACCESS
// ============================================================================

export { getAbilityDCRange, getSpellAttackRange, getPersistentDamageRange, getFastHealingRange };
