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
| `duplicate` | row → Duplicate | an independent `(Copy)` in the folder, opened in the editor |
| `delete` | row → Delete → confirm | actor removed from the world and the list |
| `import` | Import → World Actors → pick → Import | the world NPC moved into the folder + flagged |

`openBuilder()` resets the editor to the list view first, because `editorStore` is a module-level
singleton that a prior spec (e.g. `duplicate`) can leave open.

## Test data is isolated

`npm run test:e2e:setup` builds `test/foundry-data/` (gitignored): a Foundry data path with its
own `Config/options.json` (port 30005), the activated `license.json` copied in, and **no
`admin.txt`** (so there's no admin password — specs join a world as a user, never `/setup`).
`systems`, `modules`, and `worlds` are **symlinked** from your real Foundry data dir, so tests run
against the same pf2e system, the live module scaffold, and your existing worlds.

## The test world

Default `TEST_WORLD=pf2e-tesbed` (override with the env var). The module isn't enabled in any
world by default — module activation is a per-world LevelDB setting, not in `world.json`. So on
first run `global-setup.ts` joins as GM, flips `core.moduleConfiguration` to enable
`pf2e-creature-crispr`, and reloads (what Foundry's Manage Modules UI does, minus the click). The
change persists, so later runs find it already active. This **enables the module in that world**
— benign, and what you want for testing, but it does mutate `pf2e-tesbed`.

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
- Make sure the test world isn't open in your normal Foundry (LevelDB lock).

## Conventions for new specs

- Use the `gmPage` fixture from `fixtures/foundry-clients.ts` (worker-scoped GM login).
- Name created actors with the `__e2e_` prefix and delete them in `afterEach` (`deleteActors`).
  The world is shared — leave it as you found it.
- Reach Foundry APIs with `page.evaluate(() => game.…)`; drive the UI with the builder's stable
  selectors (`.list-header .btn-create`, `#basic-info-name`, `[aria-label="Increase level"]`,
  `.editor-header .btn-primary`, …). Helpers in `fixtures/creature-ui.ts`.
