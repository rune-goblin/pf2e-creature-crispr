# CRISPR: troop conversion loses movement modes

**STATUS 2026-07-19 (evening): FIXED in CRISPR — `getSpeedsFromActor` now reads `_source`.**

The true mechanism was one level below the conversion service. PF2e v8 moved prepared
movement to `system.movement.speeds` and **deletes** the prepared `system.attributes.speed`
(`src/module/actor/creature/document.ts:398` in the system repo:
`if ("speed" in this.system.attributes) delete this.system.attributes.speed;`). CRISPR's
`getSpeedsFromActor` (services/actorQueries.ts) read that deleted prepared path, got
`undefined`, and returned its `{ land: 25 }` fallback — silently, on **every** editor load:
headless `convertActorToTroop`, the editor UI, `rescaleActorToLevel`, and the stat-snapshot
export. The stored `_source.system.attributes.speed` keeps the legacy shape (it is what
`prepareBaseData` itself reads, and what `buildSpeedSystem` writes back), which is why import
and export were faithful while everything through the editor round-trip flattened to a
modeless land 25. Both symptoms (dropped modes + land→25) were this one read.

The fix: `getSpeedsFromActor` reads `_source.system.attributes.speed`. Regression coverage:
vitest (v8-faithful mocks — prepared actor *without* `attributes.speed`) in
`tests/troop.test.ts` (headless load→convert→save round-trip), `tests/exportSnapshot.test.ts`,
`tests/troopConversion.acceptance.test.ts` (kernel pass-through); e2e speed asserts in
`src/tests/e2e/convert-troop.spec.ts` against the real system (editor path + headless API
path), verified green. The old vitest mocks faked the pre-v8 prepared shape, which is how
057af04's "round-trip preserves Speed" claim tested green while live was broken.

Design check (published-corpus sweep, all 162 troops in `_pf2e-source/packs`): Paizo copies
the source creature's movement profile essentially **verbatim** — 39 troops carry
fly/swim/climb/burrow at the base creature's exact values (Gargoyle Wing fly 40, Valkyrie
Tempest fly 60, Omox Slime Pool climb 20 + swim 80); land speed is never normalised to 25
(the 25-heavy histogram just mirrors humanoid base speeds). So preserve-verbatim is the
correct rule; no normalisation layer was added.

RM next steps once CRISPR's `npm run build` output is deployed (done): re-run
`node scripts/rebuild-troops.mjs` for the affected slugs (or all 38) and verify with the
python snippet at the end of this doc.

---

**Previous status 2026-07-19: root cause isolated. `convertActorToTroop` is the culprit — still open.**

A headless probe against the dev world read Speed at each hop of the rebuild path:

```
compendium     source {"value":20,"otherSpeeds":[{"type":"fly","value":60}]}   Wyvern has fly 60
afterImport    source {"value":20,"otherSpeeds":[{"type":"fly","value":60}]}   import PRESERVES it
afterConvert   source {"value":25,"otherSpeeds":[]}                            <-- conversion DESTROYS it
afterExport           {"value":25,"otherSpeeds":[]}                            export is faithful
```

So import is innocent and export is innocent; `api.convertActorToTroop` resets Speed to the
`{ land: 25 }` default. That also collapses the two symptoms into **one** defect — the land
20 -> 25 change and the loss of `fly 60` happen in the same step, which is what a
rebuild-from-template (rather than carry-the-imported-speeds) would produce. Prime suspect
remains `applyTroopConversion` plus the `speeds: { land: 25 }` default at
`src/creature-builder/editor/store.svelte.ts:84`.

**Not fixed by commit 057af04.** That commit ("Carry Speed … through the stat-snapshot export")
fixed the editor's *Export button* path — `exportCreatureToFile` -> `buildCreatureSnapshot`.
A real sibling bug, but a different one. ReignMaker's rebuild calls `api.exportActorSource`,
which that commit did not touch, and the probe shows the data is already gone before any
export runs. Re-running `scripts/rebuild-troops.mjs` today reproduces the missing speeds
byte-for-byte — verified on `wyvern-flight`, which rebuilt to an identical file.

