# Bug: multi-part strike damage collapses to one roll on import

Importing **Marrmora** (Monster Core 2, level 15) into CRISPR loses most of both strikes:

| Strike | PF2e item | CRISPR shows |
|---|---|---|
| Claw | `3d6+14 slashing` + `3d6 fire` + `1d6 persistent fire` | `3d6+14`, type **Fire**, persistent off |
| Flame Jet | `6d6 fire` + `2d6 persistent fire` | `3d6+14`, persistent off |

A save compounds the damage: with a level change, the Claw writes the primary roll as **fire**.

---

## Root causes

All in the strike read/write path (`services/actorQueries.ts`, `services/strikes.ts`,
`services/sync.ts`, `services/strikeItemBuilder.ts`, `logic/creatureStatTables.ts`).

1. **One primary, one rider.** `CreatureStrike` models one direct roll (`damage`/`damageType`) plus one
   persistent rider. Every other roll is invisible to the editor, to scaling, and to troop conversion.
2. **Reader and writer disagree on the primary.** `meleeItemToStrike` takes the *last* direct roll
   (Claw → `3d6 fire`); `updateMeleeItems` and `syncMeleeItemsForLevel` rewrite the *first*
   (`3d6+14 slashing`) and stamp it with the reader's type. PF2e does not order rolls by size:
   Wild Hunt Monarch's Glaive lists `1d6 sonic`, `1d6 bleed`, then `4d8+20 slashing`.
3. **The import flag omits `persistentBenchmark`.** `addBenchmarkFlagsToMeleeItems` stores
   `customPersistentFormula` but not the "rider enabled" flag, so the editor loads the rider switched off.
4. **The display is benchmark-derived.** The editor shows `scaleStrikeDamage(benchmark)`, never the item's
   formula. An unedited strike therefore displays a table formula that may differ from what it rolls.
5. **The benchmark clamps to 0–1.** 6d6 (21 avg) sits below Low (24) at level 15, clamps to scalar 0 and
   displays as the Low formula, `3d6+14`.
6. **Level changes skip extra rolls.** Secondary and persistent rolls keep their formulas verbatim at any
   level, so a level 1 Marrmora still deals `3d6` fire and `1d6` persistent fire.

## Corpus census

Every `type: "npc"` actor in the PF2e system source (12,743 strike items):

| Shape | Strikes |
|---|---|
| 1 direct roll | 10,362 |
| 2+ direct rolls | 1,822 |
| any persistent roll | 401 |
| splash or precision roll | 180 |
| no direct roll (grab-only, persistent-only) | 156 |
| total direct damage **below Low** | 2,475 |
| total direct damage **above Extreme** | 93 |

Roughly one strike in five loads wrong today (multi-part or out of band).

## Decisions (Mark, 2026-09-26)

- **D1 — Benchmark the total.** `damageBenchmark` measures the sum of the strike's *direct* rolls
  (no category). Persistent, splash, and precision rolls ride outside the benchmark. This matches
  GMG, which judges a strike by everything it deals on a hit.
- **D2 — Extrapolate out-of-band damage.** The strike damage scalar leaves [0, 1]. Below Low it encodes
  the ratio to Low (`s = avg/low − 1`, so `s ∈ (−1, 0)`); above Extreme the ratio to Extreme
  (`s = 1 + (avg/extreme − 1)`). A ratio stays positive at every level, where extending the Low→Moderate
  slope would drive a far-below value negative at low levels.
- **D3 — Scale persistent riders.** A persistent rider keeps its position on the persistent-damage table
  (Low/Moderate/High by level, ratio-extrapolated past it), independent of the strike tier.
- **D5 — The tier drives every direct roll (Mark, 2026-09-26, option 1).** Each direct roll keeps its
  authored share of the total; a level change or a tier click resizes the whole strike in those
  proportions. Splash and precision move by the same factor. Riders round to whole dice and the main
  roll absorbs the remainder, so the total lands on the tier.
- **D4 — Editable rows.** The editor lists every extra roll under the main damage line: formula, type,
  category, delete; plus an "Add damage" control. The persistent rider joins that list.

## Data model

