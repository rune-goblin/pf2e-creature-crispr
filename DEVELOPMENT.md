# Developing PF2E Creature CRISPR

**TypeScript + Svelte 5 + Vite**, targeting **Foundry v14 / pf2e**. Source and tooling are both
TypeScript (`vite.config.ts`, `svelte.config.ts`, `scripts/*.ts` run on Node ≥ 22.12 — no
`tsx`/`ts-node`). No v1 Foundry APIs: ApplicationV2 / DialogV2 / DataModel only. `src/index.ts`
builds to `dist/pf2e-creature-crispr.{js,css}` — the artifacts `module.json` loads.

## Quick start

Needs Node ≥ 22.12 and a local Foundry v14 install. The `fvtt` CLI (for packs) ships as a dev dep.

```bash
npm install
npm run setup      # scaffold this module into your Foundry data dir (see below)
npm run build      # emit dist/ + compile packs; then enable the module in a world
```

Day to day:

```bash
npm run dev        # Vite HMR dev server (reverse-proxies Foundry) — browse :30001/game
npm run watch      # vite build --watch (rebuild dist/ on save, no HMR; browse :30000)
npm run check      # svelte-check + tsc --noEmit  (Vite does NOT type-check)
npm run deploy     # build + copy a clean, self-contained module into Foundry
```

### HMR

`npm run dev` runs Vite on `:30001` as a reverse proxy **in front of** a running Foundry. The
esmodule loads only inside an active world, so:

1. Start Foundry and **Launch World** (with this module enabled). First time: launch on `:30000`,
   enable the module under *Manage Modules*, reload — then it stays on.
2. `npm run dev` (leave Foundry running).
3. Open **http://localhost:30001/game** (*not* `:30000`).

Editing a `.svelte` component hot-swaps in place; editing `src/index.ts` triggers a full reload.

### `npm run setup`

Installs the module into Foundry for live dev. It resolves the Foundry data dir from
`Config/options.json` (`FOUNDRY_DATA` overrides), optionally links a `pf2e` checkout, and
scaffolds `<FoundryData>/Data/modules/pf2e-creature-crispr` as a **real directory** whose
`module.json` / `dist` / `lang` / `packs` / `assets` symlink back to the repo (not a whole-repo
symlink). Paths cache to `.dev-paths.json`. Flags: `--reconfigure`, `--no-link`, `--yes`.

| In-repo link       | Points at                    |
|--------------------|------------------------------|
| `_pf2e-source`     | your `pf2e` checkout         |
| `_foundry-data`    | `<FoundryData>/Data`         |
| `_foundry-modules` | `<FoundryData>/Data/modules` |

## Testing

- **Unit (Vitest)** — scaling math, factories, services, and the runes store, in isolation.
  Node environment; tests in `src/creature-builder/tests/`.
  ```bash
  npm test            # run once
  npm run test:watch  # watch
  npm run test:ui     # Vitest UI at localhost:51204
  ```
- **End-to-end (Playwright)** — drives the real Svelte UI in a headless Foundry v14 and asserts
  the persisted actors. Setup, the world-migration gotcha, the harness-health checks, and spec
  conventions live in **[`src/tests/e2e/README.md`](src/tests/e2e/README.md)**.
  ```bash
  npm run test:e2e:setup           # once: build the isolated test/foundry-data
  npx playwright install chromium  # once
  npm run test:e2e                 # build dist + run specs  (test:e2e:ui for the GUI)
  npm run check:e2e                # type-check the specs
  ```

## Layout

```
module.json              manifest (esmodules, styles, packs, pf2e relationship)
src/
  index.ts               hooks; exposes game.modules.get(id).api.open() + Actors-sidebar button
  constants.ts           MODULE_ID
  adventure.ts           adventure-import prompt (no-op unless an Adventure pack is registered)
  creature-builder/
    models/              creature data model, role presets, factories
    config/              benchmark → stat tables (creatureStatTables.ts)
    services/            GM-direct Foundry writes: crud, folders, import, strikes, spells…
    editor/              runes store (store.svelte.ts) — edits → live computedStats
    ui/                  CreatureCrisprApp (ApplicationV2 shell) + Svelte components
    tests/               Vitest unit tests
  tests/e2e/             Playwright harness (see its README)
assets/                  module art — served at modules/<id>/assets/…
lang/en.json             localization
packs/_source/macros/    compendium pack sources (tracked); built to packs/ (gitignored)
scripts/                 setup, deploy, pack, build-adventure, normalize-refs, setup-test-foundry
```

## Compendium packs

Sources live in `packs/_source/<name>/*.json` (tracked); `npm run build` compiles each to a
LevelDB at `packs/<name>` (gitignored, like `dist/`). Edit the JSON, then rebuild. For manual
single-pack work — close Foundry first, it locks the LevelDB:

```bash
npm run pack   -- <name> --in packs/_source/<name> --out packs
npm run unpack -- <name> --in packs --out packs/_source/<name>
```

To add a pack: create `packs/_source/<name>/`, register it in `module.json` `"packs"`, rebuild.
Distribution can also be **derived as a single Adventure** off the same sources — see
`scripts/build-adventure.ts` and the `foundry-pf2e` skill's `packs-cli.md`.

## Release

Push a tag `vX.Y.Z`; `.github/workflows/release.yml` stamps the version, type-checks, builds, and
publishes a GitHub release with `module.json` + `pf2e-creature-crispr.zip` (the zip ships
`module.json LICENSE README.md dist lang packs assets`).

## AI tooling

A project skill at `.claude/skills/foundry-pf2e/` carries the Foundry/PF2e authoring rules and
reference (API, packs, Svelte-in-ApplicationV2, the Vite build, multi-client sync); Claude Code
loads it automatically. It defers the Svelte language to `@sveltejs/mcp` (the autofixer).