Reproduce the probe: the script is inlined at the end of this document.

---

Original brief follows. **Diagnose the root cause before proposing a fix** — do not patch
symptoms in ReignMaker, the defect is upstream in CRISPR.

Repos:
- CRISPR (upstream, where the bug lives): `/Users/mark/Documents/repos/runegoblin/modules/pf2e-creature-crispr`
- ReignMaker (downstream, where it was noticed): `/Users/mark/Documents/repos/pf2e-reignmaker`

## Symptom

ReignMaker builds its troops through CRISPR. Troops built from a **single creature** via the
editor's `convertToTroop` come out with their non-land movement modes deleted and their land
speed forced to 25. Troops built by **copying a published troop stat block** are perfect.

Movement modes dropped entirely — every one is a single-actor conversion:

| RM troop | Built from | Source speed | RM stored |
|---|---|---|---|
| Wyvern Flight | Wyvern | 20, **fly 60** | 25, none |
| Pixie Swarm | Pixie | 15, **fly 45** | 25, none |
| Shadow Host | Shadow | 0, **fly 30** | 25, none |
| Bog Strider Scouts | Bog Strider | 25, **swim 20** | 25, none |
| Lizardfolk Defenders | Lizardfolk Defender | 25, **swim 15** | 25, none |

Land speed additionally flattened to 25 regardless of source, same path: Giant Mammoth Riders
(Mammoth 45), Winter Wolves (Witchwarg 40), Centaur Scouts (Centaur 40), Mammoth Riders
(Elephant 40), Dire Wolves / Goblin Wolf Riders (Wolf 35), Troll Marauders (Forest Troll 30),
Berserkers (Tiger Lord 30), Frost Giant Warriors (Frost Giant 30), Shadow Host (Shadow 0 → 25).

**Control group — the copied-troop path is intact.** Sapper Squad still has burrow 10, Frog
Riders still have swim 25, Wolf Pack is still land 35, Basic Skirmishers still 30, Dwarf
Battalion still 20. These never went through `convertToTroop`, which is what isolates the
defect to that path rather than to export/save or to ReignMaker's own pipeline.

Reproduce from the ReignMaker repo:

```bash
python3 - <<'EOF'
import json
for s in ['wyvern-flight','pixi-swarm','shadow-host','bog-strider-scouts','lizardfolk-defenders']:
    d=json.load(open(f'data/troops/{s}.json'))
    print(s, d['system']['attributes']['speed'])
EOF
```

Sources to diff against live in the gitignored mirror `_pf2e-source/packs/**` (each troop's
`sourcePath` is recorded in `official-troops/troops.json`).

## Leads, in the order worth checking

1. **`applyTroopConversion`** — `convertToTroop` in `src/creature-builder/editor/store.svelte.ts`
   is a one-line delegation to it. That function is the prime suspect; find where it lands and
   read what it does to `speeds`.
2. **`speeds: { land: 25 }`** at `src/creature-builder/editor/store.svelte.ts:84`. A blank-creature
   default that would explain the exact "everything becomes 25" symptom if the conversion
   rebuilds the creature from a template instead of mutating the imported one. Confirm whether
   it is actually reached on this path before blaming it — it may just be the new-creature default.
3. **The `EditableCreature.speeds` model** — `src/creature-builder/logic/editableCreature.ts`,
   `contracts.ts`. Check whether the model can even *represent* fly/swim/burrow alongside land.
   `updateSpeed` (store.svelte.ts:541) implies a keyed record with land pinned, so the model
   probably supports it — but verify, because if the type is lossy the bug is at import, not
   conversion.
4. **The import boundary.** Distinguish two hypotheses: (a) the creature imports with its speeds
   and `convertToTroop` discards them, or (b) the creature never imports them. A single test
   that imports a Wyvern, asserts `fly 60` pre-conversion, converts, and re-asserts will separate
   these in one step. `src/creature-builder/tests/troop.test.ts` already covers `convertToTroop`
   and is the natural home.

