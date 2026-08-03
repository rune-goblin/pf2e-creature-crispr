/**
 * Judging a written ability against the creature ladders — the read-only half of the editor's
 * arithmetic, packaged for consumers that audit shipped content rather than edit it.
 *
 * A consumer must not have to decide what a "line" is. Which terms make up one damage line, what
 * that line totals, which line an action is judged by, and where each of those sits on its ladder
 * are all answered here; a consumer maps the verdicts onto its own vocabulary and renders them.
 */

import {
  classifyDamageByAverage,
  classifyDcByValue,
  classifyHealingByValue,
  damageToBenchmark,
  dcToBenchmark,
  healingToBenchmark,
  parseAbilityDescriptionWithReport,
  parseDiceFormulaAverage,
  persistentDamageToBenchmark,
  troopLineScale,
  type InlineReportEntry,
  type TierVerdict
} from './abilityScaling';
import type { ScalableValue } from './models';
import type { TroopAttackLine } from './troopBenchmarks';

export type DamageLane = 'damage' | 'persistent' | 'healing';

export interface AuditedDamage {
  lane: DamageLane;
  /** The lane's terms as written, joined — what the formula reads on the statblock. */
  formula: string;
  /** The lane's TOTAL average. Published designers budget a line and split it, so the total is
   *  what the curve judges; a single term of a split line is never judged alone. */
  average: number;
  verdict: TierVerdict<'low' | 'moderate' | 'high' | 'extreme'> | null;
  benchmark: number | null;
  troopLine?: TroopAttackLine;
  /** Glyph action count, for display. Differs from `troopLine` on a "1 to 2" sweep. */
  troopLineActions?: 1 | 2 | 3;
  /** The headline row of its line — one per troop line, so a sweep surfaces all three. The "or
   *  slashing" alternatives and a recurring rider are the same line written twice, not extra rows. */
  representative: boolean;
  /** Whether an off-tier reading here is a defect. False on the 1-action line, whose target is
   *  finer than one die step: it is shown so a sweep reads complete, but it cannot carry a flag. */
  judged: boolean;
}

/** A damage term the parser could not put on a curve — kept verbatim so a consumer can show it. */
export interface UnbenchmarkedDamage {
  formula: string;
  /** `self-scaling` rescales itself in Foundry (healthy); `unparsed` is parser inadequacy. */
  reason: 'self-scaling' | 'unparsed';
}

export interface AuditedCheck {
  raw: string;
  statistic: string;
  dc: number | null;
  basic: boolean;
  verdict: TierVerdict<'moderate' | 'high' | 'extreme'> | null;
  benchmark: number | null;
}

export interface AuditedAbility {
  damage: AuditedDamage[];
  unbenchmarked: UnbenchmarkedDamage[];
  checks: AuditedCheck[];
  /** Inline elements that do not parse as written — generation defects, captured verbatim. */
  malformed: string[];
}

const LANES: readonly DamageLane[] = ['damage', 'persistent', 'healing'];

const termOf = (sv: ScalableValue): string => {
  if (sv.type === 'persistent') return `${sv.originalValue}[persistent${sv.damageType ? `,${sv.damageType}` : ''}]`;
  if (sv.type === 'healing') return `${sv.originalValue}[healing]`;
  return sv.damageType ? `${sv.originalValue}[${sv.damageType}]` : sv.originalValue;
};

const averageOf = (sv: ScalableValue): number =>
  /^\s*\d+\s*$/.test(sv.originalValue) ? parseInt(sv.originalValue, 10) : parseDiceFormulaAverage(sv.originalValue);

