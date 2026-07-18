# E2E five-spec repair — list-view drift + two real UI bugs

**Audience:** a CRISPR session with no other context. Everything needed is restated here.
**Requested by:** Mark, 2026-07-18, after the troop-conversion-v2 run got the harness healthy and a
full-suite run showed 7 passed / 5 failed. Root causes below were diagnosed that day from run
artifacts + git archaeology; the failure signatures are pinned evidence, re-verify before fixing.
**Execution mode:** autonomous, wave-by-wave, via the agent/model matrix in §Execution protocol.
**Goal:** the full Playwright suite green (12/12) with the two genuine UI bugs fixed in product
code — not papered over in the specs.

## Why this exists

Five e2e specs fail deterministically on main. Three (`delete`, `duplicate`, `kebab-menu`) are
**stale specs** left behind by a deliberate June UI refactor — they assert row markup that no
longer exists. Two are **real product bugs** the specs correctly catch: bulk delete leaves a ghost
row in the list (`multiselect`), and the IWR type-dropdown re-renders under the cursor so it can't
be clicked (`_iwr-shot`). Because the stale specs fail loudly, the suite has been red so long that
a genuinely new regression would drown; getting to 12/12 restores the suite as a signal.

## Verified facts (diagnosed 2026-07-18; re-verify signatures before each fix)

### The failure signatures (from `npx playwright test` on main @ d1de29e, harness healthy)

1. **`delete.spec.ts`** — times out (1.0m) waiting for
   `.creatures-table tbody tr … [aria-label="Delete creature"]`. That inline row button no longer
   exists (see fact 6).
2. **`duplicate.spec.ts`** — identical mode: waits forever for `[aria-label="Duplicate creature"]`.
3. **`kebab-menu.spec.ts`** — menu OPENS fine (the portal regression it guards is still fixed);
   fails only on `expect(menu.locator('.ram-item')).toHaveCount(7)` — resolves to **6**, 23
   polls over 10s, deterministic (kebab-menu.spec.ts:28).
4. **`multiselect.spec.ts`** — everything passes THROUGH the bulk delete: seeding, search-filter
   isolation, shift+click range select, select-all/clear, dropdown, confirm dialog. The
   world-side poll (`game.actors.get(id)` for all 4 ids → 0 remaining) **passes** — the actors
   really are deleted. Then `expect(rows).toHaveCount(0)` fails: **1 table row lingers** for the
   full 10s (23 polls, deterministic across 2 runs) (multiselect.spec.ts:76).
5. **`_iwr-shot.spec.ts`** — times out (1.0m) clicking `.tfm-menu .tfm-opt:not([disabled])` in the
   editor's Defenses → Resistances cell. Historic runs logged a loop of "element was detached"
   (2026-07-11 memory): the menu mounts, then its nodes are continually re-created, so Playwright
   never gets a stable click target.

### Spec-vs-UI archaeology (the three stale specs)

6. **Row actions moved into the kebab on 2026-06-18** (commit `04a6a83` "crispr"). Before that
   (`3499fa0` "test harness", 2026-06-16 — the commit that authored `delete`/`duplicate` specs),
   each row had inline `action-btn` buttons `aria-label="Duplicate creature"` / `"Delete creature"`.
   Since `04a6a83` a row has ONE inline button (`aria-label="Edit creature"`,
   CreatureListView.svelte:493) plus a `RowActionsMenu` kebab. The two specs were never updated.
7. **The kebab had 7 items when its spec was written** (`04a6a83`, same commit): "Edit creature"
   was item 1 of the menu. "Edit" later moved out to the dedicated row button, leaving **6**:
   Duplicate, Open actor sheet, Reveal in sidebar, Move to CRISPR folder, Remove from CRISPR,
   Delete actor (danger, dividerBefore) — CreatureListView.svelte:500-507. The evolution was
   deliberate (three commits refined it; multi-select built on top of it in `a3f8039`,
   2026-07-13). The spec's `toHaveCount(7)` is the only stale line; its real payload — the
   portal regression guard (opens, stays open, closes on outside click; comment at
   kebab-menu.spec.ts:4-6) — still passes.
8. **`multiselect.spec.ts` was added 2026-07-13** (`a3f8039`), AFTER the 2026-07-11
   stash-verified known-failure sweep, so it was never baselined; first full-suite run was
   2026-07-18. Diff-verified NOT caused by the troop-v2 waves (they touched only
   CreatureEditor.svelte header/dialog, `store.convertToTroop`'s signature, and two services —
   never CreatureListView or the delete path).

