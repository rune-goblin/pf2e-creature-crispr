# Save fidelity + API completeness

**Audience:** a CRISPR session with no other context. Everything needed is restated here.
**Requested by:** Mark, 2026-07-19, from a full audit of the API/UI save paths. Goal: the module's
three standing requirements actually hold — (1) a complete public API for creating and modifying
actors, (2) a save never alters data the user didn't modify, (3) API and UI produce identical
results through the same commands.

## Why this exists

The audit confirmed the architecture is unified (editor and headless API share
`loadCreatureForEdit` → `EditableCreature` → `CreatureSaveTarget.createActor/updateActor` →
`onAfterSave`), and `exportActorSource` is a lossless `toObject()`. But a save **rewrites data the
user never touched**, and the public API cannot accept a submitted actor. The findings, verified
at code level:

- **F1 — `baseStats` never used on save.** `contracts.ts:59` documents `baseStats` as "exact stats
  at baseLevel — used verbatim when level is unchanged". The editor's *display* honors that
  (`store.svelte.ts` `computedStats`), but `updateCreature` (`services/sync.ts:40`) always
  recomputes from benchmarks and writes AC/HP/saves/abilities/perception unconditionally.
  Back-solve→forward (`statToScalar*`/`hpToScalar`/`spellStatToScalar` in
  `logic/creatureStatTables.ts`) is exact for in-table values but **clamps** out-of-table values
  (above extreme, below low/terrible, HP-range gaps, spell DC below moderate) — so a no-edit save
  silently moves those stats to the table boundary while the editor shows the true value.
- **F2 — stale flag `baseStats`.** The store clears `creature.baseStats` on any benchmark edit,
  but `updateCreature` writes the flag from the *old* flag (`baseStats: currentData?.baseStats`,
  `sync.ts:79`), so the cleared value never persists. Edit AC → save → reopen: editor shows the
  original imported stats, actor carries the new ones.
- **F3 — current HP reset.** Every save writes `hp: { value: stats.hp, max: stats.hp }`
  (`crud.ts:47` via `buildActorSystemFromStats`) — an injured creature is healed to full.
- **F4 — dead `levelChanged` check.** `sync.ts:69` computes `levelChanged` *after*
  `actor.update` already wrote the new level, so it is always false; the item/spell syncs run only
  because every current caller passes `benchmarks` — i.e. **they run on every save**, needed or not,
  and `updateMeleeItems`/`updateAbilityItems` (called next by the save target) write the same items
  again.