## Questions to answer

- Which of the two hypotheses above is true — lost at import, or lost at conversion?
- Is the land-25 flattening the *same* defect as the dropped modes, or two independent ones?
  They may have different causes; do not assume one fix covers both.
- Is any of this deliberate? A troop of pixies arguably shouldn't keep a 45-foot fly speed
  unchanged, and PF2e troop stat blocks do normalise movement. If there is an intentional
  normalisation rule, the bug may be that it drops modes it should merely *reduce* — in which
  case the fix is to define the rule, not to preserve speeds verbatim. Check published troops
  built from flying creatures in `_pf2e-source` for what Paizo actually does.

## Blast radius

- CRISPR: whatever the fix touches, plus test coverage on the conversion path.
- ReignMaker: 5 troops lost a movement mode, ~10 more had land speed flattened. After an
  upstream fix, re-vendor with `CRISPR_REPO=/path/to/pf2e-creature-crispr npm run sync-crispr`
  and rebuild the affected troops through `scripts/rebuild-troops.mjs` (the canonical rebuild
  path — manifest plus re-run, never hand-edit `data/troops/*.json`).
- Player-visible today: **a wyvern flight that cannot fly**, and shadows that walk.

## Out of scope

The infantry/cavalry troop classification work that surfaced this. Movement modes matter to it,
but the classification decision is separate and already settled.

## Probe script

Run from the ReignMaker repo root (needs `npm run dev` on :30001 and a joinable dev world).
Playwright resolves from the repo's `node_modules`, so keep the file inside the repo.

```js
import { chromium } from 'playwright';
const BASE = 'http://localhost:30001';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/join`, { waitUntil: 'domcontentloaded' });
const select = page.locator('select[name="userid"]');
await select.waitFor({ timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector('select[name="userid"]')?.options.length > 1, undefined, { timeout: 30000 }
);
const users = await select.locator('option').allTextContents();
await select.selectOption({ label: users.find((u) => /gamemaster|game master|^gm$/i.test(u.trim())) });
await page.locator('button[name="join"], button[type="submit"]').first().click();
await page.waitForFunction(() => globalThis.game?.ready === true, undefined, { timeout: 120000 });

const out = await page.evaluate(async () => {
  const api = game.modules.get('pf2e-creature-crispr').api;
  // Read _source, not the prepared actor — prepared PF2e speed does not expose these fields.
  const read = (a) => JSON.stringify(a?._source?.system?.attributes?.speed ?? null);
  const steps = {};
  const pack = game.packs.get('pf2e.pathfinder-monster-core');
  const hit = (await pack.getIndex()).find((e) => e.name === 'Wyvern');
  steps.compendium = read(await pack.getDocument(hit._id));
  const id = await api.importCreatureFromCompendium(
    hit.uuid ?? `Compendium.pf2e.pathfinder-monster-core.Actor.${hit._id}`
  );
  steps.afterImport = read(game.actors.get(id));
  await api.convertActorToTroop(id, { providerId: 'reignmaker-army', formUp: true, levelDelta: 6 });
  steps.afterConvert = read(game.actors.get(id));
  const src = await api.exportActorSource(id);
  steps.afterExport = JSON.stringify(src?.system?.attributes?.speed ?? null);
  await game.actors.get(id)?.delete();
  return steps;
});
console.log(out);
await browser.close();
```

## Once fixed

Re-run `node scripts/rebuild-troops.mjs` (all 38, or `--only <slugs>` for the affected ones).
The script reads `armyType` from the existing `data/troops/*.json`, so a rebuild will not
disturb the infantry/cavalry merge. Verify with:

```bash
python3 -c "
import json
for s in ['wyvern-flight','pixi-swarm','shadow-host','bog-strider-scouts','lizardfolk-defenders']:
    d=json.load(open(f'data/troops/{s}.json'))
    print(s, d['system']['attributes']['speed'])"
```
