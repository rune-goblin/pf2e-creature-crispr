# Changelog

Notable changes to **PF2E Creature CRISPR**. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- **Strikes keep every damage roll.** The editor modelled one direct roll plus one persistent rider,
  so a strike like Marrmora's Claw (`3d6+14 slashing + 3d6 fire + 1d6 persistent fire`) loaded as a
  bare `3d6+14` typed **fire**, and a level-change save wrote fire onto the slashing roll: the reader
  took the *last* direct roll as primary, the writer the *first*. Across the PF2e bestiary 1,822 of
  12,743 strikes carry two or more direct rolls and 180 a splash or precision roll. The main roll is
  now the largest direct roll; every other roll loads as an editable extra part (formula, type,
  category) and saves back by key.
- **Out-of-band damage loads as written.** The damage scalar clamped to Low..Extreme, so Marrmora's
  Flame Jet (`6d6`, below Low at level 15) displayed and saved as the Low formula `3d6+14`. The
  scalar now extends past the table as a ratio to Low or Extreme (2,475 published strikes sit below
  Low), and an unedited strike shows its own formula.
- Legacy imports stamped a persistent formula without its "enabled" flag, so the rider loaded
  switched off. The rider now loads from the item's roll.

### Changed

- **The damage benchmark judges the whole strike.** It measures the main roll plus direct extra
  rolls, the way the GMG does. Persistent, splash, and precision rolls ride outside it.
- **The tier drives every direct roll.** Each direct roll keeps its authored share of the strike's
  total, so a level change or a tier click resizes the whole strike in the author's proportions:
  Marrmora's Claw at level 8 reads `2d6+7 slashing + 2d6 fire`. Rolls keep their shape — dice count
  and bonus scale together, a d12 stays a d12 — and the main roll absorbs the riders' rounding so the
  total lands on the tier. Splash and precision move by the same factor.
- **Persistent riders scale on the persistent-damage table**, holding their Low/Moderate/High
  position across levels, independent of the strike tier. The item flag records each roll as
  authored, so a round trip through another level returns the published formulas.
- A save writes `system.damageRolls` only when the rolls change; a no-edit save of an off-table
  strike leaves it untouched. Rolls and the benchmark flag are written with v14's
  `ForcedReplacement`, so a removed part or a cleared custom formula no longer survives the merge.
- `CreatureStrike.persistentDamage`, `customPersistentFormula`, `persistentDamageType`, and
  `persistentBenchmark` are deprecated in favour of `extraDamage`. The item flag still mirrors the
  first persistent roll into its legacy fields for ReignMaker.

## [0.12.1] — 2026-08-03

### Changed

- **Troop lines prefer an additional die over a die's worth of flat bonus.** `fitTroopLineFormula`
  now fits the nearest whole-dice count to the line's target and keeps the flat modifier for the
  sub-die remainder only (d4 lines still cap at 4 dice, the wight pattern). A level-4 sweep reads
  `1d6 / 3d6 / 4d6` instead of `1d6 / 2d6+4 / 3d6+4`; the L3 lines stay distinct (`2d6+2` /
  `3d6+2`) because the remainder bonus survives. This deliberately trades the published corpus
  shape — Paizo's Hobgoblin Veteran Regiment carries its lines in the modifier (`2d8+9`) — for
  dice-forward formulas at the same averages; the exemplar pins now hold averages and grammar
  rather than Paizo's exact dice. Still one shaping system: generators, recommendations, curve
  snap, and rescale all move together.

## [0.12.0] — 2026-08-03

### Changed

- **A troop attack line is all the damage it deals, not its leading term.** The parser stamped the
  line on a macro's first plain-damage instance and left the rest untagged, so every line split
  across damage types was judged 30–45% under what its designer wrote — and *Damage on curve* could
  not fix it, snapping the leading term onto the whole line's target while the rider went along for
  the ride. Measured over the 66 published lines that split: the summed full-round line reads 1.03×
  the high strike column (IQR 1.000–1.028) where the leading term alone reads 0.71×. The line
  factors are unchanged — 87% of published lines are a single term, so they were already calibrated
  on the sum — and `troopLineCalibration.corpus.test.ts` now pins both readings to the live corpus.
