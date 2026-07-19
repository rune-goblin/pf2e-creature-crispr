# Investigation: troop conversion "loses" movement Speed

## Symptom

A creature converted to a troop through CRISPR (e.g. consumed on the ReignMaker side) comes back
with its movement **Speed** gone — effectively reset to the 25 ft default rather than the creature's
authored Speed.

## Scope of the trace

Speed flows through four places. Three of them are correct; the fourth is the bug.

| Path | Reads Speed? | Writes Speed? | Verdict |
|---|---|---|---|
| Conversion kernel (`applyTroopConversion`) | — | — | ✅ deliberately touches nothing but the troop-specific fields (level, size, generated actions, glossary kit, area/splash weaknesses). Speed passes through untouched by design (`troop-conversion-v2.md` decision 1). |
| Editor **load** (`loadCreatureForEdit` → `getSpeedsFromActor`) | ✅ | — | ✅ reads `system.attributes.speed.value` (land) + `otherSpeeds[].value`. PF2e's *prepared* speed object keeps `value` as the base land speed and each `otherSpeeds` entry keeps its base `value`, so this is a lossless read. |
| Editor **save** (`updateCreature` → `buildSpeedSystem`) | — | ✅ | ✅ serializes `{ value, otherSpeeds }` back into `system.attributes.speed`. Round-trips. |
| Editor **"Export"** button (`defaultSaveTarget.exportActor` → `exportCreatureToFile`) | ✅ (partial) | — | ❌ **hand-assembled a snapshot that omitted `speeds`** (and `senses`, `languages`, and IWR). |

So the actor itself never loses its Speed. The loss happens the moment a consumer rebuilds a
creature from the **stat-snapshot export**, because that snapshot never carried Speed to begin with.

## Root cause

`exportCreatureToFile` (in `src/creature-builder/services/import.ts`) produced:

```
{ name, level, creatureType, size, traits, benchmarks, stats, portraitImage, tokenImage, exportedAt }
```

It included the benchmark-derived core but dropped every **non-benchmark attribute the editor
carries verbatim**: `speeds`, `senses`, `languages`, `immunities`, `resistances`, `weaknesses`.
Those attributes exist nowhere else in the snapshot, so a consumer rebuilding from it has no source
for them — Speed falls back to the 25 ft default, senses/languages/IWR vanish.

This is easy to miss because the *other* export, `exportActorSource` (`actor.toObject()`, used by
ReignMaker to package a full actor into a compendium), is lossless — it ships the whole `system`
including Speed. Only the lighter stat-snapshot export was lossy, and no test asserted otherwise
(`export-roundtrip.spec.ts` exercises `exportActorSource`, not the snapshot).

## Guiding principle (from the maintainer)

> We should not drop or modify the Speed attribute. Any creature attribute that isn't edited or
> modified should be passed through the editor without transformation or modification.

The snapshot export violated this for the non-benchmark pass-through attributes.

## Fix

`src/creature-builder/services/import.ts`
- Split the snapshot assembly out of the file write into a pure, testable
  `buildCreatureSnapshot(actorId, timestamp)`.
- The snapshot now also carries `speeds`, `senses`, `languages`, `immunities`, `resistances`,
  `weaknesses` — sourced from the same readers the editor uses, so what ships is exactly what the
  editor sees.

`src/creature-builder/services/actorQueries.ts`
- Promoted the three private readers `getSpeedsFromActor` / `getSensesFromActor` /
  `getLanguagesFromActor` out of `editorHost.ts` to sit beside their IWR sibling readers
  (`getWeaknessesFromActor` etc.), now `actorId`-based and exported. This gives both the editor load
  path and the export path one shared, lossless reader — and avoids an `import.ts → editorHost →
  saveTargetRegistry → defaultSaveTarget → import.ts` import cycle.

`src/creature-builder/services/editorHost.ts`
- Now imports those readers from `actorQueries` instead of defining its own; behaviour identical.

## Tests

`src/creature-builder/tests/exportSnapshot.test.ts` (new) — stubs `game.actors` and asserts the
snapshot carries land + other speeds (and specifically does **not** reset a non-default land speed to
25), plus senses/languages/IWR, while keeping the benchmark/stat core it always had.

Full suite: 603 passing (+4), typecheck clean.

## Note on the ReignMaker side

If ReignMaker consumes the stat snapshot, Speed is now present in it and should read through. If
ReignMaker instead consumes `exportActorSource`, Speed was always present there — any remaining loss
would be on the reading side, not in CRISPR's output.
