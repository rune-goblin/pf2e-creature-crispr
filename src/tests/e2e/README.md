# Playwright e2e harness

Browser-driven verification of the creature builder against a **headless Foundry v14**. The
vitest suite (`src/creature-builder/tests/`) covers the scaling math and services in isolation;
these specs drive the real Svelte UI in a real Foundry and assert the persisted actors.

## How it works

```
playwright test
  ├─ webServer:  bash scripts/start-test-foundry.sh   → Foundry on :30005, --world=$TEST_WORLD
  ├─ globalSetup: src/tests/e2e/global-setup.ts       → join GM, ensure module enabled, fail loud
  └─ specs:       *.spec.ts                            → open builder via api, drive UI, assert game.actors
```

One service, not two. Unlike `pf2e-reignmaker`, this repo's `npm run dev` is a *reverse proxy*
in front of a separate Foundry — not a bundle server — and `module.json` loads `dist/` by a
relative path. So the harness serves the **built bundle** from the test Foundry (the module
scaffold's `dist` symlink → repo `dist`) and Playwright talks to :30005 directly. `npm run test:e2e`
rebuilds `dist/` first, so specs always exercise current source. There is no Vite webServer.

## The specs

One operation per file — a failure names the operation that broke:

| Spec | Drives | Asserts |
|------|--------|---------|
| `launch` | `api.open()` | the workspace + Creatures list render |
| `create-save` | Create New → name/level/template → Save | an `npc` in the *Creature CRISPR* folder with the `creatureData` flag + plausible AC/HP |
| `edit-rescale` | open a creature → bump level → Save | HP/AC re-derived for the new level |
| `duplicate` | row kebab → Duplicate | an independent `(Copy)` in the folder, opened in the editor |
| `delete` | row kebab → Delete actor → confirm | actor removed from the world and the list |
| `import` | Import → World Actors → pick → Import | the world NPC moved into the folder + flagged |
| `kebab-menu` | row kebab (`.ram-trigger`) | the menu portals out of the table, lists its six actions **by name**, closes on outside click |
| `multiselect` | search-filter → checkbox + shift-click range → select-all/clear → bulk dropdown → Delete actors | selection counts, the bulk bar's lifecycle, all four actors *and* their rows gone |
| `iwr` | Defenses → Resistances → the type menu (`.tfm-*`) | one resistance carries an exception **and** a double-vs at once; the `add-first.double` trigger survives adding the exception |
| `item-drop` | drop `{type:'Item', uuid}` payloads on the editor frame | costed action → Actions, passive → Passives, melee → Offense; a re-drop is rejected as a duplicate |
| `drop-hover-highlight` | dragstart sniffer + dragover the editor frame | the frame highlights and the destination section announces itself; CRISPR's own ability drag highlights the frame only |
| `convert-troop` | import → Convert to Troop → Save | the persisted actor gains the Flurry action + Troop Defenses, loses its strikes, level +5, `troop` trait |
| `export-determinism` | two independent troop builds → `api.exportActorSource` | both exports carry the **same item sequence**, and re-exporting one actor is byte-identical |
| `troop-weaknesses` | convert through a registered save target that never calls `troopAdjusted` | the target still receives the `troop` trait + guideline area/splash weaknesses — conversion stamps them, not the target |
| `export-roundtrip` | build a troop → `exportActorSource` → `Actor.create` from that source | the recreated actor **is the same creature** as the CRISPR-saved one (traits, IWR, AC/HP, item composition, flag) |

Row actions live in the kebab (`.ram-trigger` → `.ram-menu`, which portals to page level), not in
inline row buttons — only *Edit creature* is still an inline `aria-label` button. `delete` and
`duplicate` drove those removed buttons until 2026-07-18.

`export-determinism` is the one spec that must compare *across* builds, so it asserts on item
identity (name/type/sort/actionType) rather than raw JSON: Foundry mints fresh `_id`s per build, so
two independent builds can never be byte-equal. Item `sort` values, by contrast, **are** stable
across builds — measured, not assumed — which is why they're part of the compared identity.

`openBuilder()` resets the editor to the list view first, because `editorStore` is a module-level
singleton that a prior spec (e.g. `duplicate`) can leave open.

That reset goes through the product's own discard path, so it handles an inherited *dirty* editor:
it clicks Cancel and answers whichever outcome follows — the confirm dialog when there are unsaved
edits, or the list view directly when there aren't. Order matters, and the ordering is load-bearing:
the cleanup runs *before* `close()`, because `CreatureCrisprApp.close()` shares the same dirty guard.
Closing a mid-edit window parks that promise on a modal confirm awaited *in-page*, which nothing on
the Playwright side can answer — the spec burns its full timeout before any assertion runs.

Because setup absorbs this, a spec may legitimately end mid-edit; `item-drop` does, and its unsaved
drops are exactly what it asserts. Don't add a save purely to protect the next spec.

## Test data is isolated

`npm run test:e2e:setup` builds `test/foundry-data/` (gitignored): a Foundry data path with its
own `Config/options.json` (port 30005), the activated `license.json` copied in, and **no
`admin.txt`** (so there's no admin password — specs join a world as a user, never `/setup`).
`systems`, `modules`, and the test world are **cloned** from your real Foundry data dir — not
symlinked — so **you can run your own Foundry while the suite runs.** Foundry takes an exclusive
LevelDB lock on every world db *and every compendium pack it can see* (~130 locks for this world:
15 world dbs, 96 pf2e system packs, the rest from enabled modules); sharing those directories
means whichever instance boots second fails to open them.

On APFS the clones are copy-on-write, so mirroring ~3 GB takes ~4 s and a few MB of real disk.
`start-test-foundry.sh` re-clones `systems`/`modules` on every boot (set
`TEST_FOUNDRY_SKIP_SETUP=1` to skip), which keeps them from drifting behind a pf2e or
sibling-module update. Two fixups make the clone work:

- The module under test keeps `dist`, `lang`, `module.json` and `assets` as symlinks to the repo,
  so a Vite build is live in the harness with no re-clone.
- Any module whose `packs` is a symlink to a repo (this one, `pf2e-reignmaker`) gets it replaced
  by a clone — otherwise the test instance locks the repo's built LevelDB and `npm run build`
  silently skips packs.

## The test world

Default `TEST_WORLD=pf2e-tesbed` (override with the env var). The module isn't enabled in any
world by default — module activation is a per-world LevelDB setting, not in `world.json`. So on
first run `global-setup.ts` joins as GM, flips `core.moduleConfiguration` to enable
`pf2e-creature-crispr`, and reloads (what Foundry's Manage Modules UI does, minus the click). The
change persists, so later runs find it already active. That mutation lands on the **clone**, not
your `pf2e-tesbed` — the world is cloned once and then left alone, so it keeps the harness state
specs accumulate. `npm run test:e2e:setup -- --reset-world` re-clones it from the original for a
clean slate.

Requirements of whatever world you point at:
- It's a **pf2e** world whose GM user has **no password** (standard for a throwaway world).
- It's already on the **current core + system version** of the running Foundry. `--world`
  refuses to auto-launch a world that needs migration, so `global-setup` fails loud with a hint.
  Fix: open that world once in your desktop Foundry, let it migrate, return to setup — then
  `--world` launches it headlessly from then on. (`pf2e-tesbed` needed this; `km2`/`stolen-lands`
  were already current.)

If `global-setup` reports `No active world at this port`, the world didn't launch — almost always
the migration gate above.

## Run it

```bash
npm run test:e2e:setup     # once (and after changing which world dir you mirror)
npx playwright install chromium   # once
npm run test:e2e           # build dist + run specs
npm run test:e2e:run       # skip the rebuild (fast iteration; dist must be current)
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:report    # open the last HTML report
npm run test:foundry       # just boot the test Foundry (manual poking; TEST_WORLD respected)
```

## Check the harness before trusting a run

A green run only means something if it ran against the **right** target. `reuseExistingServer`
is on locally, so a stray Foundry left on a port gets silently reused. Guard rails:

- `global-setup.ts` asserts `game.world.id === TEST_WORLD` and `game.system.id === 'pf2e'` and
  logs the world + module version it actually exercised — a stale/wrong server fails loud.
- Before a run, if anything's off, check for strays and kill them:
  ```bash
  lsof -ti:30005 | xargs kill    # stray test Foundry (also check :30000 / :30001)
  ```
- Your own Foundry being open is *fine* — the data path is cloned, not shared. Only a stray
  Foundry **on :30005** can hijack a run.

Two failures that *look* like the migration gate but aren't:

- **A stale license copy.** After a desktop Foundry update, the *copy* of `license.json` in
  `test/foundry-data/Config/` fails signature verification, the server boots to the license screen,
  and `global-setup` reports the same `No active world at this port`. Confirm in
  `test/foundry-data/Logs/error.*.log` ("Software license verification failed"), then re-copy:
  ```bash
  cp ~/Library/Application\ Support/FoundryVTT/Config/license.json test/foundry-data/Config/
  ```
  Expect this on every Foundry update.
- **A slow first boot after a re-clone.** Because `systems`/`modules`/`worlds` are cloned rather
  than symlinked, the **first** boot against fresh clones re-indexes ~96 pf2e packs and can blow
  `global-setup`'s 30 s `game.ready` budget — `TimeoutError: page.waitForFunction` at
  `fixtures/foundry-clients.ts:53`. **Just re-run; do not raise the timeout.** The second boot
  reuses the warm index and passes. (Bit three runs in a row on 2026-07-18.)

## Conventions for new specs

- Use the `gmPage` fixture from `fixtures/foundry-clients.ts` (worker-scoped GM login).
- Name created actors with the `__e2e_` prefix and delete them in `afterEach` (`deleteActors`).
  The world persists across runs — leave it as you found it.
- Reach Foundry APIs with `page.evaluate(() => game.…)`; drive the UI with the builder's stable
  selectors (`.list-header .btn-create`, `#basic-info-name`, `[aria-label="Increase level"]`,
  `.editor-header .btn-primary`, …). Helpers in `fixtures/creature-ui.ts`.
- **Count rows as `.creatures-table tbody tr[data-actor-id]`, never `.creatures-table tbody tr`.**
  The "No creatures match …" placeholder is a `<tr>` inside the same `<tbody>`, so an unfiltered
  locator reports 1 row exactly when the filtered set empties — i.e. precisely when a spec asserts
  zero. It also only appears when the world holds *other* creatures (otherwise the whole table is
  replaced by the empty state), so it reads as an intermittent product bug. `multiselect` lost a
  day to this.
