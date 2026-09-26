/**
 * Multi-part strike damage: one main roll judged against the strike-damage table, plus every other
 * roll on the item (secondary direct damage, persistent, splash, precision) carried as parts that
 * scale by level. The one reader and the one writer of `system.damageRolls` both go through here.
 * Design: docs/plans/multi-part-strike-damage.md.
 */

import type { CreatureStrike, StrikeDamagePart, StrikeDamageCategory } from './models';
import {
  getStatRangesForLevel,
  interpolateStrikeDamageAverage,
  scaleStrikeDamage,
  adjustDamageFormulaToAverage,
  calculateEffectiveDamage
} from './creatureStatTables';
import {
  parseDiceComponents,
  parseDiceFormulaAverage,
  formatDiceFormula,
  scaleProportionally,
  getPersistentTierAveragesForLevel
} from './abilityScaling';
import { fitTroopLineFormula } from './troopBenchmarks';

/** One entry of a PF2e melee item's `system.damageRolls`; foreign fields ride through untouched. */
export interface DamageRollSource {
  damage?: string;
  damageType?: string;
  category?: string | null;
  [key: string]: unknown;
}

const STRIKE_CATEGORIES: ReadonlySet<string> = new Set(['persistent', 'splash', 'precision']);

const toCategory = (category: string | null | undefined): StrikeDamageCategory | undefined =>
  category && STRIKE_CATEGORIES.has(category) ? (category as StrikeDamageCategory) : undefined;

/** Direct damage counts toward the strike benchmark; persistent, splash, and precision ride outside it. */
export const isDirectPart = (part: { category?: string | null }): boolean => !part.category;

/**
 * The strike damage scalar, extrapolated past the table (D2). Inside Low..Extreme it is the usual
 * piecewise 0–1 position. Below Low it is the ratio to Low minus one, in (−1, 0); above Extreme one
 * plus the excess ratio. Ratios keep a far-out value positive at every level, where extending the
 * nearest segment's slope would drive it negative at low levels.
 */
export function strikeDamageScalar(avg: number, level: number): number {
  const r = getStatRangesForLevel(level).strikeDamage;
  if (avg < r.low.average) return r.low.average > 0 ? avg / r.low.average - 1 : 0;
  if (avg > r.extreme.average) return avg / r.extreme.average;
  const points = [r.low.average, r.moderate.average, r.high.average, r.extreme.average];
  for (let i = 0; i < 3; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (avg <= hi) return (i + (hi > lo ? (avg - lo) / (hi - lo) : 0)) / 3;
  }
  return 1;
}

/** Inverse of `strikeDamageScalar`. */
export function strikeDamageAverageAt(scalar: number, level: number): number {
  const r = getStatRangesForLevel(level).strikeDamage;
  if (scalar < 0) return Math.max(0, (1 + scalar) * r.low.average);
  if (scalar > 1) return scalar * r.extreme.average;
  return interpolateStrikeDamageAverage(scalar, r);
}

const isFlat = (formula: string): boolean => /^\s*\d+\s*$/.test(formula);
const isScalableFormula = (formula: string): boolean => parseDiceComponents(formula) !== null || isFlat(formula);

/** Position on the persistent-damage table (0 Low, 0.5 Moderate, 1 High), ratio-extrapolated past it like strikes. */
export function persistentDamageScalar(avg: number, level: number): number {
  const { low, mod, high } = getPersistentTierAveragesForLevel(level);
  if (avg < low) return low > 0 ? avg / low - 1 : 0;
  if (avg > high) return avg / high;
  if (avg <= mod) return mod > low ? 0.5 * ((avg - low) / (mod - low)) : 0;
  return high > mod ? 0.5 + 0.5 * ((avg - mod) / (high - mod)) : 0.5;
}

/** Inverse of `persistentDamageScalar`. */
export function persistentDamageAverageAt(scalar: number, level: number): number {
  const { low, mod, high } = getPersistentTierAveragesForLevel(level);
  if (scalar < 0) return Math.max(0, (1 + scalar) * low);
  if (scalar > 1) return scalar * high;
  return scalar <= 0.5 ? low + (mod - low) * (scalar / 0.5) : mod + (high - mod) * ((scalar - 0.5) / 0.5);
}

const DIE_SIZES = [4, 6, 8, 10, 12] as const;
const perDie = (die: number): number => (die + 1) / 2;

