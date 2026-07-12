# Changelog

Notable changes to **PF2E Creature CRISPR**. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
