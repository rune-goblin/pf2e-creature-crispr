# Troop build API — CRISPR as a dev-time creature library

**Audience:** a CRISPR session with no other context. Everything needed is restated here.
**Requested by:** Mark, 2026-07-17. Revised 2026-07-17 after verification against the pf2e system
source and all 162 published troop statblocks (see Evidence).
**Consumer-side plan:** `pf2e-reignmaker` `docs/plans/troops-via-crispr-import.md` (RM's half; this
doc stands alone).

## Why this exists

CRISPR is **the entire creature creation and editing tool**; any gap goes upstream into CRISPR
(Mark's ruling). ReignMaker still ships a parallel troop pipeline
(`src/services/troops/composeTroopActor.ts`) that hand-types published statblocks into 22 JSON
templates. That stops. This doc is the upstream work that lets RM — and any other consumer — build
troops through CRISPR instead.

The consumer surface is the in-Foundry API object (`game.modules.get('pf2e-creature-crispr').api`),
used **at dev time, by a developer, inside a running world**; the result is packaged into a shipped
compendium. No runtime import. The pure kernel (`src/creature-builder/logic/`) remains the only
out-of-Foundry surface, vendored by RM via `npm run sync-crispr` with a `types: []` purity gate.

## The target flow

```
api.searchBestiary({ search: 'wolf pack' })      → uuid                       [EXISTS — expose]
api.importCreatureFromCompendium(uuid)           → world actor, items intact  [EXISTS — expose]
api.applyTroopToActor(actorId, opts)             → it's a troop               [W3 — new]
   …dev adds a Strike + art in the editor                                     [EXISTS]
api.exportActorSource(actorId)                   → packageable JSON           [W4 — new]
   …consumer compiles it into its own pack                                    [consumer side]
```

## Verified system facts (these drove every decision below)

Checked against `_pf2e-source` (system v8.x) and its `packs/pf2e` sources — 162 NPCs carry the
`troop` trait.

1. **The system derives troop *presentation and combat state* from the trait**
   (`src/module/actor/npc/document.ts`): unflankable (`:109`); HP thresholds at full/⅔/⅓ HP mapped
   to 4/3/2 segments (`:218–229`); token footprint forced to 10×10 ft (2×2 squares — the segment
   model) regardless of actor size; HP/adjustment updates propagate across sibling segment tokens
   (`:545`). **CRISPR must not manage token size or thresholds — the system owns them.**
2. **The system does NOT derive IWR from the trait.** `iwr.ts` only *reads* authored weaknesses at
   damage time. Every published troop carries its area/splash weaknesses explicitly in
   `system.attributes.weaknesses`.
3. **There is no troop immunity rule.** The large majority of the 162 troops have **zero**
   immunities (Wolf Pack, every humanoid squad, the animal packs). The five-immunity set
   (death-effects, disease, paralyzed, poison, unconscious) appears only on undead/construct troops
   — it's the mindless-undead package, not troop-ness — and even then varies (scamps: bleed,
   paralyzed, poison, **sleep**). IWR beyond area/splash is creature-specific.
