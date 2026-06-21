# Fast Healing / Regeneration scaling

How the creature editor scales a fast-healing / regeneration amount with creature level.

- **FH low / moderate / high** — our scaling table (`getFastHealingRange` in
  `src/creature-builder/logic/abilityScaling.ts`). `moderate` is the tier-button default and the
  proportional-scaling spine; `low`/`high` are the other two tier buttons.
- **Strike dmg (mod)** — the canonical strike-damage moderate average at that level
  (`creatureStatTables.ts`), shown only as a magnitude comparison. Fast healing runs roughly
  0.4×–0.7× of it; the ratio drifts with level, which is why the damage table is not reused directly.
- **Empirical median (n)** — median of the actual `FastHealing` rule values found on published PF2e
  bestiary NPCs at that level, with **n** = how many such monsters exist. The table is fitted to these
  medians where the sample is meaningful and follows the trend where it is sparse.

PF2e publishes no official fast-healing benchmark table, so this curve is derived from the bestiary
data below. The amount is always editable in the UI and the imported value is preserved exactly at its
import level; the table only drives the Low/Mod/High tier buttons and level rescaling.

| Level | FH low | FH moderate | FH high | Strike dmg (mod) | FH mod ÷ dmg mod | Empirical median | n |
|------:|-------:|------------:|--------:|-----------------:|-----------------:|-----------------:|--:|
| -1 | 1 | 1 | 2 | 3 | 0.33 | — | 0 |
| 0 | 1 | 1 | 2 | 4 | 0.25 | — | 0 |
| 1 | 1 | 2 | 3 | 5 | 0.40 | 2 | 17 |
| 2 | 2 | 3 | 5 | 8 | 0.38 | 5 | 1 |
| 3 | 2 | 4 | 6 | 10 | 0.40 | 8 | 2 |
| 4 | 3 | 5 | 8 | 12 | 0.42 | 5 | 4 |
| 5 | 4 | 6 | 10 | 13 | 0.46 | 10 | 8 |
| 6 | 4 | 7 | 11 | 15 | 0.47 | 6 | 10 |
| 7 | 5 | 8 | 13 | 17 | 0.47 | 5 | 3 |
| 8 | 5 | 9 | 14 | 18 | 0.50 | 10 | 11 |
| 9 | 6 | 10 | 16 | 20 | 0.50 | 10 | 4 |
| 10 | 7 | 11 | 18 | 22 | 0.50 | 12.5 | 12 |
| 11 | 7 | 12 | 19 | 23 | 0.52 | 10 | 7 |
| 12 | 8 | 13 | 21 | 25 | 0.52 | 12.5 | 8 |
| 13 | 8 | 14 | 22 | 27 | 0.52 | 10 | 4 |
| 14 | 9 | 15 | 24 | 28 | 0.54 | 10 | 13 |
| 15 | 10 | 16 | 26 | 30 | 0.53 | 15 | 12 |
| 16 | 10 | 17 | 27 | 31 | 0.55 | 15 | 5 |
| 17 | 11 | 18 | 29 | 32 | 0.56 | 15 | 8 |
| 18 | 11 | 19 | 30 | 33 | 0.58 | 15 | 14 |
| 19 | 12 | 20 | 32 | 35 | 0.57 | 15 | 6 |
| 20 | 13 | 21 | 34 | 37 | 0.57 | 20 | 11 |
| 21 | 14 | 23 | 37 | 38 | 0.61 | 27.5 | 6 |
| 22 | 15 | 25 | 40 | 40 | 0.62 | 37.5 | 2 |
| 23 | 16 | 27 | 43 | 42 | 0.64 | 25 | 3 |
| 24 | 18 | 30 | 48 | 44 | 0.68 | 27.5 | 2 |

## Notes

- **Levels −1 and 0** have no bestiary creatures with fast healing (n = 0); the curve floors at 1.
- **Sparse levels** (n ≤ 4: 2, 3, 7, 9, 13, 22, 23, 24) have unreliable medians — e.g. level 3's
  median of 8 comes from just `[1, 15]`. The smooth curve intentionally follows the overall trend at
  these levels rather than the noisy local median.
- **Dynamic range:** observed fast healing spans roughly 2 → 30 across levels (~15×), wider than strike
  damage's ~5 → 44 (~9×); this is the other reason the damage table cannot substitute directly.