- Each term of a split line carries `troopLineShare`, its fraction of the line. A snap distributes
  the line's target across the terms in the author's own proportions instead of redesigning the
  split, and no term is ever scored against the whole line's budget.

- **Every troop line answers for itself.** A troop can sit on its 2-action target while its full
  round drifts, so judging one anchor line per action traded one blind spot for the other. The
  1-action line is the exception — reported, never judged: at 0.27 of a round its target is finer
  than one die step, and 120 sweeps snapped exactly onto the curve still read it off-tier 21 times
  where the full-round line never missed.

- **One shaping system: the recommendation is what the generator writes.** The tier recommendation
  fitted a troop line by stacking dice (bonus capped under one die), while the generators keep the
  weapon's dice and carry the target in the flat modifier — so a freshly built on-curve line
  (`2d6+4`) was "recommended" as a different formula (`3d6`), and *Damage on curve* rewrote
  corpus-faithful lines into dice stacks (a `2d6+7` sitting exactly on its target became `4d6`).
  All four shapers — the sweep and volley generators, the tier recommendations, the curve snap,
  and proportional rescale — now share `fitTroopLineFormula`: dice never overshoot the target by
  more than half a point, the modifier carries the remainder, never negative, one die is the
  floor; sweep lines anchor to their own dice count, salvos fit a whole-dice count first. A
  generated line is its own recommendation and the snap is a no-op on an on-curve troop, at every
  level and die face.

### Added

- **`auditAbility(description, level)`** — every damage line totalled and placed on its ladder,
  every save DC classified, every unreadable element reported rather than dropped. A consumer
  auditing shipped content maps the verdicts onto its own vocabulary instead of deciding for itself
  which terms form a line and what it totals.
- A test that the builder and the auditor agree: nothing *Damage on curve* produces reads as off
  the curve, at any level or die face.

## [0.11.1] — 2026-08-03

### Fixed

