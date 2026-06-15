# Changelog

Notable changes to **this template**. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions track the template's
own `package.json`.

This file documents the template itself — `npm run init` removes it so each module
generated from the template starts its own history.

## [Unreleased]

### Added

- `npm run remove-example-files` (`scripts/removeExampleFiles.ts`) — strips the worked example
  for a clean slate: deletes the demo window (`src/ui/`), the Rune Goblin badge art, and the
  *Open Example* macro, and trims `src/index.ts`, `module.json` (`packs: []`), and `lang/en.json`
  back to a minimal skeleton that still builds, type-checks, and loads. A one-shot — like
  `init`, it removes its own npm script and self-deletes. The example is a demonstration to
  learn from, not a base class to extend in place.
- The example dialog shows a Rune Goblin badge (`src/ui/components/example/RuneGoblinBadge.svelte`) wired to the
  served assets **by path** — the goblin via `<img src>`, the title SVG `fetch()`ed and inlined
  so its shapes animate on hover. Nothing is bundled or embedded. Adds `src/constants.ts`
  (`MODULE_ID`) for building such `modules/<id>/…` paths.
- A `macros` compendium pack with an **Open Example** script macro
  (`game.modules.get('<id>')?.api?.open()`) so the example window opens from the macro bar or
  compendium, no console needed. Doubles as the template's first worked example of the
  compendium-pack workflow (`packs/_source/macros/*.json` → `npm run build` → `packs/macros`),
  and survives `npm run init` — the macro carries the generated module's id, not the template's.
- `npm run deploy` (`scripts/deploy.ts`) — builds, then copies a clean, link-free,
  self-contained module into Foundry (`module.json`, `dist`, `lang`, `packs` minus
  `_source`/locks, `assets`). The same shape the release zip ships; use it to test the
  shipped artifact or install without the repo present.
- A top-level `assets/` directory as the **single source for module art** (beside `lang/`/`packs/`,
  not under `src/`, which is for built code). **One source, one output**: art ships once as a
  served file at `modules/<id>/assets/…` and is referenced by that path from both content and
  code — never `import`ed (a lib-build import would inline a second copy into the bundle). Matches
  how kingmaker / abomination-vaults ship art. The release zip and `npm run deploy` include it;
  `npm run init` skips it when rewriting the module id.
- `fvtt` CLI (`@foundryvtt/foundryvtt-cli`) as a pinned dev dependency, with `npm run
  pack` / `npm run unpack` scripts — no global install needed, reproducible in CI.
- `tsconfig.node.json` and a third `npm run check` pass that type-check the tooling
  (`vite.config.ts`, `svelte.config.ts`, `scripts/*.ts`), backed by `@types/node`. The
  "TypeScript everywhere, including tooling" rule is now actually enforced.
- `.nvmrc` (Node 22.12.0); the release workflow reads it via `node-version-file`, so CI
  and `engines.node` no longer drift.
- `npm run init` fills the `module.json` author and `url`/`manifest`/`download` URLs from
  your GitHub owner (auto-detected from the repo's `origin`, or `--org`) and `git config
  user.name` (or `--author`). The committed template ships `<your-org>`/`<your-name>`
  placeholders — no personal identity baked in.

### Changed

- Compendium packs now **build from `packs/_source/` on `npm run build`** (`scripts/pack.ts`);
  the built LevelDB under `packs/<name>` is gitignored, like `dist/`, instead of committed. So
  the shipped pack always matches the tracked sources and the current module id — `npm run init`
  rewrites the `_source` JSON (it no longer skips `packs/`), and the next build regenerates the
  LevelDB with the new id. A locked pack (Foundry open) is skipped with a warning, not a failure.
- `npm run setup` now installs the module as a **real directory** in Foundry whose entries
  (`module.json`, `dist`, `lang`, `packs`, `assets`) symlink back to the repo, replacing the
  old whole-repo symlink. The whole-repo symlink exposed `node_modules`/`.git` to Foundry's
  file picker, made the repo's own `module.json` the one Foundry loaded, and — since `src/`
  isn't shipped — meant any non-symlink install (a release zip, a copied folder) carried no
  assets. Vite HMR still works unchanged (the `:30001` reverse-proxy intercepts the bundle).
- The release zip now ships `assets/` alongside `dist lang packs`, so published modules
  include their art instead of 404'ing on every referenced image.
- `npm run setup` now resolves a single Foundry data dir and creates three
  consistently named reference links (`_pf2e-source`, `_foundry-data`,
  `_foundry-modules`). Dropped the multi-version (v13/v14) scan and the `-v14` link
  suffix, matching the template's v14-only stance.
- Pinned the `foundry-pf2e` dev dependency to a commit (no tags exist upstream) so
  `npm ci` is reproducible and can't shift under a force-push.
- The example's Svelte components moved from `src/ui/` into `src/ui/components/example/`,
  separating the ApplicationV2 *shell* (`ExampleApp.ts`, kept at `ui/`) from the Svelte
  *views* and modelling a one-folder-per-feature layout. Cross-tree imports now use the
  `@ → src` alias (already configured in `vite.config.ts`/`tsconfig.json`, previously unused)
  rather than deep `../../` paths.

### Fixed

- `ExampleApp`'s window title was a hard-coded string while `lang/en.json`'s `title` key went
  unused — a no-hard-coded-strings violation in the file meant to be exemplary. The title now
  resolves through that lang key (ApplicationV2 localizes `window.title`).
- The bundled skill said "start from `pf2e-module-template`" — a module id `init` can't rewrite
  (it leaves `.claude/` alone), so it read as a stale id in generated modules. It now names the
  `runegoblin-foundrytemplate` template repo.
- `ExampleApp` mounted a fresh Svelte component on every ApplicationV2 render without
  unmounting the previous one — a leak (and loss of reactive state) on any re-render.
  It now mounts once and reuses the node. Same fix applied to the bundled skill's
  documented pattern.
- `.gitattributes` marked pack *sources* (`packs/_source`) as binary alongside the built
  LevelDB, killing diffs on the hand-edited JSON. Sources are now text + diffable; only
  built packs stay binary.

## [0.1.0]

### Added

- Initial template: v14-only TypeScript + Svelte 5 + Vite stack; a Svelte 5 UI mounted
  in an ApplicationV2 shell; compendium pack workflow; `npm run init` rename; `npm run
  setup` dev linking; a tag-driven GitHub release workflow; and the bundled
  `foundry-pf2e` Claude Code skill.
