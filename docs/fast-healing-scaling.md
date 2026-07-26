# Fast Healing / Regeneration scaling

How the creature editor scales a fast-healing / regeneration amount with creature level
(`abilityScaling.ts`: `healingModerateAt`, `getFastHealingRange`, `scaleProportionally`).

PF2e publishes no official benchmark table for either ability, so both curves are fitted to
every `FastHealing` rule element in the published bestiary corpus — 92 creatures with
regeneration, 82 with fast healing after deduplicating reprints. The full analysis, charts,
and per-level corpus data live in `docs/regeneration-analysis.html`.

## The two curves

**Fast healing and regeneration are different populations** and scale on separate moderate
lines (an earlier revision fitted one table to the combined pool, which under-shot
regeneration at low level):

- **Fast healing**: `moderate = 0.82 + 0.82 × level` — the corpus linear trend, adopted exactly.
- **Regeneration**: `moderate = 7 + 1.08 × level` — 7 at level 0 rising to 34 at level 25.
  Regeneration runs a full band above fast healing on a large flat base; its ratio-to-level
  collapses as level grows (regen 20 at L5 is 4× level; regen 30 at L20 is 1.5× level).

Low/high bracket the observed spread: `low = 0.6 × mod`; `high = 1.5 × mod` (fast healing)
or `1.6 × mod` (regeneration). A `ScalableValue` of type `healing` carries `healingKind` to
pick the curve; legacy data without it is treated as fast healing and re-stamped from the
rule element on read.

## Additive rescaling (not ratio)

Flat healing amounts rescale **additively** along their moderate line:

```
new = old + (mod(targetLevel) − mod(baseLevel))
```

then snap to the published grain: regeneration ≥ 10 rounds to the nearest 5 and caps at
**50** — the highest regeneration ever printed (Treerazer, L25). A creature's spike is
preserved as an *offset*, not a *multiplier*.

Ratio scaling (the previous behaviour, `value × mod(target)/mod(base)`) explodes on spikes:
a Forest Troll's Regeneration 20 @ L5 raised to L14 became ×2.5 → 50 — the corpus all-time
ceiling, first reached at level 16. Additively it becomes 20 + 9.7 → **30**, exactly Troll
King (L10, 30) territory and one band under Troll Guard (L15, 40). Paizo's own troll family
grows the same way: 15 → 20 → 30 → 40 → 45 over levels 3 → 18.

## Table (computed, not stored)

Values below are `getFastHealingRange(level, kind)` output — derived from the formulas
above, listed for reference. Tier buttons return these (regeneration 5-snapped); the
imported value is always preserved exactly at its import level.

| Level | FH low | FH mod | FH high | Regen low | Regen mod | Regen high |
|------:|-------:|-------:|--------:|----------:|----------:|-----------:|
| 0 | 1 | 1 | 2 | 4 | 7 | 11 |
| 1 | 1 | 2 | 3 | 5 | 8 | 13 |
| 2 | 1 | 2 | 4 | 5 | 9 | 15 |
| 3 | 2 | 3 | 5 | 6 | 10 | 16 |
| 4 | 2 | 4 | 6 | 7 | 11 | 18 |
| 5 | 3 | 5 | 7 | 7 | 12 | 20 |
| 6 | 3 | 6 | 9 | 8 | 13 | 22 |
| 7 | 4 | 7 | 10 | 9 | 15 | 23 |
| 8 | 4 | 7 | 11 | 9 | 16 | 25 |
| 9 | 5 | 8 | 12 | 10 | 17 | 27 |
| 10 | 5 | 9 | 14 | 11 | 18 | 28 |
| 11 | 6 | 10 | 15 | 11 | 19 | 30 |
| 12 | 6 | 11 | 16 | 12 | 20 | 32 |
| 13 | 7 | 11 | 17 | 13 | 21 | 34 |
| 14 | 7 | 12 | 18 | 13 | 22 | 35 |
| 15 | 8 | 13 | 20 | 14 | 23 | 37 |
| 16 | 8 | 14 | 21 | 15 | 24 | 39 |
| 17 | 9 | 15 | 22 | 15 | 25 | 41 |
| 18 | 9 | 16 | 23 | 16 | 26 | 42 |
| 19 | 10 | 16 | 25 | 17 | 28 | 44 |
| 20 | 10 | 17 | 26 | 17 | 29 | 46 |
| 21 | 11 | 18 | 27 | 18 | 30 | 47 |
| 22 | 11 | 19 | 28 | 18 | 31 | 49 |
| 23 | 12 | 20 | 30 | 19 | 32 | 50 |
| 24 | 12 | 20 | 31 | 20 | 33 | 50 |
| 25 | 13 | 21 | 32 | 20 | 34 | 50 |

## Notes

- **Sanity anchors from the corpus:** regen high ≈ the troll family (Troll 20 @ L5 = high;
  Troll King 30 @ L10 ≈ high; Jotund Troll 40 @ L15 ≈ high). FH mod tracks the printed
  medians (10 through the low teens, 15–20 at L15+).
- **Grain:** every printed regeneration ≥ 10 is a multiple of 5 (distinct corpus values:
  5, 7, 10, 15, 20, 25, 30, 40, 45, 50); scaled output snaps to match.
- **Formula-valued rules** (`@item.system.badge.value * 3`, hydras) self-scale in Foundry
  and are never rewritten.
- The amount is always editable in the UI; a `customValue` is used verbatim and never
  snapped or capped.