4. **Area/splash values are authored around a guideline, not table-locked.** Level-4 troops alone
   span 4/4, 5/5, 8/4, 10/5, 5/2 — and some troops have one or neither entry (Brastlewark Sapper
   Squad, Elven Waverider Troop, Marcos's Marauders). Troops with **Form Up** consistently run
   splash ≈ half area (5/2, 10/5, 12/6, 15/8, 20/10). CRISPR's `TROOP_WEAKNESS_TABLE` also sits
   below the published mode (level 6: table 4/4, published cluster 5/5). The table is a guideline
   default for from-scratch troops — authored values always win.
5. **The standard troop abilities are canonical generic items** in
   `pf2e.bestiary-ability-glossary-srd` — pure `@Localize` wrappers, no level- or creature-specific
   values:
   - Troop Defenses `Compendium.pf2e.bestiary-ability-glossary-srd.Item.EawOw47nHueUPnYc`
   - Troop Movement `Compendium.pf2e.bestiary-ability-glossary-srd.Item.MXI6zwrvbQNIv7ji`
   - Form Up `Compendium.pf2e.bestiary-ability-glossary-srd.Item.OvqohW9YuahnFaiX`
   Every published troop embeds Defenses + Movement; only ~40% have Form Up (Wolf Pack and
   Skeleton Infantry don't).
6. **Published troops carry no melee strikes** — attacks are action items with embedded `@Damage` /
   `@Check`. The dev flow adds a Strike in the editor; CRISPR's strike support is complete
   (`composeStrikeItemData`, `updateMeleeItems`).
7. **Provenance already works.** `importCreatureFromCompendium` stamps `importedFrom`, and the pf2e
   source carries `publication: {license: 'ORC', remaster: true}` on every reference creature.

## Settled decisions

- **Troop-ness derives from the actor; nothing is persisted in the flag.** `isTroop` ⇐
  `traits.includes('troop')`; `troopSize` ⇐ actor size. The actor *is* the record — matching how
  the system itself reads troop-ness. No `StoredCreatureData` change, nothing for RM to re-vendor
  on that account.
- **Weakness semantics: seed-if-missing.** `withTroopWeaknesses` keeps any authored `area-damage` /
  `splash-damage` entry and only fills in absent types from the table. Preserves every published
  divergence; idempotent; from-scratch troops get guideline values.
- **The kernel's immunity overlay is deleted.** `troopImmunities` / `withTroopImmunities` and the
  immunities leg of `troopAdjusted` (added in bf45170) universalized the mindless-undead package —
  fact 3 falsifies them. This is a deliberate **breaking kernel change** (correctness fix):
  coordinate the tag bump with RM's re-vendor; RM's `armySaveTarget` drops its immunity call.
- **`applyTroopToActor` seeds the standard abilities**: Defenses + Movement always, Form Up behind
  an option (fact 5). Embedded copies, deduped by slug, so re-running — or running on an imported
  published troop that already has them — adds nothing.
- **Full-source export lives in CRISPR** (beside the existing stat-snapshot export, which stays).
  It keeps the CRISPR flag in the output so shipped actors remain CRISPR-editable when reimported
  from a consumer's pack. Data-returning function first, file download as a wrapper, so consumer
  tooling can automate.
- **Dev flow uses CRISPR's default save target.** A consumer's own target (RM's faction folders /
  army registration) is for its runtime worlds, not for pack-building; mixing scopes mid-flow means
  `loadCreatureData` misses and the editor back-solves — works, but don't recommend it. One line in
  the API docs.

## Work items (in order)

### W1 — kernel (`logic/troop.ts`) — breaking, tag bump

- `withTroopWeaknesses(existing, level)`: seed-if-missing (keep authored area/splash, add only
  absent types from `troopWeaknesses(level)`).
- Delete `troopImmunities`, `withTroopImmunities`, `TROOP_IMMUNITY_TYPES`.
- `troopAdjusted` returns `{ traits, weaknesses }`; drop `immunities` from `TroopAdjustable`.
- Update `tests/troop.test.ts`: seed-if-missing cases (authored 5 survives at level 6; missing
  types filled; empty input gets both; idempotent), immunity helpers gone.
- Bump the kernel tag; RM re-vendors and runs `check:vendor` + purity/drift tests.

### W2 — editor/services truthfulness (uses W1)

- `services/defaultSaveTarget.ts:28` — delete the local `troopAdjusted` shadow; call the kernel's
  at the three call sites (`:47`, `:66`, `:104`). After W1 this is dedup, not a behavior fix.
- `services/editorHost.ts` `loadCreatureForEdit` — derive `isTroop` from the `troop` trait and
  `troopSize` from actor size, so reopening a troop round-trips (today the editor forgets).
- `editor/store.svelte.ts` `setTroop(false)` — also strip the `troop` trait (and drop the seeded
  area/splash entries), or the next load re-derives `isTroop: true`.

### W3 — `applyTroopToActor` (`services/troop.ts`, new)

```ts
applyTroopToActor(actorId: string, opts?: {
  troopSize?: TroopSize;   // default 'gargantuan' — published troops are uniformly grg
  formUp?: boolean;        // default false — seed Form Up too (fact 5)
}): Promise<string>        // resolves to the actor id
```

- Requires a world NPC (`requireActor`-style guard; reject non-NPC).
- Adds the `troop` trait (`withTroopTrait`), seeds missing area/splash weaknesses
  (kernel `withTroopWeaknesses` via the existing `buildIwrSystem` write path), sets actor size
  (`sizeToPf2e(troopSize)`). No token/threshold management — the system derives presentation
  (fact 1). No immunities (fact 3).
- Embeds copies of the glossary abilities (fact 5 UUIDs) via `fromUuid` +
  `createEmbeddedDocuments`, skipping any the actor already has by slug.
- Flag-agnostic: does not require or write the CRISPR flag — troop-ness lives on the actor. The
  composed dev flow imports first, which handles flag/benchmarks.
- Idempotent end to end: re-running on an already-applied or published troop is a no-op.

### W4 — packageable export (`services/import.ts`)

```ts
exportActorSource(actorId: string): Promise<Record<string, unknown>>  // actor.toObject()
exportActorSourceToFile(actorId: string): Promise<void>               // reuse the save-picker plumbing
```

Full source — `system`, `items`, `prototypeToken`, `img`, flags (CRISPR flag included, see
decisions). The existing `exportCreatureToFile` stat snapshot stays untouched.

### W5 — API object + docs

- `src/index.ts` `ModuleApi` gains: `searchBestiary` (self-initializing, `bestiaryBrowser.ts:79`),
  `importCreatureFromCompendium`, `applyTroopToActor`, `exportActorSource`,
  `exportActorSourceToFile`. Additive → minor version bump; consumers gate on `api.version`.
- `docs/api/README.md`: document the five methods with the dev-flow example; rewrite "Native
  troops" — no immunity claim, seed-if-missing semantics, the system-derived segment behavior
  (fact 1), the default-save-target recommendation, and a note that `formUp: true` conventionally
  pairs with splash ≈ half area (fact 4).
- `lang/en.json` for any new user-facing strings.

### Consumer follow-up (RM's repo, after W1–W5 ship)

Re-vendor kernel; `armySaveTarget` drops its immunity call; rebuild `wolf-pack` per Acceptance;
delete `composeTroopActor.ts` + 22 templates.

## Non-goals

- **No runtime import.** Dev-time only; consumers ship prebuilt packs.
- **Nothing RM-specific in CRISPR.** `armyType`, `strategyTokenImage`, faction folders, army
  registration stay in RM behind the existing `CreatureSaveTarget` / `AbilityProvider` contracts.
- **Keep `logic/` Foundry-free.** RM's purity gate fails the vendor sync otherwise.
- **No thresholds/segments UI work now.** The editor's read-only threshold display
  (`calculateTroopThresholds` / `TROOP_SQUARES`) models the old one-big-token presentation; the
  system now computes 4/3/2 segments itself (fact 1). Refreshing that display is a separate
  follow-up.

## Acceptance

Reproduce RM's shipped `wolf-pack` **without hand-typing a statblock**:

1. `importCreatureFromCompendium('Compendium.pf2e.battlecry-bestiary.Actor.imbJcEAt1tVfQ3CO')`
2. `applyTroopToActor(id)` — must be a visible no-op for trait/weaknesses/abilities (Wolf Pack
   already has all of them) and must **not** add immunities
3. Dev adds a Strike + RM art in the editor (CRISPR default save target)
4. `exportActorSource(id)` → result carries real embedded items (incl. Troop Defenses + Troop
   Movement), authored **5/5** area/splash intact, `importedFrom`, and upstream
   `publication.license: 'ORC'`

Also from-scratch: a plain NPC through `applyTroopToActor(id, { formUp: true })` gains the trait,
guideline area/splash for its level, and all three ability items — and a second run changes
nothing.

## Reference creatures (all common, remaster, ORC, ship with the system)

| Creature | Book | Level | UUID |
|---|---|---|---|
| Shambler Troop | Monster Core 2 | 4 | `Compendium.pf2e.pathfinder-monster-core-2.Actor.WQYzPF4cN4msA8lw` |
| Skeleton Infantry | Monster Core 2 | 11 | `Compendium.pf2e.pathfinder-monster-core-2.Actor.dwPrJjsIA0AEk3vl` |
| Wolf Pack | Battlecry! | 6 | `Compendium.pf2e.battlecry-bestiary.Actor.imbJcEAt1tVfQ3CO` |

## Evidence

- **E1 — trait-derived IWR does not exist.** No troop-trait IWR derivation anywhere in system
  `src/`; all 162 published troops author area/splash explicitly. (Facts 2–4 data: sweep of
  `packs/pf2e/**` for `troop`-trait NPCs, 2026-07-17.)
- **E2 — the Wolf Pack divergence.** Published splash 5 at level 6; the old always-overwrite
  `withTroopWeaknesses` rewrote it to the table's 4 whenever troop-ness was asserted (initial troop
  save, the Defenses toggle, Convert to Troop). Seed-if-missing (W1) preserves it. Note: plain
  re-saves did *not* corrupt — the editor forgot `isTroop` on load (fixed by W2), so
  `troopAdjusted` passed through.
- **E3 — the immunity overlay was wrong upstream and downstream.** Kernel bf45170 added a
  universal five-immunity overlay; RM's `armySaveTarget` (kernel consumer) stamps it onto living
  armies today. Fact 3 falsifies both. CRISPR's `defaultSaveTarget` local shadow happened not to
  apply immunities — accidentally correct, kept via W1+W2.
- **E4 — glossary items verified generic** (fact 5): `@Localize` descriptions only; embedded
  copies are ORC/SRD system content, the same licensing position as every published troop that
  embeds them.

## House rules (`CLAUDE.md`)

- **v14 only, no v1 APIs** — everything under `foundry.*`.
- **TypeScript everywhere including tooling**; node ≥22.18 strips types natively.
- Comment only the non-obvious *why*.
- Kernel changes (W1) → tag bump; RM re-vendors via `npm run sync-crispr` and runs `check:vendor`
  + purity/drift tests. W1 is knowingly breaking — see decisions.