/**
 * A formula resized to `target` in its own shape. Flat stays flat; clean dice change count and drop
 * to a smaller die only when one die would overshoot; NdM+B scales count and bonus together, so a
 * strike-like roll stays strike-like (3d6+14 → 2d6+8) instead of trading its bonus for dice.
 */
function shapePart(formula: string, target: number): string {
  if (isFlat(formula)) return String(Math.max(1, Math.round(target)));
  const c = parseDiceComponents(formula);
  if (!c) return formula;

  if (c.bonus === 0) {
    const count = Math.round(target / perDie(c.die));
    if (count >= 1) return formatDiceFormula(count, c.die, 0);
    const die = DIE_SIZES.reduce((best, d) => (Math.abs(perDie(d) - target) < Math.abs(perDie(best) - target) ? d : best));
    return formatDiceFormula(1, Math.min(die, c.die), 0);
  }

  const scale = target / (c.count * perDie(c.die) + c.bonus);
  let count = Math.max(1, Math.round(c.count * scale));
  let bonus = Math.round(target - count * perDie(c.die));
  while (bonus < 0 && count > 1) {
    count--;
    bonus = Math.round(target - count * perDie(c.die));
  }
  if (bonus < 0) return shapePart(formatDiceFormula(1, c.die, 0), target);
  return formatDiceFormula(count, c.die, bonus);
}

/**
 * A part's formula at `level` by level alone: verbatim at its authoring level; a persistent rider
 * keeps its position on the persistent-damage table; other parts scale by the level factor.
 */
export function scalePart(part: StrikeDamagePart, level: number): string {
  if (level === part.baseLevel || !isScalableFormula(part.formula)) return part.formula;
  if (part.category === 'persistent') {
    const scalar = persistentDamageScalar(parseDiceFormulaAverage(part.formula), part.baseLevel);
    return shapePart(part.formula, persistentDamageAverageAt(scalar, level));
  }
  return scaleProportionally(
    { type: 'damage', benchmark: 0, originalValue: part.formula, baseLevel: part.baseLevel },
    level
  );
}

/** The main roll shaped to `target` at `level`. */
function shapeMain(authored: string, target: number, level: number, benchmark: number | undefined): string {
  const range = getStatRangesForLevel(level).strikeDamage;
  const components = authored ? parseDiceComponents(authored) : null;

  // Clean NdM mains (energy jets, breath-like strikes) keep their die and scale by dice count.
  if (components && components.bonus === 0) {
    return formatDiceFormula(Math.max(1, Math.round(target / ((components.die + 1) / 2))), components.die, 0);
  }

  // Below the table, shift the Low entry's modifier down; once it would go negative (3d6-6 reads
  // wrong) fit the Low die instead.
  if (target < range.low.average) {
    const low = parseDiceComponents(range.low.formula);
    if (!low) return fitTroopLineFormula(target, 6);
    const bonus = Math.round(target - low.count * ((low.die + 1) / 2));
    return bonus >= 0 ? formatDiceFormula(low.count, low.die, bonus) : fitTroopLineFormula(target, low.die);
  }
  if (target > range.extreme.average) return adjustDamageFormulaToAverage(range.extreme.formula, target);

  // Single-roll strikes keep today's exact table output; a multi-part main takes the table shape
  // of its own share.
  return scaleStrikeDamage(benchmark ?? strikeDamageScalar(target, level), range).formula;
}

export interface ResolvedStrikePart extends StrikeDamagePart {
  /** The part's formula at the resolved level. */
  resolved: string;
  average: number;
}

export interface ResolvedStrikeDamage {
  /** The main roll at the resolved level; '' when the strike has no direct main roll. */
  main: string;
  mainAverage: number;
  parts: ResolvedStrikePart[];
  /** Main + direct parts: what the damage benchmark judges (D1). */
  directAverage: number;
  persistentAverage: number;
  /** Direct + persistent × expected rounds. */
  effectiveAverage: number;
}

/**
 * Every roll of `strike` at `level`. The tier sets the direct total; each direct roll keeps its
 * authored share of it, and splash/precision move by the same factor, so a tier click or a level
 * change resizes the whole strike in the author's proportions. Persistent riders ride their own table.
 */