function laneRow(group: ScalableValue[], lane: DamageLane, level: number): AuditedDamage {
  const average = group.reduce((sum, sv) => sum + averageOf(sv), 0);
  const line = group.find((sv) => sv.troopLine !== undefined)?.troopLine;
  const actions = group.find((sv) => sv.troopLineActions !== undefined)?.troopLineActions;
  const base = {
    lane,
    formula: group.map(termOf).join(','),
    average,
    ...(line !== undefined ? { troopLine: line } : {}),
    ...(actions !== undefined ? { troopLineActions: actions } : {}),
    representative: false,
    judged: false
  };

  if (lane === 'healing') {
    const kind = group[0].healingKind;
    return { ...base, verdict: classifyHealingByValue(average, level, kind), benchmark: healingToBenchmark(average, level, kind) };
  }
  if (lane === 'persistent') {
    return {
      ...base,
      verdict: classifyDamageByAverage('persistent', average, level),
      benchmark: persistentDamageToBenchmark(average, level)
    };
  }
  // The line's own ladder, not a term's: every term of a split line carries the same line scale,
  // so scoring the total against the leading term's scale is the whole point.
  const scale = line !== undefined ? troopLineScale({ troopLine: line }) : 1;
  return {
    ...base,
    verdict: classifyDamageByAverage('damage', average, level, scale),
    benchmark: damageToBenchmark(average, level, scale)
  };
}

/**
 * Mark each line's headline row, and say which of them can carry a flag.
 *
 * A sweep surfaces all three of its lines: the action is written as one, two or three actions and
 * an audit that showed fewer would read as if the statblock had fewer. Every line has its own
 * corpus-calibrated target, and a troop can sit on one while drifting on another (a soft 2-action
 * line under an on-target full round, or the reverse), so each is measured separately.
 *
 * Only the 1-action line cannot be judged. At 0.27 of a round its target is smaller than one die
 * step for most die faces, so its tier reading is rounding noise rather than design: snapping 120
 * sweeps exactly onto the curve and re-reading them, it still landed off-tier 21 times where the
 * full-round line never missed. It is shown with its verdict and left unjudged.
 *
 * Within a line the headline is the biggest number — the "or slashing" alternatives and a recurring
 * rider are the same line written more than once, not separate offenders. An action with no troop
 * lines is judged by its biggest number in each lane.
 */
function markRepresentative(rows: AuditedDamage[]): void {
  const lines = rows.filter((r) => r.lane === 'damage' && r.troopLine !== undefined);
  if (lines.length) {
    for (const line of new Set(lines.map((r) => r.troopLine))) {
      const group = lines.filter((r) => r.troopLine === line);
      const headline = group.reduce((best, r) => (r.average > best.average ? r : best));
      headline.representative = true;
      headline.judged = line !== 1;
    }
  }
  for (const lane of LANES) {
    // Plain damage on a troop line is already answered for above.
    if (lane === 'damage' && lines.length) continue;
    const group = rows.filter((r) => r.lane === lane);
    if (!group.length) continue;
    const headline = group.reduce((best, r) => (r.average > best.average ? r : best));
    headline.representative = true;
    headline.judged = true;
  }
}

function checkRow(inline: InlineReportEntry, level: number): AuditedCheck {
  const base = {
    raw: inline.text,
    statistic: inline.statistic ?? '',
    dc: inline.dc ?? null,
    basic: inline.basic ?? false
  };
  if (inline.disposition !== 'scaled' || inline.dc === undefined) return { ...base, verdict: null, benchmark: null };
  return { ...base, verdict: classifyDcByValue(inline.dc, level), benchmark: dcToBenchmark(inline.dc, level) };
}

/**
 * Audit one written ability at a level: every damage line totalled and placed on its ladder, every
 * save DC classified, every element the parser could not read reported rather than dropped.
 */
export function auditAbility(description: string, level: number): AuditedAbility {
  const { scalableValues, inlines } = parseAbilityDescriptionWithReport(description, level);
  const damage: AuditedDamage[] = [];
  const unbenchmarked: UnbenchmarkedDamage[] = [];
  const checks: AuditedCheck[] = [];
  const malformed: string[] = [];

  for (const inline of inlines) {
    if (inline.disposition === 'malformed') {
      malformed.push(inline.text);
      continue;
    }
    if (inline.kind === 'check') {
      checks.push(checkRow(inline, level));
      continue;
    }
    for (const lane of LANES) {
      const group = inline.values.map((i) => scalableValues[i]).filter((sv) => sv?.type === lane);
      if (group.length) damage.push(laneRow(group, lane, level));
    }
    for (const leftover of inline.leftover) {
      unbenchmarked.push({ formula: leftover, reason: leftover.includes('@') ? 'self-scaling' : 'unparsed' });
    }
  }

  markRepresentative(damage);
  return { damage, unbenchmarked, checks, malformed };
}