### The two real bugs — where to look

9. **List refresh (multiselect ghost row):** `CreatureListView.svelte` keeps
   `let creatures = $state<CreatureEntry[]>([])` (line 26), refreshed by `refreshCreatures()`
   (line 120, reads `getAllCreatures()`), driven by `Hooks.on('createActor'|'updateActor'|
   'deleteActor', refreshCreatures)` registered on mount (lines 127-134) plus manual calls after
   list operations (155, 174, 212, 249, 265). Bulk delete removes all actors from the world (the
   poll proves it) yet one row survives ≥10s — so the final refresh either never fires or reads a
   stale snapshot. Suspects to investigate, not conclusions: hook timing vs
   `Actor.deleteDocuments` batching; the searched/filtered derived rows not recomputing; hook
   handlers unregistered by a remount; `getAllCreatures()` caching. Single-delete via the kebab
   should get a regression check too once `delete.spec.ts` drives it (same pipeline).
10. **TypeFilterMenu instability (`_iwr-shot`):** the `.tfm-*` classes belong to
    `ui/components/widgets/TypeFilterMenu.svelte`, used by `IwrChipCloud.svelte` (the failing
    path: Defenses → Resistances cell) and also `DetailsSection`, `SkillsSection`,
    `BasicInfoSection`. The "element was detached" loop means the option nodes are re-created
    continuously while open. Prior art in-repo: `RowActionsMenu` had the same family of bug and
    was fixed by portalling out of the `overflow:auto` container (kebab-menu.spec.ts:4-6 comment;
    also the popover-portal principle: portal to the `.application` root, `position:fixed` —
    in-place renders get clipped by container overflow and self-close/re-render on focus-scroll).
    Whether tfm's exact defect is the same (focus-scroll close loop) or an `$effect`/keyed-each
    re-render loop is the first thing the wave must establish — with the menu open in a live
    editor, watch the DOM (Playwright trace or `page.evaluate` MutationObserver counts).
11. **`_iwr-shot.spec.ts` is a diagnostic, not a real spec:** underscore-prefixed, console.logs a
    "COMPLAINT" answer, takes a screenshot (`iwr-resistance.png` at repo root — untracked debris
    when it runs), asserts almost nothing. Its underlying scenario (a resistance carrying an
    exception AND a double-vs entry simultaneously) is worth a real regression spec.

### Harness facts (hard-won; the run environment for every wave)

12. Verification stack, all healthy as of 2026-07-18: Foundry **14.364** (unversioned app path
    `/Applications/Foundry Virtual Tabletop.app`), pf2e **8.3.0**, world `pf2e-tesbed` current
    (no migration pending). The harness boots its own Foundry on **:30005** from
    `test/foundry-data/` (`npm run test:e2e` = build + all specs; `npx playwright test <spec>` =
    one spec against current `dist/` — **rebuild `dist` first if src changed**:
    `npm run build`).
13. **Stale-license gotcha (masquerades as the migration gate):** after a desktop Foundry update,
    the COPY of `license.json` in `test/foundry-data/Config/` fails signature verification; the
    server boots to the license screen and `global-setup` reports the same "No active world at
    this port" as the migration gate. Diagnose via `test/foundry-data/Logs/error.*.log`
    ("Software license verification failed"); fix by re-copying
    `~/Library/Application Support/FoundryVTT/Config/license.json` over the test copy. Fixed
    2026-07-18; will recur on the next Foundry update.
14. Suite hygiene: `reuseExistingServer` is on — check `lsof -ti:30005` for strays before
    trusting a run. Specs use `__e2e_`-prefixed throwaway actors cleaned in
    `afterEach`/`finally`, but a timed-out spec can leak them into `pf2e-tesbed` — sweep
    leftovers (`game.actors` names starting `__e2e_`) before the final full-suite run.
    Full suite ≈ 5 min; failed-run artifacts land in `test-results/` (gitignored).
15. Green baseline to protect: `launch`, `create-save`, `edit-rescale`, `import`, `item-drop`,
    `drop-hover-highlight`, `convert-troop` (7). Unit side: `npm run check` 0 errors,
    `npx vitest run` **571/571** at d1de29e.

