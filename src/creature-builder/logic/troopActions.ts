// Generators for the two published troop attack actions: the 1-to-3-action sweep (151/162
// published troops) and the 2-action ranged volley (73/162). Grammar and numbers follow the
// 2026-07-18 corpus sweep recorded in docs/plans/troop-conversion-v2.md.

import type { CreatureStrike, SpecialAbility } from './models';
import type { CustomAbilityDefinition } from './contracts';
import type { CreatureLevel } from './creatureStatTables';
import { getStatRangesForLevel } from './creatureStatTables';
import { parseDiceComponents, parseDiceFormulaAverage } from './abilityScaling';
import {
  fitTroopLineFormula,
  SWEEP_ONE_FACTOR,
  SWEEP_TWO_FACTOR,
  VOLLEY_DAMAGE_FACTOR
} from './troopBenchmarks';

// English defaults (plan decision 3) — hosts localize by passing opts.name instead.
export const TROOP_SWEEP_NAME_TEMPLATE = '{strike} Flurry';
export const TROOP_VOLLEY_NAME_TEMPLATE = '{strike} Volley';

export const TROOP_ACTION_GROUP = 'troop';

/** Target average damage for the sweep's 1/2/3-action lines. */
export interface TroopSweepDamage {
  one: number;
  two: number;
  three: number;
}

// Derived values land within ±1 of published per-level medians at every level with ≥5 statblocks,
// and extend past L20 (where no troops are published) on the benchmark itself instead of a
// hand-drawn slope. The factors themselves live in troopBenchmarks.ts — the editor's tier ladder
// reads them too, so a line built here reads on-benchmark there.
const ALL_LEVELS = Array.from({ length: 26 }, (_, i) => (i - 1) as CreatureLevel);

/** Per-level target averages for the three sweep damage lines, derived from the high strike column. */
export const TROOP_SWEEP_DAMAGE: Record<CreatureLevel, TroopSweepDamage> = Object.fromEntries(
  ALL_LEVELS.map((level) => {
    const high = getStatRangesForLevel(level).strikeDamage.high.average;
    return [level, { one: SWEEP_ONE_FACTOR * high, two: SWEEP_TWO_FACTOR * high, three: high }];
  })
) as Record<CreatureLevel, TroopSweepDamage>;

export function getTroopSweepDamage(level: number): TroopSweepDamage {
  const clampedLevel = Math.max(-1, Math.min(24, Math.round(level))) as CreatureLevel;
  return TROOP_SWEEP_DAMAGE[clampedLevel];
}

const DEFAULT_DIE = 6;

const dieAverage = (die: number): number => (die + 1) / 2;

const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** The base strike's dice shape; compound/flat formulas fall back to 1d6. */
function strikeDice(strike: CreatureStrike): { count: number; die: number } {
  const parsed = parseDiceComponents(strike.customDamageFormula ?? strike.damage);
  return parsed ? { count: parsed.count, die: parsed.die } : { count: 1, die: DEFAULT_DIE };
}

// All 159 published sweep/volley saves are basic Reflex at spellDC.moderate (fact 5).
const troopSaveDc = (level: number): number => getStatRangesForLevel(level).spellDC.moderate;

// Published sweeps widen to a 10-ft emanation for reach weapons (skeleton-infantry's longspears).
function emanationDistance(strike: CreatureStrike): number {
  for (const trait of strike.traits ?? []) {
    const match = /^reach-(\d+)$/.exec(trait);
    if (match && parseInt(match[1], 10) >= 10) return 10;
  }
  return 5;
}

interface RiderComponent {
  die: number;
  type: string;
}

function riderComponent(strike: CreatureStrike): RiderComponent | undefined {
  const rider = strike.extraDamage?.find((part) => part.category === 'persistent');
  if (!rider) return undefined;
  return {
    die: parseDiceComponents(rider.formula)?.die ?? DEFAULT_DIE,
    type: rider.damageType || strike.damageType
  };
}

// Secondary components escalate slower than the main line: 1 die → 2 dice → 2 dice (fact 4).
const RIDER_DICE_BY_LINE = [1, 2, 2] as const;

const renderInstance = (formula: string, type: string): string =>
  /[+-]/.test(formula) ? `(${formula})[${type}]` : `${formula}[${type}]`;