export function resolveStrikeDamage(strike: CreatureStrike, level: number): ResolvedStrikeDamage {
  const custom = strike.customDamageFormula && parseDiceFormulaAverage(strike.customDamageFormula) > 0
    ? strike.customDamageFormula
    : undefined;
  const ref = strike.damageBaseLevel;
  const extras = strike.extraDamage ?? [];

  let main: string;
  let parts: ResolvedStrikePart[];

  if (custom !== undefined || ref === undefined) {
    // No authored split to keep (a pinned formula, or a benchmark-only main): parts scale by level
    // and the main takes what the tier leaves.
    parts = extras.map((part) => resolvedPart(part, scalePart(part, level)));
    const directExtras = parts.filter(isDirectPart).reduce((sum, p) => sum + p.average, 0);
    if (custom !== undefined) {
      main = custom;
    } else {
      const target = strikeDamageAverageAt(strike.damageBenchmark, level) - directExtras;
      const singleRoll = !parts.some(isDirectPart);
      main = shapeMain(strike.damage, Math.max(1, target), level, singleRoll ? strike.damageBenchmark : undefined);
    }
  } else {
    // Every roll as authored, brought to the strike's authoring level.
    const atRef = extras.map((part) => scalePart(part, ref));
    const mainAuthored = parseDiceFormulaAverage(strike.damage);
    const authoredTotal = extras.reduce(
      (sum, part, i) => (isDirectPart(part) ? sum + parseDiceFormulaAverage(atRef[i]) : sum),
      mainAuthored
    );
    const target = strikeDamageAverageAt(strike.damageBenchmark, level);
    const verbatim = level === ref && Math.abs(target - authoredTotal) < 0.5;
    const factor = authoredTotal > 0 ? target / authoredTotal : undefined;

    parts = extras.map((part, i) => {
      if (verbatim) return resolvedPart(part, atRef[i]);
      if (part.category === 'persistent' || factor === undefined) return resolvedPart(part, scalePart(part, level));
      return resolvedPart(part, shapePart(atRef[i], parseDiceFormulaAverage(atRef[i]) * factor));
    });

    if (strike.damage === '' || verbatim) {
      // '' = authored with no direct roll (grab-only tongue, persistent-only tendril): none at any level.
      main = strike.damage;
    } else if (!extras.some(isDirectPart)) {
      main = shapeMain(strike.damage, Math.max(1, target), level, strike.damageBenchmark);
    } else {
      // Riders round to whole dice; the main absorbs the remainder so the total lands on the tier.
      const riders = parts.filter(isDirectPart).reduce((sum, p) => sum + p.average, 0);
      main = shapePart(strike.damage, Math.max(1, target - riders));
    }
  }

  const mainAverage = main ? parseDiceFormulaAverage(main) : 0;
  const directAverage = parts.filter(isDirectPart).reduce((sum, p) => sum + p.average, mainAverage);
  const persistent = parts.filter((p) => p.category === 'persistent');
  const persistentAverage = persistent.reduce((sum, p) => sum + p.average, 0);
  const effectiveAverage = persistent.reduce(
    (sum, p) => sum + calculateEffectiveDamage(0, p.resolved),
    directAverage
  );

  return { main, mainAverage, parts, directAverage, persistentAverage, effectiveAverage };
}

const resolvedPart = (part: StrikeDamagePart, resolved: string): ResolvedStrikePart => ({
  ...part,
  resolved,
  average: parseDiceFormulaAverage(resolved)
});

/** The roll PF2e treats as the strike's own: the direct roll with the largest average (ties → first). */
export function pickMainRollKey(rolls: Record<string, DamageRollSource>): string | undefined {
  let bestKey: string | undefined;
  let best = -Infinity;
  for (const [key, roll] of Object.entries(rolls)) {
    if (!isDirectPart(roll)) continue;
    const avg = parseDiceFormulaAverage(roll.damage ?? '');
    if (avg > best) {
      best = avg;
      bestKey = key;
    }
  }
  return bestKey;
}

export interface ReadStrikeDamage {
  damage: string;
  damageType: string;
  mainRollKey?: string;
  extraDamage: StrikeDamagePart[];
  /** Main + direct parts at `level`. */
  directAverage: number;
}

