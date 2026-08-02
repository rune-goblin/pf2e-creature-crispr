// The damage ladder a troop's area attacks are judged against. Kept in its own module (not in
// troopActions.ts) because abilityScaling.ts needs it and troopActions.ts already imports from
// abilityScaling.ts.

/** Which line of a troop's area attack a damage value belongs to. */
export type TroopAttackLine = 1 | 2 | 3 | 'salvo';

// The sweep lines are the strike-damage benchmark columns in disguise (2026-07-25 re-sweep of all
// 156 published sweeps): 3-action = the high column (median 1.02× high), 2-action = 0.75× of it
// (= 0.92× moderate), 1-action = 0.27× (bare weapon dice). Published volleys land at ~0.85× the
// 2-action line (median 0.86 across all 62 volleys, IQR 0.75–0.93).
//
// A line means ALL the damage the element deals, summed — designers budget the line and split it
// across damage types. Measured either way the factors are the same, because 87% of published lines
// are a single term; on the 66 that split, summing reads 1.03× the high column on the full-round
// line where the leading term alone reads 0.71×. troopLineCalibration.corpus.test.ts holds both
// measurements against the live corpus.
export const SWEEP_ONE_FACTOR = 0.27;
export const SWEEP_TWO_FACTOR = 0.75;
export const VOLLEY_DAMAGE_FACTOR = 0.85;

// Where a published troop rests on the (line-scaled) 4-tier damage ladder: the 3-action line is the
// high strike-damage column, and every other line is that column times its factor — so "high" is the
// on-benchmark tier for all of them. 2/3 is the high tier's scalar in DAMAGE_TIERS.
export const TROOP_DAMAGE_TIER = 2 / 3;

/**
 * How much of the strike-damage ladder one troop attack line is worth.
 *
 * The whole ladder is scaled, not just the high column the targets derive from, so tier labels stay
 * meaningful per line: an on-benchmark troop reads the same tier on all three of its lines instead
 * of "Low" on the 1-action line purely because that line costs a third of a round.
 */
export function troopLineFactor(line: TroopAttackLine | undefined): number {
  switch (line) {
    case 1:
      return SWEEP_ONE_FACTOR;
    case 2:
      return SWEEP_TWO_FACTOR;
    case 3:
      return 1;
    case 'salvo':
      return SWEEP_TWO_FACTOR * VOLLEY_DAMAGE_FACTOR;
    default:
      return 1;
  }
}