- ***Damage on curve* now lands a salvo on the benchmark.** Salvo lines were held to bare dice, but
  one whole die is a wider step than the gap between adjacent tier targets — at L6 a d8 salvo had no
  dice-only count that read High at all, so the button either wrote back the formula already there
  (Berserkers' `5d6`) or overshot into Extreme. Salvos now take a flat bonus like sweeps, which the
  published corpus already does in places (Hellknight Hunter Squad's `5d6+9`, Skeleton Infantry's
  `2d6+10`). 9 of the 25 salvos in a consumer corpus could not be put on curve before; all can now.
- **A troop line whose target falls below its dice drops a die instead of clamping the bonus.**
  Flooring a negative bonus at 0 kept the larger count and overshot by most of a die — an L1 d4
  salvo aiming at 3.8 produced `2d4` (5) rather than `1d4+1` (3.5). One die remains the floor.

## [0.11.0] — 2026-08-02

### Added

- **Troop attack lines are benchmarked on their own share of a round.** A 1-to-3-action sweep aims
  at 0.27 / 0.75 / 1.0 of the high strike-damage column, but the ability editor judged every line
  against the raw damage ladder — scoring an on-target 1-action line "Low" and recommending twice
  its budget. Each line now scales the ladder by its own factor, so the tier chips and *Damage on
  curve* agree with published statblocks. Re-measured against the 158 published sweeps that carry
  all three lines.
- **Battle and Salvo expand to the real attack.** Picking either from the ability list now inserts
  the attack itself — damage lines, save DC, areas — instead of the glossary prose describing the
  pattern. A salvo fits its die face to the target, since dice-only damage snaps badly on a fixed
  d6.
- **Areas and ranges are editable values.** `@Template` distances and an area effect's "within N
  feet" range parse into `distance` values, so a Salvo exposes its range, its burst, and the burst
  it shrinks to at 2 segments without anyone editing prose.
- **Bramblewrack Hulk art** — portrait and token ship with the module, alongside strike-card and
  ability-card close-ups for the user manual.
- **Tier classification is part of the kernel API.** `classifyDamageByAverage`, `classifyDcByValue`,
  `getDamageTierAveragesForLevel`, `getPersistentTierAveragesForLevel`, `TROOP_TARGET_TIER` and the
  troop line factors are exported, so a consumer auditing content labels a value against the level
  ladder instead of reimplementing the banding and drifting from it. Verdicts carry `offScale`,
  which distinguishes a value sitting on the bottom tier from one far below the ladder.
- **`parseAbilityDescriptionWithReport`** returns the plain parse plus one entry per `@Damage` /
  `@Check` inline: scaled, skipped with a machine-readable reason, or malformed verbatim. The parser
  stays deliberately lenient; audits need to see exactly what it left alone, and that information
  was previously discarded.
- **`normalizeTroopExport`** moves into the kernel as the byte-stable source-file transform
  (volatile-state strip, migration/health resets, token pinning, item ordering, markup and key
  canonicalisation). Consumer policy stays with the consumer, passed in as options.

### Changed

- **Sweep tiers snap to dice+bonus formulas, like published statblocks.** Bare-dice rendering
  quantized to whole d6 steps and collapsed the 2- and 3-action lines onto one formula wherever the
  targets sit between steps (at level 3, both 9 and 12 became `3d6`). 98% of published 2/3-action
  sweep lines carry a flat bonus. Salvos stay dice-only, matching the published volley grammar.
- **Volley range parameters follow the published corpus** after a 72-volley re-sweep: the 15-ft
  burst belongs to 200-ft troops rather than 120-ft ones, 50 ft is a real range band, and d6/d8
  carry 88% of volley damage dice — so the generic Salvo no longer fits un-published d4 flurries.
- A "1 to 2" sweep's lines shift one rung up the share-of-round ladder: published shambler troops
  put their top line at the full-round factor, not the 2-action one. Sweep headers read "1 to N"
  instead of "1 to 3".
- *Damage on curve* on a troop attack sets each line's tier and nothing else — not the DC, not the
  areas, and never the description, which re-renders from the values it is fed.
- Troops saved before troop lines existed are backfilled on load, since stored scalable values win
  over re-parsing.

### Fixed

- **Salvos are recognised by structure, not by one English sentence.** Detection keyed on the exact
  phrase "reduced to N segments" and missed every "or fewer segments" / "or fewer squares" variant —
  8 of the 13 shipped salvos fell back to a line factor of 1 and read as far over budget. It now
  keys on the shrinking burst pair; the threshold phrase is still read, but only to label the
  shrunken burst's distance row, and it accepts those variants.
- Only a macro's first plain-damage instance is the attack line, so a secondary damage component is
  no longer benchmarked as if it were the whole thing.
- Picking a strike damage tier clears a custom damage formula, which previously outranked it and
  made the click a no-op.
- Healing classification returns the same verdict shape as damage and DCs, which also makes
  `getTierInfo`'s declared return type honest on the healing path.

## [0.6.0] – [0.10.1]

Not documented here — see the [GitHub releases](https://github.com/rune-goblin/pf2e-creature-crispr/releases)
for the commit-level notes of those versions.

## [0.5.0] — 2026-07-15

### Added

- **Author inline elements, don't just import them.** The ability description editor gains an *Add
  inline element* button: pick a saving throw, skill/Perception/flat check, damage, persistent
  damage, healing, area template, condition, or raw roll, tune it against the creature's level with
  tier chips that show the actual result up front ("Mod DC 30 / High DC 33 / Ext DC 36"), preview it
  live, and insert it at the caret. An inserted element behaves exactly like one CRISPR parsed out of
  an imported ability — checks, damage, and valued conditions land in the Editable Values panel,
  scale with level, and round-trip on export. The literal ones (flat check, healing dice, template,
  plain roll) insert as-is and don't scale, matching how the parser already treats them.
- **Bulk actions on the creature list.** Rows now have checkboxes, with a select-all in the header
  and shift+click to extend a range. Select anything and an Actions bar appears above the table:
  move into the Creature CRISPR folder, remove from CRISPR (leaving the actors in your world), or
  delete outright — the destructive two behind a confirmation naming the count. Select-all follows
  the search filter, so you can filter, select all, and act. Each bulk operation is a single Foundry
  write: one undo step, one refresh.
- **Out-of-range resistances and weaknesses are flagged.** A value outside the typical range for the
  creature's level highlights in a warning tone with a tooltip, instead of reading as normal beside a
  "typical N–M" hint.

### Changed

- **Resistances and weaknesses follow the level.** They were stored as raw numbers and sat still
  while AC, HP, and saves re-derived, so re-leveling left them behind. Changing the level — or the
  level delta from *Convert to Troop* — now rescales them to the new level's typical range, keeping
  each value's position within that range. **Note:** a resistance you hand-set to a deliberate number
  will now move when you re-level; previously it stayed put. Adding a resistance or weakness also
  defaults to the mid-range value for the current level rather than a flat `5`.
- Description edits and inserted inline elements commit together when you press *Save*; Cancel or
  Reset discards both. Save previously wrote only the template text.
- The delete footer on attack and ability cards recedes to a faint divider at rest and tints danger
  only on hover, so it no longer outweighs the card's own title. The two-step confirm is unchanged.

### Fixed

- The effective-damage bar's end captions ("Low", "Extreme") centered half past the ends of the bar
  and clipped; they now justify inward while the tick still marks the true position. An attack's tier
  chips right-align so "extreme" stops clipping off the card's right edge.

## [0.4.0] — 2026-07-12

### Added

- **Drag & drop to build.** Drop an action, creature feat, or melee attack onto the editor — from
  an actor sheet or a compendium — and Creature CRISPR detects its type and routes it to the right
  section (Actions, Passives, or Offense), highlighting the destination as you drag over it. The
  item is converted to a strike or special ability and scaled to the creature's level on drop.
- **Persistent-damage benchmarking.** Damage that includes persistent damage now shows its
  *effective* value on the benchmark bar — a span from the base hit to the expected total with an
  average marker — so you can see where the real damage output lands against the tier scale.

## [0.3.0] — 2026-06-27

### Added

- **Ability value scaling.** Special-ability scalable values now cover conditions (e.g.
  `Drained N`) alongside damage, persistent damage, DCs, and healing. Roll-type values
  (damage/persistent) show a recommended-vs-calculated comparison with min/mean/max spread,
  DCs that don't scale with level surface level-based guidance, and save-typed DCs are labelled
  by save (e.g. "Fortitude DC").

## [0.2.1] — 2026-06-27

### Documentation

- Clarified the editor extension API reference and the matching source comments: the built-in
  default `saveTargetId` (`'pf2e-creature-crispr'`), that an omitted `exportActor` makes the
  editor's "Export" button a no-op, and that `abilityProviderIds: []` surfaces no providers.

## [0.2.0] — 2026-06-22

First public release. (Earlier `0.1.x` tags never published — their release build failed.)

### Added

- **Build creatures by benchmark.** Pick a level (−1 to 24) and a role template — Baseline,
  Brute, Soldier, Skirmisher, Sniper, Magical Striker, Caster, or Skill Paragon — then tune any
  stat along the PF2e benchmark scale (terrible → extreme). AC, HP, saves, Perception, ability
  modifiers, skills, strikes, and spellcasting are computed to the level, with a live statblock
  preview.
- **Re-level in place** — change a creature's level and every stat re-derives to that level's
  benchmarks, no manual math.
- **Import & back-solve** — pull an existing NPC from your world or the Bestiary; Creature CRISPR
  reverse-engineers its benchmarks so you can rescale or adjust it.
- **Troops** — native PF2e troop support: toggle, strength thresholds, save derivation, and
  Convert to Troop.
- **Manage** — duplicate, edit, Save As a copy, export to JSON, or delete. Saved creatures are
  ordinary PF2e NPC actors in a top-level "Creature CRISPR" folder.
- **Editor extension API** — register custom ability providers and save targets at runtime via
  `game.modules.get('pf2e-creature-crispr').api` (see `docs/plans/creature-editor-extension-api.md`).

### Fixed

- CI/release builds are green: repaired the lockfile `@emnapi` peer-node gap that broke `npm ci`
  on the linux runner, pinned Node to 24 so the `.ts` build configs load, and added a
  `scripts/check-lockfile.ts` guard so the lockfile regression can't recur.