```ts
type StrikeDamageCategory = 'persistent' | 'splash' | 'precision';

interface StrikeDamagePart {
  formula: string;            // authored at baseLevel
  damageType: string;
  category?: StrikeDamageCategory;
  baseLevel: number;
  rollKey?: string;           // the item's damageRolls key; absent on a part added in the editor
}

interface CreatureStrike {
  // ...existing fields
  damage: string;             // the main roll as authored at damageBaseLevel ('' = no direct roll)
  damageBaseLevel?: number;
  mainRollKey?: string;
  extraDamage?: StrikeDamagePart[];   // every roll except the main one, in item order
}
```

The persistent fields (`persistentDamage`, `customPersistentFormula`, `persistentDamageType`,
`persistentBenchmark`) retire from `CreatureStrike`. The reader still accepts them from legacy flags.

`ItemBenchmarkData` gains `damageOrigin?: { level: number; main: string; parts: Record<rollKey, string> }`,
the formulas at the level the user last authored them. Scaling always runs from the origin, so a round trip
L15 → L1 → L15 returns the published formulas instead of compounding rounding drift. The reader uses
the origin only while it still reproduces the item's current rolls; an edit on the PF2e sheet wins.

## Kernel (pure, `logic/strikeDamage.ts`)

- `pickMainRoll(rolls)`: the direct roll with the largest average; ties go to the first.
- `strikeDamageScalar(totalAvg, level)` / `strikeDamageAverageAt(scalar, level)`: the D2 encoding.
- `scalePart(part, level)`: level-only scaling, used for persistent riders (their table) and for strikes
  with no authored split (a custom main, a benchmark-only main). Unparseable formulas stay verbatim.
- `shapePart(formula, target)`: resize in the formula's own shape. Flat stays flat; clean dice change
  count and drop to a smaller die only when one die would overshoot; `NdM+B` scales count and bonus together.
- `resolveStrikeDamage(strike, level)` returns the main formula, each scaled part, and the averages:
  1. `target = strikeDamageAverageAt(damageBenchmark, level)` (or the custom formula's average).
  2. Every roll verbatim when `level === damageBaseLevel` and `target` is within 0.5 of the authored total.
  3. Otherwise `factor = target / authoredTotal`: each direct rider and splash/precision part is
     `shapePart(authored, avg × factor)`; the main is `shapePart(authored, target − Σ riders)`. A
     single-roll strike keeps the strike-table shape (`scaleStrikeDamage`), byte-identical to before.
- `composeDamageRolls(strike, level, existingRolls)`: the one writer. It rewrites rolls in place by key
  (keeping foreign roll fields), appends new parts, and emits `-=key` deletions for removed parts.

## Waves

**W1 — kernel.** `logic/strikeDamage.ts` + unit tests: Marrmora Claw and Flame Jet at L15 verbatim;
L1/L24 rescale; Wild Hunt Monarch primary pick; below-Low and above-Extreme round trips; clean-dice
mains stay clean; unparseable parts pass through.

**W2 — services.** Reader (`meleeItemToStrike`), import flags, `updateMeleeItems`,
`syncMeleeItemsForLevel`, `composeStrikeItemData`, the drop handler, and `actorStatsExtractor` all go
through the kernel. `computeStrikeStats` returns the resolved formulas. Legacy flags migrate on read.
Tests: every existing `strikeFidelity` case, plus Marrmora end to end (import → load → no-edit save
writes nothing → level change writes all three Claw rolls with the slashing type intact).

**W3 — editor.** `OffenseSection` renders the main formula from the kernel and the extra-damage rows;
the store gains `addStrikeDamagePart` / `updateStrikeDamagePart` / `removeStrikeDamagePart`; the
tier badge and `EffectiveDamageBar` read total direct + persistent. Below-Low / above-Extreme show
as such.

**W4 — consumers.** Troop conversion (`strikeEffectiveAverage`, `strikeDice`, `riderComponent`) reads the
main roll and parts; export and headless build through `composeStrikeItemData`. CHANGELOG entry.

## Invariants

- A no-edit same-level save writes no `system.damageRolls` (D5 preserve-unedited holds).
- The main roll keeps its damage type through every save.
- Level changes touch every roll; persistent riders scale.
- Every roll on the item appears in the editor.