function sweepDamageMacro(
  line: 1 | 2 | 3,
  base: { count: number; die: number },
  target: number,
  type: string,
  rider: RiderComponent | undefined
): string {
  const riderFormula = rider ? `${RIDER_DICE_BY_LINE[line - 1]}d${rider.die}` : undefined;
  const riderAverage = riderFormula ? parseDiceFormulaAverage(riderFormula) : 0;
  // The rider spends part of the line's budget (hell hound's 1d8+7 + 2d6 fire sums to the
  // level median).
  const mainFormula = fitTroopLineFormula(Math.max(target - riderAverage, 0), base.die);

  if (!rider || !riderFormula) {
    return `@Damage[${renderInstance(mainFormula, type)}|options:area-damage]`;
  }
  // Comma-joined instances in ONE macro with a readable label — the published grammar for
  // secondary components (hell-hound-pack, omox-slime-pool); two macros would double-card the roll.
  const label = `${mainFormula} ${type} damage plus ${riderFormula} ${rider.type} damage`;
  return `@Damage[${renderInstance(mainFormula, type)},${riderFormula}[${rider.type}]|options:area-damage]{${label}}`;
}

/**
 * Build the canonical 1-to-3-action troop sweep from a melee strike (fact-3 markup: glyph
 * header, Frequency once per round, effect sentence, three glyph-numbered damage lines).
 */
export function buildTroopSweep(
  strike: CreatureStrike,
  level: number,
  opts: { name?: string } = {}
): CustomAbilityDefinition {
  const name = opts.name ?? TROOP_SWEEP_NAME_TEMPLATE.replace('{strike}', strike.name);
  const targets = getTroopSweepDamage(level);
  const base = strikeDice(strike);
  const rider = riderComponent(strike);
  const distance = emanationDistance(strike);
  const dc = troopSaveDc(level);

  const lineTargets: Record<1 | 2 | 3, number> = { 1: targets.one, 2: targets.two, 3: targets.three };
  // Labeled (rider) macros end in "…damage" already; only plain lines take the trailing word
  // (published: hobgoblin's "…|options:area-damage] damage" vs hell hound's "…{…fire damage}</p>").
  const damageLines = ([1, 2, 3] as const).map((line) =>
    `<p><span class="action-glyph">${line}</span> ${sweepDamageMacro(line, base, lineTargets[line], strike.damageType, rider)}${rider ? '' : ' damage'}</p>`
  );

  const description =
    '<p><span class="action-glyph">1</span> to <span class="action-glyph">3</span></p>' +
    '<p><strong>Frequency</strong> once per round</p><hr />' +
    `<p><strong>Effect</strong> The troop engages in a coordinated melee attack against each enemy in a @Template[type:emanation|distance:${distance}], with a @Check[reflex|dc:${dc}|basic|options:area-effect] save. The damage depends on the number of actions.</p>` +
    damageLines.join('');

  return {
    slug: slugify(name),
    name,
    img: 'systems/pf2e/icons/actions/OneThreeActions.webp',
    group: TROOP_ACTION_GROUP,
    description,
    actionType: 'action',
    actions: 1,
    traits: []
  };
}

// 2026-08-02 volley re-sweep (72 published volleys): 50 ft is a real band (3 troops, as common as
// 40), and the wide 15-ft burst belongs to 200-ft troops only — at 120 ft just 3/16 use it, at
// 200 ft 2/2 do. Fact 6's "range ≥ 120" read was too generous.
const VOLLEY_RANGE_BANDS = [30, 40, 50, 60, 80, 100, 120, 200];
const DEFAULT_VOLLEY_RANGE = 60;
const LONG_RANGE_THRESHOLD = 200;

function snapToRangeBand(range: number | undefined): number {
  if (!range) return DEFAULT_VOLLEY_RANGE;
  return VOLLEY_RANGE_BANDS.reduce((best, band) =>
    Math.abs(band - range) < Math.abs(best - range) ? band : best
  );
}

/**
 * Build the 2-action ranged volley from a ranged strike (fact-6 wording: burst within the
 * strike's range band, dice-only damage, basic Reflex, area shrink at 2 segments).
 */
