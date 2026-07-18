// Generators for the two published troop attack actions: the 1-to-3-action sweep (151/162
// published troops) and the 2-action ranged volley (73/162). Grammar and numbers follow the
// 2026-07-18 corpus sweep recorded in docs/plans/troop-conversion-v2.md.

import type { CreatureStrike } from './models';
import type { CustomAbilityDefinition } from './contracts';
import type { CreatureLevel } from './creatureStatTables';
import { adjustDamageFormulaToAverage, getStatRangesForLevel } from './creatureStatTables';
import { parseDiceComponents, parseDiceFormulaAverage } from './abilityScaling';

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

/**
 * Per-level target averages for the three sweep damage lines. Published per-level medians
 * (162-troop corpus), smoothed monotonically; levels −1..1 and 17..24 extrapolated on the
 * same slope.
 */
export const TROOP_SWEEP_DAMAGE: Record<CreatureLevel, TroopSweepDamage> = {
  [-1]: { one: 3,    two: 7,    three: 10 },
  [0]:  { one: 3,    two: 7.5,  three: 10.5 },
  [1]:  { one: 3,    two: 8,    three: 11 },
  [2]:  { one: 3.5,  two: 8.5,  three: 11.5 },
  [3]:  { one: 3.5,  two: 9.5,  three: 13 },
  [4]:  { one: 3.5,  two: 11,   three: 14 },
  [5]:  { one: 4.5,  two: 12,   three: 16 },
  [6]:  { one: 4.5,  two: 13,   three: 18 },
  [7]:  { one: 5.5,  two: 15,   three: 20 },
  [8]:  { one: 5.5,  two: 16.5, three: 22 },
  [9]:  { one: 6.5,  two: 18,   three: 24.5 },
  [10]: { one: 7,    two: 19.5, three: 26.5 },
  [11]: { one: 7.5,  two: 21,   three: 28.5 },
  [12]: { one: 8,    two: 22.5, three: 30 },
  [13]: { one: 8.5,  two: 24,   three: 32 },
  [14]: { one: 9,    two: 25.5, three: 33.5 },
  [15]: { one: 9.5,  two: 26.5, three: 34.5 },
  [16]: { one: 10,   two: 27.5, three: 36 },
  [17]: { one: 10.5, two: 28.5, three: 37.5 },
  [18]: { one: 11,   two: 29.5, three: 39 },
  [19]: { one: 11.5, two: 30.5, three: 40.5 },
  [20]: { one: 12,   two: 31.5, three: 42 },
  [21]: { one: 12,   two: 32,   three: 43 },
  [22]: { one: 12.5, two: 33,   three: 44 },
  [23]: { one: 12.5, two: 33.5, three: 45 },
  [24]: { one: 13,   two: 34,   three: 46 }
};

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

// d4 sweeps cap at 4 dice; past the cap only the flat mod grows (fact 4, wight pattern).
const capDice = (count: number, die: number): number => (die === 4 ? Math.min(count, 4) : count);

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
  const formula = strike.customPersistentFormula ?? strike.persistentDamage;
  if (!formula) return undefined;
  return {
    die: parseDiceComponents(formula)?.die ?? DEFAULT_DIE,
    type: strike.persistentDamageType ?? strike.damageType
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
  const mainDice = capDice(base.count * line, base.die);
  const riderFormula = rider ? `${RIDER_DICE_BY_LINE[line - 1]}d${rider.die}` : undefined;
  const riderAverage = riderFormula ? parseDiceFormulaAverage(riderFormula) : 0;
  // The rider spends part of the line's budget (hell hound's 1d8+7 + 2d6 fire sums to the
  // level median), and published sweeps never carry negative mods — floor at dice-only.
  const mainTarget = Math.max(target - riderAverage, dieAverage(base.die) * mainDice);
  const mainFormula = adjustDamageFormulaToAverage(`${mainDice}d${base.die}`, mainTarget);

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

const VOLLEY_RANGE_BANDS = [30, 40, 60, 80, 100, 120, 200];
const DEFAULT_VOLLEY_RANGE = 60;
const LONG_RANGE_THRESHOLD = 120;

// Published volleys land at ~0.8× the 2-action sweep line — dice-only drops the sweep's flat
// mod (hobgoblin 4d6=14 vs 2d8+9=18; skeleton-infantry 17 vs 20.5; L13 bolt salvos 18 vs 24).
const VOLLEY_DAMAGE_FACTOR = 0.8;

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
  const range = snapToRangeBand(strike.range);
  const { die } = strikeDice(strike);
  const target = getTroopSweepDamage(level).two * VOLLEY_DAMAGE_FACTOR;
  const diceCount = Math.max(1, Math.round(target / dieAverage(die)));

  const description =
    `<p>The troop launches a ranged attack in the form of a volley. This volley is a @Template[type:burst|distance:${burst}] within ${range} feet that deals @Damage[${diceCount}d${die}[${strike.damageType}]|options:area-damage] damage with a @Check[reflex|dc:${dc}|basic|options:area-effect] save. When the troop is reduced to 2 segments, this area decreases to a @Template[type:burst|distance:${burst - 5}].</p>`;

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
