# PF2E Creature CRISPR

A **creature builder for Pathfinder 2e on Foundry VTT.** Build balanced NPCs to the PF2e
creature-building benchmarks — pick a level and a role, fine-tune by benchmark, and it writes a
ready-to-play NPC actor. Change the level and every stat rescales.

- **System:** Pathfinder 2e (`pf2e`) 8.0.0+
- **Foundry:** v14
- GM tool

## What it does

- **Build by benchmark.** Choose a level (−1 to 24) and a **role template** — Baseline, Brute,
  Soldier, Skirmisher, Sniper, Magical Striker, Caster, or Skill Paragon — then tune any stat
  along the PF2e benchmark scale (*terrible → low → moderate → high → extreme*). AC, HP, saves,
  Perception, ability modifiers, skills, strikes, and spellcasting are computed to match the
  level, with a live statblock preview.
- **Re-level in place.** Change a creature's level and every stat re-derives to that level's
  benchmarks — no manual math.
- **Import & back-solve.** Pull in an existing NPC from your **world** or the **Bestiary**;
  Creature CRISPR reverse-engineers its benchmarks so you can rescale or adjust it.
- **Manage.** Duplicate, edit, **Save As** a copy, export a creature to JSON, or delete.

Saved creatures are **ordinary PF2e NPC actors** in a top-level **“Creature CRISPR”** folder —
drop them on scenes, open their sheets, and use them like any other actor.

## Open the builder

GM only. Click **Creature CRISPR** at the top of the **Actors** sidebar, or run:

```js
game.modules.get('pf2e-creature-crispr').api.open()
```

## A typical build

1. **Create New** (or **Import** from your world / the Bestiary).
2. Set a **name** and **level**.
3. Pick a **role template** as a starting point.
4. Tune the sections — **Abilities**, **Defenses** (incl. resistances & weaknesses), **Skills**,
   **Offense** (strikes), **Spellcasting**, **Special Abilities** — watching the statblock update.
5. **Save.** The NPC lands in the *Creature CRISPR* folder, ready to play.

Re-open it any time to **re-level**, **duplicate**, or **export**.

## Install

In Foundry: **Add-on Modules → Install Module**, and paste the manifest URL:

```
https://github.com/rune-goblin/pf2e-creature-crispr/releases/latest/download/module.json
```

Then enable **PF2E Creature CRISPR** in your world under **Manage Modules**. Requires the
Pathfinder 2e system.

## Development

Building, running, and testing the module: see **[DEVELOPMENT.md](DEVELOPMENT.md)**. The
end-to-end test harness has its own guide in [`src/tests/e2e/`](src/tests/e2e/README.md).

## License

This module's own code is [MIT](LICENSE).

The MIT license covers only this module's code. It grants no rights to Paizo intellectual
property — Pathfinder rules text, names, and other Paizo content require their own license
(<https://paizo.com/licenses>). Any included PF2e-system code is distributed under Apache 2.0;
comply with its terms (<https://github.com/foundryvtt/pf2e/blob/v14-dev/LICENSE>).
