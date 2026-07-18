# NPC spell preservation — keep listed spells across scale and convert

**Audience:** a CRISPR session with no other context. Everything needed is restated here.
**Requested by:** Mark, 2026-07-18, after observing scaled casters losing their spells.
**Builds on:** the manual spell-rank control shipped the same day (`spellSlotOverrides` may now
introduce or remove any rank 0–10; see `logic/spellSlotTables.ts`, `logic/creatureStatTables.ts`).

## Why this exists

A published NPC caster does not carry a full caster's spell allotment. Its statblock lists a handful
of spells per rank — fewer than the 3-per-rank (prepared) or 4-per-rank (spontaneous) the class
progression tables produce. CRISPR scales the *counts* off those tables and never touches the
spell-to-slot bindings, so scaling or converting a caster leaves its listed spells behind.

Concretely, `syncSpellcastingEntriesForLevel` (`services/spells.ts`) writes
`system.slots.slot${rank}.max` and `.value` for ranks 0–10 and **never writes
`system.slots.slot${rank}.prepared`** — the array that actually binds spell items to slots. Grow the
count and the new slots aren't represented; shrink it and stale bindings linger; drop a rank to zero
and its spell is orphaned on the entry, attached but uncastable.

## Verified facts (drove every decision)

Read from `_pf2e-source`, 2026-07-18:

1. **`SpellSlotData = { prepared: SpellPrepData[]; value: number; max: number }`** —
   `src/module/item/spellcasting-entry/data.ts:24-28`.
2. **`SpellPrepData = { id: string | null; expended: boolean }`** — same file, `:20-23`. **`id: null`
   is PF2e's own representation of an empty slot**, so "leave the rest blank" needs no new concept.
3. **Spell items bind to an entry via `system.location.value = entryId`**, with optional
   `heightenedLevel` / `signature` / `uses` — `src/module/item/spell/data.ts:37-48`. Spontaneous
   repertoires and innate spells live here, *not* in the `prepared` array.
4. **`highestRank = min(10, max(highestSpell, ceil(actorLevel / 2)))`** —
   `src/module/item/spellcasting-entry/collection.ts:29-33`. PF2e tolerates a spell ranked above the
   creature's level; it widens the displayed range rather than rejecting it.
5. **Both edit flows funnel through one function.** `defaultSaveTarget` → `updateCreature`
   (`services/sync.ts:72`) → `syncSpellcastingEntriesForLevel`, gated on `levelChanged || benchmarks`.
   Convert to Troop bumps the level by +5, so it always fires. **Fixing the one function covers
   editor scaling and troop conversion both** — no separate troop-side work.

## Decisions (Mark, 2026-07-18)

1. **No spell picker, no compendium lookup, no spell creation.** CRISPR does not invent spells. If
   spell items already exist on the actor, keep them; otherwise do nothing.
2. **Never force an assignment.** Slots beyond the listed spells stay blank (`id: null`) and the GM
   fills them or not.
3. **Never silently discard an assigned spell.** Scaling down must not delete what the creature came
   with — see the `max(slotCount, assigned.length)` rule in W1.
4. Applies to **both** level scaling and Convert to Troop (which fact 5 makes automatic).
5. Slot *counts* keep coming from the progression tables plus `spellSlotOverrides`; this work changes
   bindings, not the count model. The one exception is decision 3.

## Wave 1 — pure kernel: `resizePreparedSlots`

**Files:** `logic/spellSlotTables.ts`, `tests/spellSlotTables.test.ts`.

Export `PreparedSpellSlot { id: string | null; expended: boolean }` and:

```ts
resizePreparedSlots(existing: PreparedSpellSlot[], slotCount: number): PreparedSpellSlot[]
```

Keep every entry with a non-null `id` (preserving `expended`), in order; result length is
`max(slotCount, assigned.length)`; pad with `{ id: null, expended: false }`.

Kernel-only so it is unit-testable — the service layer has no Foundry mock harness in this repo and
`tests/logicPurity.test.ts` requires `logic/` to import nothing outside `logic/`.

**Done when:** tests cover grow (pads blank), shrink (keeps assigned, never truncates an assignment),
stable when already the right size, and empty input.

## Wave 2 — service wiring

**Files:** `services/spells.ts`.

In `syncSpellcastingEntriesForLevel`'s rank loop, branch on
`entry.system.prepared.value === 'prepared'`:

- **Prepared entries** — read the rank's existing `prepared` array, drop entries whose `id` no longer
  resolves to a spell item on the actor (stale bindings), run `resizePreparedSlots`, then write
  `system.slots.slot${rank}.prepared` **and** set `.max`/`.value` to the resulting array length (so
  decision 3's widening is reflected in the count).
- **Everything else** (spontaneous, focus) — unchanged `.max`/`.value` write. Their spells live on the
  spell items via `location.value` (fact 3) and are already preserved by not being touched.
- **Innate** — still skipped entirely, as today.

Extend the local `SpellSlots` alias (`services/spells.ts:14`) to type `prepared` as
`Array<{ id?: string | null; expended?: boolean }>`.

**Done when:** `npm run check` and `npx vitest run` green.

## Wave 3 — verification (done: `src/tests/e2e/spell-slots.spec.ts`)

Unit tests can't reach this — the binding lives in a service that talks to Foundry, and there is no
mock harness. So verification is e2e, driving the real editor against a headless Foundry:

- `createSpellcasterNpc` / `readSpellSlots` (`fixtures/creature-ui.ts`) build an NPC carrying a
  prepared entry with spells bound into a rank's slots, and read the persisted entry back.
- **Scale up** → both listed spells still bound, `prepared.length === max`, and every added slot is
  `null` (nothing auto-assigned).
- **Scale down** → both spells still bound and the rank stays wide enough to hold them.

**Both specs were confirmed to fail without the fix** (`prepared` came back `[]` — the bindings were
lost entirely, worse than the stale-array behaviour predicted). A regression test that passes with
the bug present would have been worthless here, so re-verify that way if this code is touched.

Still unverified by automation, worth a manual pass if you touch the area:

- **Convert to Troop** — shares the path via fact 5, but no spec exercises a *caster* troop.
- **Editor round-trip of a hand-tuned rank layout** — what `diffSlotOverrides` exists for.

## Out of scope

- Creating spell items from a name list, a statblock parse, or the compendium (decision 1).
- A spell-picker UI (decision 1).
- Re-ranking or heightening spells to follow a level change. Spontaneous/innate spells keep their own
  rank via `location.heightenedLevel`; deliberately untouched, since "keep them" means leave them be.
- Deriving slot counts from the number of listed spells (decision 5).