/** Split an item's `damageRolls` into the main roll and its parts, all authored at `level`. */
export function readDamageRolls(rolls: Record<string, DamageRollSource>, level: number): ReadStrikeDamage {
  const mainRollKey = pickMainRollKey(rolls);
  const main = mainRollKey ? rolls[mainRollKey] : undefined;
  const extraDamage: StrikeDamagePart[] = [];
  let directAverage = main ? parseDiceFormulaAverage(main.damage ?? '') : 0;

  for (const [key, roll] of Object.entries(rolls)) {
    if (key === mainRollKey || !roll.damage) continue;
    const part: StrikeDamagePart = {
      formula: roll.damage,
      damageType: roll.damageType || 'untyped',
      baseLevel: level,
      rollKey: key
    };
    const category = toCategory(roll.category);
    if (category) part.category = category;
    else directAverage += parseDiceFormulaAverage(roll.damage);
    extraDamage.push(part);
  }

  return {
    damage: main?.damage ?? '',
    damageType: main?.damageType || 'slashing',
    ...(mainRollKey ? { mainRollKey } : {}),
    extraDamage,
    directAverage
  };
}

function nextRollKey(used: Set<string>): string {
  let n = 0;
  while (used.has(String(n))) n++;
  const key = String(n);
  used.add(key);
  return key;
}

/**
 * Give every roll-less part (and a roll-less main) a `damageRolls` key, avoiding keys already on
 * the item. Mutates `strike` so the flag origin written alongside the rolls names the same keys.
 */
export function assignRollKeys(strike: CreatureStrike, existingRolls: Record<string, DamageRollSource> = {}): void {
  const used = new Set(Object.keys(existingRolls));
  if (strike.mainRollKey) used.add(strike.mainRollKey);
  for (const part of strike.extraDamage ?? []) if (part.rollKey) used.add(part.rollKey);
  if (!strike.mainRollKey && (strike.damage !== '' || strike.damageBaseLevel === undefined)) {
    strike.mainRollKey = nextRollKey(used);
  }
  for (const part of strike.extraDamage ?? []) part.rollKey ??= nextRollKey(used);
}

export interface ComposedDamageRolls {
  /** The item's full `damageRolls` after the write. */
  rolls: Record<string, DamageRollSource>;
  /** Keys present on the item that the strike no longer carries. */
  removed: string[];
}

/**
 * The `damageRolls` a strike should have at `level`. Rolls rewrite in place by key so foreign roll
 * fields survive. Mutates `strike`: keyless rolls get keys and a benchmark-only main gets anchored,
 * so a flag written from the same strike names what landed on the item.
 */
export function composeDamageRolls(
  strike: CreatureStrike,
  level: number,
  existingRolls: Record<string, DamageRollSource> = {}
): ComposedDamageRolls {
  assignRollKeys(strike, existingRolls);
  const resolved = resolveStrikeDamage(strike, level);
  const rolls: Record<string, DamageRollSource> = {};

  if (resolved.main && strike.mainRollKey) {
    const prior = existingRolls[strike.mainRollKey] ?? {};
    rolls[strike.mainRollKey] = {
      ...prior,
      damage: resolved.main,
      damageType: strike.damageType || 'slashing',
      category: null
    };
  }
  for (const part of resolved.parts) {
    const prior = existingRolls[part.rollKey!] ?? {};
    rolls[part.rollKey!] = {
      ...prior,
      damage: part.resolved,
      damageType: part.damageType,
      category: part.category ?? null
    };
  }

  // Keep the item's roll order (the PF2e sheet renders rolls in key order); new keys follow.
  const ordered: Record<string, DamageRollSource> = {};
  for (const key of Object.keys(existingRolls)) if (key in rolls) ordered[key] = rolls[key];
  for (const key of Object.keys(rolls)) if (!(key in ordered)) ordered[key] = rolls[key];

  // A benchmark-only main is now authored: the flag origin must record the formula just written.
  if (strike.damageBaseLevel === undefined) {
    strike.damage = resolved.main;
    strike.damageBaseLevel = level;
  }

  const removed = Object.keys(existingRolls).filter((key) => !(key in rolls));
  return { rolls: ordered, removed };
}

const normalizeCategory = (roll: DamageRollSource): DamageRollSource =>
  roll.category == null ? { ...roll, category: null } : roll;

/** True when `composed` would change nothing on an item whose rolls are `existing`. */
export function damageRollsEqual(
  composed: ComposedDamageRolls,
  existing: Record<string, DamageRollSource>
): boolean {
  if (composed.removed.length > 0) return false;
  const keys = Object.keys(composed.rolls);
  if (keys.length !== Object.keys(existing).length) return false;
  return keys.every((key) => {
    const a = normalizeCategory(composed.rolls[key]);
    const b = existing[key] ? normalizeCategory(existing[key]) : undefined;
    return !!b && a.damage === b.damage && a.damageType === b.damageType && a.category === b.category;
  });
}
