# CRISPR: make `exportActorSource` item order deterministic

**Audience:** a CRISPR session with no other context. Everything needed is here.

`exportActorSource(actorId)` (`src/creature-builder/services/import.ts`, currently `return actor.toObject()`)
emits the actor's `items` array in a **non-deterministic order**. Building the same troop twice via
`importCreatureFromCompendium → convertActorToTroop → exportActorSource` produces byte-different JSON on
each run — the *content* is identical, only the item order shuffles. Foundry assigns embedded-item order
non-deterministically after the async `createEmbeddedDocuments` the troop build performs, and `toObject()`
dumps them in that unstable order.

**Why it matters:** consumers write this export to disk as source-of-truth JSON (e.g. a
`data/troops/*.json` pack source). Unstable order means every rebuild churns the file, produces noisy,
meaningless git diffs, and the packaged compendium isn't reproducible.

**Confirmed scope — purely ordering, not content:**
- Hashing each build with `items` sorted by name yields identical hashes across runs; hashing raw bytes
  differs.
- A separate duplicate-item bug (the consumer recipe re-emitting the standard kit, so two same-named
  Troop Movement / Troop Defenses items appeared) is already fixed, so there are no longer same-named
  items to disambiguate.

**Reproduce:**
```js
const api = game.modules.get('pf2e-creature-crispr').api;
const id = await api.importCreatureFromCompendium('Compendium.pf2e.pathfinder-monster-core.Actor.AFWmiIBJ7ypgydQD'); // Dire Wolf
await api.convertActorToTroop(id, { providerId: 'reignmaker-army' });
const a = await api.exportActorSource(id);
// repeat on a fresh import → compare JSON.stringify(a.items): order differs, contents match
```

**Ask:** sort the exported `items` array by a stable key before returning from `exportActorSource`, so the
emitted source is canonical and byte-reproducible. Keep it in the export (not a consumer's normalizer) so
every consumer benefits.

- Suggested key: a fixed **type/category priority** (strikes/attacks → actions → passives → the standard
  troop kit → spellcasting → inventory) then `name` then `system.slug`, with a final tiebreak on a stable
  serialization so the order is total. It should also read sensibly on the NPC sheet — PF2e uses item
  order for display, so don't just sort alphabetically if that scrambles the sheet.
- Idempotent; must not alter any item's content.
- Regression test: build a troop twice (or export the same actor twice) and assert the two
  `exportActorSource` results are deeply equal, including `items` order.

**Constraints:** repo conventions — v14 `foundry.*` only, TypeScript everywhere, comment only the
non-obvious *why*.