- **F5 — strike damage formulas normalized.** Import stamps only scalars
  (`strikes.ts:74-77` — persistent gets `customPersistentFormula`, main damage doesn't). On save
  `updateMeleeItems` rewrites the primary damage roll from `scaleStrikeDamage`, so `2d8+9` can
  become the table's dice shape with matched average (e.g. `2d10+7`). Average preserved, dice
  expression not — on a save with zero edits.
- **F6 — spell DC/attack flattening.** `extractSpellcastingStats` (`spells.ts:27`) takes the
  *highest* DC/attack across entries; `syncSpellcastingEntriesForLevel` writes that single value to
  **every** entry — the `isInnate` guard (`spells.ts:186`) only covers slots. Prepared DC 36 +
  innate DC 32 → both become 36 on any save. The slot layout deduced from the *first* non-innate
  entry is likewise written to *all* non-innate entries.
- **F7 — skills never persisted.** The editor edits skill benchmarks and shows computed values, but
  no code writes lore items or `system.skills` — skill edits land only in the flag; the actor sheet
  never changes. (Nothing is stripped — existing lore items survive — but the editor promises an
  edit it doesn't deliver.)
- **F8 — API cannot accept a submitted actor.** No `importActorFromSource`; `importCreatureFromActor`
  (`services/import.ts:26`) exists but isn't on `ModuleApi`; no headless create-from-`EditableCreature`
  or generic headless modify. The only exposed mutations are `convertActorToTroop` and
  `rescaleActorToLevel`.
- **F9 — UI mints phantom strikes on troops.** The WYSIWYG placeholder row (deliberate, commit
  e617965: headless paths call `dropPlaceholderStrikes`, the editor keeps its visible row) means a
  UI save of a zero-strike troop creates a real "Melee Strike" item — and `store.removeStrike`
  refuses to drop the last row, so it can't be avoided. Published/converted troops carry **zero**
  strike items; an editor Convert-to-Troop on a strike-less actor also generates a flurry from the
  fabricated placeholder.

What already round-trips clean (do not regress): IWR incl. exceptions/doubleVs; speeds
(source-read — the v8 fix in `actorQueries.ts:199`); senses; languages; traits; images;
persistent-damage riders (verbatim); secondary damage rolls; equipment/spells/effects/creature-feats
(never in any delete scope); melee/action deletes scoped to exactly the item sets the editor loads
in full.

## Settled decisions

- **D1 (F1).** The save path mirrors the display rule: when `creature.baseStats` is present and
  `creature.level === creature.baseLevel`, write `baseStats` **verbatim**; otherwise compute from
  benchmarks. `updateCreature`'s `updates` object gains `baseStats?: CreatureStats` and
  `baseLevel?: number`; `defaultSaveTarget` passes them from the `EditableCreature`.
- **D2 (F2).** The flag stores what the editor holds: `baseStats: updates.baseStats` (undefined
  after a benchmark edit — recompute-from-benchmarks is then exact on reload, since load uses the
  stored benchmarks directly). `baseLevel` stays the **import anchor** — it is the lazy-parse level
  for un-migrated ability descriptions (`strikes.ts:246`, `actorQueries.ts:477`) and must NOT
  rebase on save. `StoredCreatureData.baseStats` becomes optional (`baseStats?: CreatureStats`) —
  the runtime already emits undefined there today; document the relaxation.
- **D3 (F3).** Write `hp.max = stats.hp`; preserve current HP: read the actor's hp value/max
  *before* the update; `newValue = (oldValue === oldMax) ? stats.hp : Math.min(oldValue, stats.hp)`
  (uninjured stays full, injured stays injured, clamped to the new max).
- **D4 (F4).** Capture `previousLevel` before `actor.update`. Internal syncs in `updateCreature`
  run only when `levelChanged || benchmarksChanged` (deep-compare `updates.benchmarks` vs the
  stored flag's). `syncMeleeItemsForLevel`/`syncAbilityItemsForLevel` gate on `levelChanged` alone
  (creature-level benchmarks don't affect items). A true no-op save must issue **zero** embedded-item
  writes.
- **D5 (F5).** Do **NOT** stamp `customDamageFormula` at import — it pins the formula verbatim at
  every level and would break rescaling. Instead, preserve-when-unedited in `updateMeleeItems`
  (new `opts: { levelChanged?: boolean }`, default `true` = today's behavior; `defaultSaveTarget`
  passes the real value). Per strike, when `!levelChanged`:
  - attack: if `strike.attackBenchmark === statToScalar4(strike.attackBonus, ranges.strikeAttack)`
    (the slider wasn't moved relative to the loaded bonus), omit `system.bonus.value` from the
    update — the item keeps its actual bonus, clamped-at-load values included.
  - damage: if `strike.damageBenchmark === damageToBenchmark(parseDiceFormulaAverage(strike.damage), level)`
    and `customDamageFormula` is unchanged vs the stored flag, leave `system.damageRolls` untouched.
  - name/traits may always be included (Foundry's diff makes equal writes inert).
  When `levelChanged`, compute exactly as today. `meleeItemToStrike` already carries
  `attackBonus`/`damage` for this comparison.
- **D6 (F6).** Per-entry spellcasting benchmarks, mirroring melee items:
  - New flag key on spellcasting-entry items (`constants.ts`), data
    `{ dcBenchmark?: number; attackBenchmark?: number; primary?: boolean }`. Stamped at import next
    to the melee/ability stampers; `primary: true` on the first non-innate entry (first entry if
    all innate).
  - `extractSpellcastingStats` returns the **primary** entry's DC/attack (not the max) — the
    editor's single spellDC/spellAttack benchmark edits the primary entry only.
  - `syncSpellcastingEntriesForLevel` rewrite: primary entry's DC/attack come from
    `benchmarks.spellDC/spellAttack`; every other entry scales from its **own** flag benchmarks;
    an unflagged entry is back-solved at `previousLevel` (new opt) and only rewritten when
    `levelChanged`. Slot layout applies to the primary entry **only**; other entries' slots are
    untouched.
- **D7 (F7).** Persist skills as lore items (PF2e NPC skills *are* lore items; `system.skills` is
  prepared from them — verify the exact source shape against the local pf2e system source in
  `_pf2e-source` before writing). New `syncSkillItems(actorId, skills: Record<string, number>)`
  called by `defaultSaveTarget` with the same stats object D1 selected: create missing skill lore
  items, update `mod` when it differs, delete a skill lore item only when its skill was loaded into
  the editor and removed there. Establish empirically whether `extractSkillsFromActor` picks up
  "X Lore" items via `system.skills`; whatever is **not** loaded into the editor must never be
  deleted or modified. `createCreatureActor` creates lore items from its computed `stats.skills`.
  No-op save → zero lore writes.
- **D8 (F8).** New public API (all gated `>= 0.9.0` in docs — 0.9.0 is unreleased and already
  carries `rescaleActorToLevel`):
  - `importActorFromSource(source) → Promise<string>` — reject non-`npc` sources, strip `_id`,
    `Actor.create`, then the same flag/benchmark stamping as `importCreatureFromActor` (extract the
    shared tail into one helper).
  - expose the existing `importCreatureFromActor(actorId, { moveToFolder? })`.
  - `getEditableCreature(actorId, { saveTargetId? }) → EditableCreature` — deep-cloned
    `loadCreatureForEdit` result; throws on a missing actor.
  - `saveEditableCreature(creature, { saveTargetId? }) → Promise<string>` — validates via a new
    kernel `validateCreature(creature): string[]` (extracted from `store.validate`, which then
    delegates), `stampTroopDefaults`, then `createActor` (no `actorId`) or `updateActor`, then
    `onAfterSave`. The headless twin of the editor's Save button.
- **D9 (F9).** Troops may have zero strikes in the editor: `getStrikesFromActor` does not fabricate
  the placeholder when the actor has the `troop` trait; `store.removeStrike` allows reaching zero
  when `creature.isTroop`; the Offense section shows an empty state with its existing Add Strike
  affordance. The WYSIWYG row for **non-troop** creatures stays exactly as decided in e617965.
- **Cornerstone invariant (new, checked every wave):** loading any actor and saving it with zero
  edits changes nothing observable — no stat drift, no item writes, no formula rewrites (flag
  `updatedAt` exempt).

## Execution protocol (autonomous)

The orchestrating session runs each wave through this loop, committing between waves. Waves are
strictly sequential.

```
for each wave W1..W5:
  1. wave-executor  (opus)  — implements the wave per its spec below
  2. test-verifier  (default model) — npm run check && npx vitest run; report triaged failures
  3. wave-executor  (opus)  — fix anything test-verifier found; re-verify
  4. wave-reviewer  (opus)  — diff vs this doc's invariants + the wave's Done-when
  5. wave-executor fixes findings; re-review. Max 2 fix→review loops, then STOP
  6. orchestrator commits (one commit per wave, message per the wave spec)
```

Mark's directive: execution does not need Fable — executors and reviewers run **opus**; the
orchestrating Fable session is the final gate on each review summary.

**Verification commands** (nothing else counts as green): `npm run check` and `npx vitest run`.
The Playwright e2e suite is NOT part of the autonomous loop. W5's optional e2e spec is smoke-run in
isolation (`npx playwright test <spec>`) only if the harness boots cleanly; a harness failure
(license/hostname preflight included) is reported, not fixed, and does not block the wave.

**Hard invariants the reviewer checks every wave:**
- The cornerstone invariant above, for everything the wave touches.
- `src/creature-builder/logic/` stays Foundry-free (no `game`, `foundry`, `fromUuid`, `Hooks`).
- v14 only, no v1 APIs; TypeScript everywhere; UI strings in `lang/en.json`.
- Comments only for non-obvious *why* (global CLAUDE.md).
- No behavior change to `exportActorSource`, `applyTroopToActor`, or the stat-snapshot export
  beyond what a wave's spec states.
- The "already round-trips clean" list above does not regress.

**STOP conditions — end the run and report to Mark:**
- The cornerstone invariant can't be satisfied without a contract change beyond
  `baseStats` → optional.
- The PF2e lore-item source shape can't be established from the local system source.
- Kernel purity would be breached.
- Two fix→review loops on one wave without convergence.
- Anything requiring a decision this doc doesn't settle.

---

## Wave 1 — save-path stat fidelity (D1, D2, D3, D4)

**Commit:** `Save fidelity W1: baseStats verbatim on save, HP preservation, gated item syncs`

**Files:** `services/sync.ts`, `services/crud.ts` (`createCreatureActor` stamps
`baseStats: stats` in its flag), `services/defaultSaveTarget.ts` (pass
`baseStats`/`baseLevel`; compute `previousLevel` and pass `levelChanged` through — consumed by
W2's `updateMeleeItems` opt, plumbed now), `logic/contracts.ts` (`baseStats?:`), tests
(`services` test dirs — follow existing test placement).

**Steps:**
1. `updateCreature`: accept `baseStats`/`baseLevel` in `updates`; select
   `stats = (updates.baseStats && updates.baseLevel === level) ? updates.baseStats
   : calculateCreatureStats(level, benchmarks)`.
2. HP write per D3 (read prior value/max before `actor.update`).
3. Capture `previousLevel` before the update; `levelChanged` compares against it.
   `benchmarksChanged` = not-deep-equal vs stored flag benchmarks. Gate:
   melee/ability syncs on `levelChanged`; spell sync on `levelChanged || benchmarksChanged`.
4. Flag write per D2 (`baseStats: updates.baseStats`, `baseLevel` unchanged).
5. `cloneActor` in `defaultSaveTarget` gets the same treatment as `updateActor`.
6. Tests: verbatim write at baseLevel with out-of-table stats (e.g. AC above extreme, HP in a
   range gap — assert the actor keeps them); recompute after a benchmark edit; flag baseStats
   cleared after benchmark edit and exact-stable on reload; injured HP preserved and clamped;
   uninjured HP follows new max; no-op save issues zero `updateEmbeddedDocuments` calls
   (spy-based, shape-faithful mocks — see `pf2e-v8-prepared-speed-deleted` precedent: mock the
   `_source` speed shape faithfully or bugs hide).

**Done when:** check + vitest green; the no-op-save spy test passes; out-of-table stats survive a
no-edit save byte-identically.

---

## Wave 2 — strike fidelity (D5)

**Commit:** `Save fidelity W2: strikes preserve unedited attack/damage on save`

**Files:** `services/strikes.ts` (`updateMeleeItems` + keep `syncMeleeItemsForLevel` reachable
only on true level change — W1 already gates it), `services/defaultSaveTarget.ts` (pass
`levelChanged`), tests.

**Steps:** implement D5 exactly (the two "unedited" predicates, `levelChanged` opt defaulting to
today's behavior). Do NOT stamp `customDamageFormula` at import.

**Tests:** a strike loaded as `2d8+9` (off-table dice shape) survives a no-edit save untouched —
formula, bonus, damageType, secondary + persistent rolls all byte-identical; moving the damage
benchmark rewrites the primary roll only; a level change recomputes as today; an out-of-range
attack bonus (clamped scalar at load) survives a no-edit save; an unflagged (foreign) melee item
survives a no-edit save.

**Done when:** check + vitest green; strike no-op fidelity tests pass; rescale behavior unchanged
(existing tests stay green).

---

## Wave 3 — per-entry spellcasting (D6)

**Commit:** `Save fidelity W3: per-entry spellcasting benchmarks, primary-entry basis`

**Files:** `services/constants.ts` (new flag key), `services/types.ts` (entry-benchmark interface),
`services/spells.ts`, `services/import.ts` (stamp at both import paths), `services/sync.ts`
(pass `previousLevel`), `services/actorStatsExtractor.ts` (via `extractSpellcastingStats`), tests.

**Steps:** implement D6. Preserve `resizePreparedSlots` semantics for the primary entry (the
prepared-spell preservation logic in `spells.ts:199-222` must not regress —
`npc-spell-slot-preservation.md` covered it; its tests must stay green).

**Tests:** two-entry actor (prepared DC 36 primary, innate DC 32): no-edit save → both DCs
unchanged; +2 rescale → each entry moves per its own benchmark (36→x, 32→y, x≠y); editor spellDC
benchmark edit → primary changes, innate untouched; secondary entry slots untouched by a save;
unflagged entries untouched when level is unchanged.

**Done when:** check + vitest green; the flattening repro (36/32 → 36/36) is dead.

---

## Wave 4 — skills persistence (D7)

**Commit:** `Save fidelity W4: skill edits persist as lore items`

**Files:** new service (or extend `services/strikes.ts`-style sibling) `syncSkillItems`;
`services/defaultSaveTarget.ts`; `services/crud.ts` (`createCreatureActor`); tests.

**Steps:** FIRST establish the lore-item source shape and the `system.skills` preparation
(including how "X Lore" items surface) from the local pf2e system source (`_pf2e-source` reference
checkout — see repo README/CLAUDE for the reference paths); record the finding in a brief comment
where the shape is constructed. Then implement D7.

**Tests:** create-with-skills → lore items exist with correct mods; edit a skill → item mod
updated; remove a skill → its item deleted; an "X Lore" item (if not editor-loaded) is never
touched; no-op save → zero lore writes; baseStats.skills written verbatim at baseLevel (D1
interplay).

**Done when:** check + vitest green; a skill edited in the editor shows on the PF2e NPC sheet
(assert via the item write, not the sheet).

---

## Wave 5 — API completeness + troop zero-strike UI + docs (D8, D9)

**Commit:** `Save fidelity W5: importActorFromSource, headless get/save, troop zero-strike editor`

**Files:** `logic/editableCreature.ts` or new kernel module (`validateCreature` — kernel-pure),
`editor/store.svelte.ts` (delegate `validate`), `services/import.ts` (shared stamping helper +
`importActorFromSource`), new `services/headless.ts` (`getEditableCreature`,
`saveEditableCreature`), `src/index.ts` (`ModuleApi`), `services/actorQueries.ts` +
`services/editorHost.ts` (troop placeholder), `ui/components/sections/OffenseSection.svelte` +
`editor/store.svelte.ts` (`removeStrike`), `docs/api/README.md`, `lang/en.json` for any new UI
strings, tests. `.svelte` edits go through the `svelte:svelte-file-editor` agent (or the executor
loads `svelte:svelte-core-bestpractices`).

**Steps:** implement D8 and D9. Docs: add the four new members to the API table with `>= 0.9.0`
gates; document the `baseStats?:` relaxation in the Contracts section; note the troop zero-strike
editor behavior under "Native troops".

**Tests:** `importActorFromSource` happy path + non-npc rejection + `_id` strip;
`saveEditableCreature` create and update paths call `onAfterSave` with the right mode; validation
failure throws before any write; `getEditableCreature` returns a detached clone (mutating it
doesn't touch the store/actor); zero-strike troop: load has no placeholder, save creates no melee
item, `removeStrike` reaches zero only for troops; non-troop keeps the ≥1 row invariant.

**Optional e2e (smoke-only):** extend `src/tests/e2e/export-roundtrip.spec.ts` — import a
published creature, save with zero edits through the editor path, `exportActorSource` before/after,
deep-equal modulo `flags.<id>.creatureData.updatedAt` and `_stats`. Run in isolation only if the
harness boots; report-not-fix on harness failure.

**Done when:** check + vitest green; docs updated; the documented external-client loop
(submit source → operate → export) works end-to-end in the API surface.

---

## Non-goals

- No release/tag (0.9.0 remains unreleased; Mark releases).
- No ReignMaker-side changes.
- No renaming of generated troop abilities (`{strike} Flurry` stays — settled 2026-07-18).
- No change to the WYSIWYG placeholder row for non-troop creatures (settled in e617965).
- No un-convert / reverse troop conversion.
- No new UI beyond the Offense empty state.