## Settled decisions

1. **Specs catch up to the UI, not vice versa, for the three stale ones.** The kebab
   consolidation was deliberate and multi-select builds on it. `delete`/`duplicate` drive the
   kebab path (`.ram-trigger` → `.ram-menu` → `getByText('Delete actor'|'Duplicate')` → confirm
   dialog where applicable — `multiselect.spec.ts`'s grammar is the model); `kebab-menu` asserts
   the six current labels **by name** (robust to reordering, catches accidental drops) instead of
   a bare count. If investigation instead finds evidence the Edit-item removal or button removal
   was accidental — STOP, that's Mark's call.
2. **The two real bugs are fixed in product code.** Adding waits/retries/`force:true` to make
   `multiselect` or the iwr spec pass without fixing the underlying behavior is prohibited (STOP
   condition). The specs as written are the acceptance criteria (multiselect verbatim; iwr per
   decision 3).
3. **`_iwr-shot` is promoted to a real spec:** rename to `iwr.spec.ts` (drop the underscore),
   replace console.log/screenshot with assertions (exception chip AND double chip coexist on one
   resistance; the `add-first.double` trigger survives adding an exception), delete the
   `iwr-resistance.png` side effect. The diagnostic form is retired; its scenario lives on as a
   regression guard.
4. **Fix order is drift-first:** land the three spec realignments before the product bugs, so the
   suite's signal-to-noise improves immediately and the two bug waves each start from "exactly
   one red spec in their area".
5. **No UI redesign.** The kebab layout, menu contents, and list UX stay as shipped; this plan
   restores truthful tests and fixes two defects in the shipped design.

## Execution protocol (autonomous)

Waves are sequential; one commit per wave, message per the wave spec. Per wave:

```
1. wave-executor  (model per matrix) — implements per spec below; .svelte edits via the
   svelte:svelte-file-editor agent (or with svelte:svelte-core-bestpractices loaded)
2. test-verifier — npm run check && npx vitest run   (unit gates; must stay 0 errors / 571+)
3. orchestrator or executor — npx playwright test <the wave's spec files>   (e2e gate; rebuild
   dist first when product code changed: npm run build)
4. wave-reviewer  (model per matrix) — diff vs this doc's invariants + the wave's Done-when
5. executor fixes findings; re-review. Max 2 fix→review loops, then STOP
6. commit
```

**Agent/model matrix** — Opus everywhere: the oracle here is executable (a spec goes green
without cheating or it doesn't), and the no-cheating rules are hard STOP conditions, so reviewer
judgment is not load-bearing the way corpus fidelity was in the troop plan. **Fable is
escalation-only**: it is not pre-assigned to any wave. If a wave hits its 2-loop convergence
limit, or a W2/W3 executor and reviewer disagree on whether a fix is root-cause vs. symptom,
STOP per protocol and recommend re-running that single review gate on Fable in the report.

| Wave | Executor | Reviewer | Rationale |
|------|----------|----------|-----------|
| W1 stale-spec realignment | **opus** | **opus** | Mechanical: the target markup is pinned in this doc. |
| W2 multiselect ghost row | **opus** | **opus** | Bounded diagnosis (suspect list in fact 9); the spec is the acceptance. |
| W3 TypeFilterMenu + iwr spec | **opus** | **opus** | Shared widget, but prior art pinned (RowActionsMenu pattern); blast-radius specs gate it. |
| W4 full-suite acceptance + docs | **opus** | **opus** | Runs + documentation. |

**Verification commands:** `npm run check`, `npx vitest run`, and the targeted
`npx playwright test <files>` per wave; W4 runs the FULL `npm run test:e2e`. A red unit gate
always blocks. The e2e gate blocks per the wave's Done-when (this plan exists to make e2e
green — unlike the troop plan, e2e results DO gate here, except where a wave's Done-when says
otherwise). Preflight each session: fact-13 license check if the world won't boot, fact-14
stray/leak hygiene.

**Hard invariants the reviewer checks every wave:**
- `src/creature-builder/logic/` untouched (this plan has no kernel scope at all).
- v14 only, no v1 APIs; TypeScript everywhere; Svelte 5 runes only; comments why-only.
- The 7 green specs (fact 15) stay green; 571 vitest tests stay green; no product behavior
  change beyond the two named bugs (decision 5).
- No spec weakening: an assertion may change only to match shipped-and-deliberate UI (decision 1),
  never to accommodate a defect (decision 2).

**STOP conditions — end the run and report to Mark:**
- Evidence that any "stale spec" divergence was actually an unintended UI regression (decision 1).
- A product fix for W2/W3 that can't avoid changing UX visible outside the bug itself.
- The only way to green a spec is waits/retries/force-clicks masking live behavior (decision 2).
- Two fix→review loops on one wave without convergence; or any decision this doc doesn't settle.
  (For convergence failures and root-cause-vs-symptom disputes, the report should recommend
  re-running that wave's review gate on Fable — Mark decides.)

---

## Wave 1 — realign the three stale specs (spec-only)

**Executor: opus. Reviewer: opus. Commit:** `E2E repair W1: realign delete/duplicate/kebab specs to the kebab-menu UI`

**Files:** `src/tests/e2e/delete.spec.ts`, `src/tests/e2e/duplicate.spec.ts`,
`src/tests/e2e/kebab-menu.spec.ts`. **No product code.**

**Steps:**
1. `delete.spec.ts`: drive row kebab → `Delete actor` → confirm via the dialog
   (multiselect.spec.ts:64-71 shows the working grammar: `.ram-trigger` scoped to the row,
   `.ram-menu` at page level — it portals out of the window locator — then
   `.dialog-backdrop .dialog-button-primary`). Keep the existing world + list assertions
   EXCEPT any that hit bug 9's ghost-row behavior — if the single-delete path exhibits the same
   lingering row, keep the row-count assertion and mark the spec `test.fail()` with a comment
   pointing at W2 (it flips to passing when W2 lands; W4 removes the marker) — do NOT delete the
   assertion.
2. `duplicate.spec.ts`: same driving change (kebab → `Duplicate`); keep all assertions
   (independent "(Copy)" actor in the folder, opened in the editor — verify the current UX still
   opens the editor on duplicate before asserting it; if it doesn't, that's decision-1 evidence:
   check `handleDuplicate` in CreatureListView.svelte:151 for what it actually does and match).
3. `kebab-menu.spec.ts`: replace `toHaveCount(7)` with an exact-labels assertion for the six
   items (fact 7 list, in-order or as a set — executor's call), keep the open/portal/
   outside-click assertions verbatim.
4. Run each spec in isolation (`npx playwright test delete duplicate kebab-menu`); no dist
   rebuild needed (spec-only).

**Done when:** `kebab-menu` and `duplicate` green; `delete` green OR expected-fail solely on the
W2 ghost-row assertion (documented in-spec); unit gates untouched (no src changes); the three
specs contain no waits/sleeps added beyond Playwright's default auto-waiting.

---

## Wave 2 — multiselect ghost row (product fix in the list)

**Executor: opus (svelte edits via svelte:svelte-file-editor). Reviewer: fable.
Commit:** `E2E repair W2: list drops deleted actors' rows after bulk delete`

**Files:** `src/creature-builder/ui/components/CreatureListView.svelte` (likely), possibly the
service backing `getAllCreatures()`; `src/tests/e2e/multiselect.spec.ts` only if the
investigation proves the spec itself races (unlikely — the world-side poll already passed before
the UI assertion started; treat spec edits as decision-2 territory).

**Steps:**
1. Reproduce with instrumentation: run the spec headed or with a trace; log
   `refreshCreatures` invocations vs the four `deleteActor` hook firings; inspect whether the
   final `getAllCreatures()` still returns the ghost, or the `$state` update happens but the
   filtered/derived row list doesn't recompute (fact 9 suspect list).
2. Fix at the root. Candidate shapes (pick what the evidence supports, not the easiest):
   refresh once after the batch completes (hook on the batch, or refresh in `handleBulkDelete`
   after `deleteDocuments` resolves — line 259 area — in addition to the hooks), fix a stale
   cache in `getAllCreatures()`, or fix the derived-rows recomputation.
3. Cover it below Playwright if the seam allows: the store/service layer is vitest-testable —
   a unit test that deletion events shrink whatever collection feeds the rows. (The e2e spec
   stays the end-to-end acceptance.)
4. `npm run build`, then `npx playwright test multiselect delete` — both the bulk and (if W1
   flagged it) single-delete paths must drop rows promptly. Flip `delete.spec.ts`'s
   `test.fail()` marker if W1 set one and it now passes.

**Done when:** `multiselect` green as written; `delete` fully green (no expected-fail marker);
`npm run check` + `npx vitest run` green (571 + any new unit tests); no UX change beyond rows
disappearing when their actors do.

---

## Wave 3 — TypeFilterMenu stability + real iwr spec

**Executor: opus (svelte edits via svelte:svelte-file-editor). Reviewer: fable.
Commit:** `E2E repair W3: TypeFilterMenu stable under interaction; iwr regression spec`

**Files:** `src/creature-builder/ui/components/widgets/TypeFilterMenu.svelte` (and, if the fix is
the portal pattern, whatever shared portal helper `RowActionsMenu.svelte` uses — reuse, don't
duplicate); `src/tests/e2e/_iwr-shot.spec.ts` → renamed `src/tests/e2e/iwr.spec.ts`.

**Steps:**
1. Diagnose the detach loop (fact 10): open the menu in a live editor session and establish
   WHY option nodes re-create — focus-scroll close/reopen (RowActionsMenu's old bug), an
   `$effect` writing state it reads, an unkeyed/mis-keyed `{#each}` recreating nodes per tick,
   or parent-driven re-render. Name the mechanism in the wave report.
2. Fix in the widget. If it's the overflow/portal family, match `RowActionsMenu`'s shipped
   pattern (portal + fixed positioning + its close-handler discipline). All four consumers
   (IwrChipCloud, DetailsSection, SkillsSection, BasicInfoSection) must still work — the specs
   `create-save`/`edit-rescale`/`import` exercise some of these paths and must stay green.
3. Promote the spec per decision 3: `iwr.spec.ts` asserting (a) adding a resistance via tfm
   works, (b) after adding an exception the `add-first.double` trigger is still present, (c)
   exception chip and double chip coexist on the same resistance row. Remove the screenshot +
   console.log diagnostics and the repo-root `iwr-resistance.png` side effect.
4. `npm run build`, then `npx playwright test iwr create-save edit-rescale import` (the fix's
   blast radius), plus `kebab-menu` (shares popover machinery if a helper was extracted).

**Done when:** `iwr.spec.ts` green with real assertions; `_iwr-shot.spec.ts` gone; the named
mechanism of the bug is in the wave report; blast-radius specs green; unit gates green.

---

## Wave 4 — full-suite acceptance + docs

**Executor: opus. Reviewer: opus. Commit:** `E2E repair W4: full e2e suite green; harness docs updated`

**Files:** `src/tests/e2e/README.md`; memory updates are the orchestrator's, not this repo's.

**Steps:**
1. Hygiene sweep (fact 14): no strays on :30005, no leaked `__e2e_*` actors in `pf2e-tesbed`,
   `test-results/` cleared, dist freshly built.
2. `npm run test:e2e` — the FULL suite. Target **12/12** (7 baseline + the 5 repaired). Any
   failure here is a this-plan defect: loop it back to the owning wave's executor (counts toward
   that wave's fix→review budget).
3. README updates: the stale-license gotcha (fact 13) added to the "check the harness" section;
   the spec table updated (delete/duplicate now drive the kebab; `iwr` replaces `_iwr-shot`;
   `multiselect` + `convert-troop` rows added if absent).
4. Run `npm run check` + `npx vitest run` one final time (README-only changes shouldn't move
   them; confirm).

**Done when:** full suite 12/12 twice in a row (rules out flake-green); README current; final
report to Mark lists per-wave commits, the named root causes for the two product bugs, any
decision-1 evidence encountered (should be none), and the before/after suite tally.

## Non-goals

- No new e2e coverage beyond the five (no specs for troop options dialog, form-up, etc.).
- No list-view feature work, styling, or menu changes beyond the two bug fixes.
- No harness re-architecture (webServer strategy, ports, world choice all stay).
- No CI wiring of the e2e suite (it stays a local, manually-run suite).
- The 4-failure memory note is already superseded; final memory update happens at wrap-up, not
  as repo content.

## House rules (`CLAUDE.md`)

- v14 only, no v1 APIs; TypeScript everywhere; Svelte 5 runes; comments only for non-obvious why.
- `.svelte` edits via the svelte:svelte-file-editor agent / svelte skills, per repo tooling.
- `src/creature-builder/logic/` stays untouched and Foundry-free (no kernel scope here).
- Commit per wave; no push, no tags.