export function buildTroopVolley(
  strike: CreatureStrike,
  level: number,
  opts: { name?: string } = {}
): CustomAbilityDefinition {
  const name = opts.name ?? TROOP_VOLLEY_NAME_TEMPLATE.replace('{strike}', strike.name);
  const dc = troopSaveDc(level);
  const burst = (strike.range ?? 0) >= LONG_RANGE_THRESHOLD ? 15 : 10;
  const reducedBurst = burst - 5;
  const range = snapToRangeBand(strike.range);
  const { die } = strikeDice(strike);
  const target = getTroopSweepDamage(level).two * VOLLEY_DAMAGE_FACTOR;
  const formula = fitTroopLineFormula(target, die);

  const description =
    `<p>The troop launches a ranged attack in the form of a volley. This volley is a @Template[type:burst|distance:${burst}] within ${range} feet that deals @Damage[${renderInstance(formula, strike.damageType)}|options:area-damage] damage with a @Check[reflex|dc:${dc}|basic|options:area-effect] save. When the troop is reduced to 2 segments, this area decreases to a @Template[type:burst|distance:${reducedBurst}].</p>`;

  return {
    slug: slugify(name),
    name,
    img: 'systems/pf2e/icons/actions/TwoActions.webp',
    group: TROOP_ACTION_GROUP,
    description,
    actionType: 'action',
    actions: 2,
    traits: []
  };
}

/** The generic troop attack a picked ability instantiates. */
export type TroopAttackTemplate = 'troop-battle' | 'troop-salvo';

// Picked from the ability list rather than derived from a strike, so there's no weapon to read a
// shape from: converted troops carry zero strike items (corpus fact 2). Start from the plainest
// published shape and let the GM retune dice/type/area in the editable values.
const TEMPLATE_DIE = 6;
const TEMPLATE_MELEE_DAMAGE_TYPE = 'bludgeoning';
const TEMPLATE_RANGED_DAMAGE_TYPE = 'piercing';
const TEMPLATE_RANGE = 60;
// d8/d6 carry 88% of published volleys (35+28 of 72; d4 just 5) — letting the fit roam the full
// die list produced un-published-looking 9d4/10d4 flurries for a ~0.5 damage gain.
const DIE_FACES = [6, 8];

// A volley is dice-only, so the die face decides how close the whole line can get: at L4 a d6
// target of 8.9 snaps to 3d6 = 10.5 (extreme) while 2d8 = 9 sits on the benchmark. With no weapon
// dictating the shape, pick the face that lands nearest instead of shipping an off-benchmark start.
function fitDieToTarget(target: number): number {
  return DIE_FACES.reduce((best, die) => {
    const error = (candidate: number): number =>
      Math.abs(parseDiceFormulaAverage(fitTroopLineFormula(target, candidate)) - target);
    return error(die) < error(best) ? die : best;
  }, TEMPLATE_DIE);
}

function templateStrike(name: string, ranged: boolean, level: number): CreatureStrike {
  const die = ranged ? fitDieToTarget(getTroopSweepDamage(level).two * VOLLEY_DAMAGE_FACTOR) : TEMPLATE_DIE;
  return {
    name,
    attackBenchmark: 0.5,
    damageBenchmark: 0.5,
    attackBonus: 0,
    damage: `1d${die}`,
    damageType: ranged ? TEMPLATE_RANGED_DAMAGE_TYPE : TEMPLATE_MELEE_DAMAGE_TYPE,
    isRanged: ranged,
    range: ranged ? TEMPLATE_RANGE : undefined
  };
}

/**
 * Instantiate one of the two generic troop attacks at `level` — the full published grammar with its
 * damage lines, save DC and areas, not the glossary blurb describing the pattern. This is what a
 * provider's Battle/Salvo entry expands to when it's added, so the ability lands with editable
 * values already benchmarked instead of as inert prose.
 */
export function buildTroopAttackFromTemplate(
  template: TroopAttackTemplate,
  level: number,
  opts: { name?: string } = {}
): CustomAbilityDefinition {
  const ranged = template === 'troop-salvo';
  const name = opts.name ?? (ranged ? 'Salvo' : 'Battle');
  const strike = templateStrike(name, ranged, level);
  return ranged ? buildTroopVolley(strike, level, { name }) : buildTroopSweep(strike, level, { name });
}

/** The troop attack an ability's parsed lines say it is, or undefined if it isn't one. */
export function troopAttackKindOf(ability: SpecialAbility): TroopAttackTemplate | undefined {
  const lines = (ability.scalableValues ?? []).filter((v) => v.type === 'damage' && v.troopLine !== undefined);
  if (lines.length === 0) return undefined;
  return lines.some((v) => v.troopLine === 'salvo') ? 'troop-salvo' : 'troop-battle';
}

