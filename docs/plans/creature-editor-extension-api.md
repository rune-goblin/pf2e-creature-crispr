# Plan: CRISPR as the one creature editor — a module extension API (custom abilities + save targets)

> Status: planned (not started). RM's adoption is a documented follow-on that depends on this landing.

---

## Context — why this changed

ReignMaker (RM) and CRISPR forked one creature editor. The pure math **kernel** is already
extracted to `src/creature-builder/logic/` and vendored into RM (`src/vendor/crispr-logic` via
`scripts/sync-crispr.mjs`). The remaining fork is the **editor UI**.

The original aim — extract the whole editor as one build-time Svelte component both apps consume —
**is blocked**: **CRISPR is Svelte 5** (runes, `mount`, snippets) and **RM is Svelte 4**
(`on:click`, `createEventDispatcher`, `export let`). A Svelte 5 component cannot be compiled or
mounted by a Svelte 4 build; dual-runtime hacks are impractical. So **no front-end is shared.**

**Decision (settled with the user):** keep **one editor — CRISPR's** — and let other Foundry
modules extend it at **runtime via a JS API** (api/logic, not FE). RM retires its own creature
editor and becomes a consumer. The two things a consumer must be able to provide:

1. **Custom abilities** — e.g. RM's army/troop abilities, surfaced in CRISPR's ability picker.
2. **Save location** — where/how the actor is persisted (RM's faction folders) + post-save hooks
   (RM's "register as Army"), instead of CRISPR's built-in flat folder.

Outcome: one editor FE (CRISPR, Svelte 5); consumers inject domain content + persistence through a
stable API; shared **types/contracts** live in the kernel so consumers (RM) author against them via
the existing vendoring. This is runtime module federation — earlier ruled out under the dead
build-time-component design, now the chosen approach.

## Goal / non-goals

**Goal:** Refactor CRISPR so every actor I/O in the editor flows through an injectable
**save-target contract**, and the special-abilities picker is driven by an **ability-provider
registry** — then expose both as a public runtime API. CRISPR keeps working with zero config
(built-in default target, no providers). A module can extend it with **no edits to CRISPR**.

**Non-goals / out of scope:** implementing RM's adoption (follow-on); the kernel math extraction
(already done); sharing any Svelte FE; replacing CRISPR's list/import/picker UI.

## Why this is tractable (verified during planning)

CRISPR's Foundry coupling in the editor is already concentrated in two chokepoints; everything else
(sections, widgets, baseComponents) is presentational and kernel-only:

- **Load chokepoint** — `editor/store.svelte.ts`: only `startEditActor` (`game.actors.get` + the
  `../services` readers) and `startImport` touch Foundry. All ~40 mutation methods are pure.
- **Save chokepoint** — `ui/components/CreatureEditor.svelte`: `handleSave`, `handleSaveAsConfirm`,
  `handleExport`, `openOrCreateActor` marshal `services/*` + `ui.notifications` + `game.actors`.
- **Persistence layer** — `services/{crud,folderManager,sync,import,strikes,spells,actorQueries,
  actorStatsExtractor}.ts` IS the I/O; it becomes CRISPR's built-in default save target.
- **Abilities** — `ui/components/sections/SpecialAbilitiesSection.svelte` already has an add/
  drag-drop flow; it gains a registry-driven picker. (Its two `ui.notifications` calls + the
  `pickFile` import in `BasicInfoSection.svelte` are the only stray Foundry refs in the section tree
  and get routed through the contract.)
- **API surface exists** — `src/index.ts` already does `game.modules.get(MODULE_ID).api = {...}`;
  we extend that object.

---

## Architecture — the two contracts + the API

All three contract types live in the **kernel** (`src/creature-builder/logic/`) so they are
Foundry-free (behind the existing purity gate) and reach RM through vendoring. Interfaces use opaque
handles (`actorId: string`, the kernel creature model) — never Foundry types — so the kernel stays
clean; the *implementations* live in app code.

```ts
// logic/contracts.ts  (new — kernel, Foundry-free)

/** A registerable, FE-free ability definition. Shaped to map 1:1 from RM's TroopAbilityDefinition. */
export interface CustomAbilityDefinition {
  slug: string; name: string; img: string;
  group: string;            // provider-defined grouping ("war-action", "army-tactic", …)
  description: string;      // HTML; scalable @Damage/@Check macros parsed by the kernel
  actionType: 'action' | 'reaction' | 'free' | 'passive';
  actions?: 1 | 2 | 3;
  traits?: string[];
  referenceUuid?: string;   // opaque string; resolution (fromUuid) is host-side if ever needed
}
export interface AbilityProvider {
  id: string; label: string;
  abilities: CustomAbilityDefinition[];
  groups?: { key: string; label: string }[];
  /** Optional "Convert to Troop" recipe (Phase 4). CRISPR does the structural transform; this
   *  supplies the consumer's heuristics + standard ability set. RM's handleConvertToTroop is the ref. */
  troopConversion?: {
    levelDelta?: number;            // RM: +5
    nameSuffix?: string;            // RM: " Troop"
    defaultTroopSize?: TroopSize;   // RM: 'gargantuan' (kernel type)
    generateAbilities?(creature: EditableCreature): CustomAbilityDefinition[]; // standard set + 1/2/3-action attacks
  };
}

// NOTE: EditableCreature is a pure-data type relocated INTO the kernel (Phase 0) so contracts can
// reference it and RM can author against it via vendoring.

/** Persisted creature blob (benchmarks/baseStats) — flag SHAPE is shared; flag SCOPE is per-target. */
export interface StoredCreatureData { /* benchmarks, baseLevel, baseStats, importedFrom, … */ }

/** Everything Foundry/actor-specific the editor delegates. The save target OWNS folder + flag scope. */
export interface CreatureSaveTarget {
  id: string; label: string;
  loadCreatureData?(actorId: string): StoredCreatureData | undefined; // read from target's flag scope
  createActor(creature: EditableCreature): Promise<string>;           // create in target's folder + stamp flag
  updateActor(actorId: string, creature: EditableCreature): Promise<void>;
  cloneActor(sourceActorId: string, newName: string, creature: EditableCreature): Promise<string>; // Save As
  exportActor?(actorId: string): Promise<void>;
  onAfterSave?(actorId: string, creature: EditableCreature, mode: 'create' | 'update' | 'clone'): Promise<void>;
}
```

**Public API** (extends `game.modules.get('pf2e-creature-crispr').api`):

```ts
api.registerAbilityProvider(provider: AbilityProvider): void;   // global; populates the picker
api.registerSaveTarget(target: CreatureSaveTarget): void;       // selectable persistence backend
api.editCreature(opts?: {                                       // launch the editor, bound
  actorId?: string;            // edit existing, else create
  saveTargetId?: string;       // default = CRISPR's built-in flat-folder target
  abilityProviderIds?: string[]; // which providers' abilities to surface (default: all)
}): void;
api.open(): void;              // existing entry, unchanged (uses default target)
```

**Flow for RM (the first consumer):** at `ready`, RM calls `registerAbilityProvider(armyAbilities)`
and `registerSaveTarget(reignmakerArmyTarget)`. RM's own Svelte-4 kingdom UI keeps its "edit army"
button, which now calls `crisprApi.editCreature({ actorId, saveTargetId: 'reignmaker-army' })`.
CRISPR opens its Svelte-5 editor **as its own standalone ApplicationV2 window** (the existing
`CreatureCrisprApp` — floating, not embedded in RM's kingdom sheet; cross-framework embedding is not
possible and not needed). On save it routes through RM's target (faction folder + register as Army),
and RM's kingdom view refreshes via Foundry's `updateActor` hook (which RM already listens to). No FE
crosses the boundary — RM and CRISPR communicate only through the JS API.

---

## Phased steps (each phase keeps CRISPR green)

### Phase 0 — Shared contracts in the kernel
- Add `logic/contracts.ts` with the three types above; export via `logic/index.ts`.
- Move `EditableCreature` (pure data, currently `editor/types.ts`) into the kernel so the contracts
  can reference it and RM can author against it via vendoring; the editor re-exports it. UI-only types
  (`EditorMode`/`EditorSection`) stay in `editor/`.
- Keep purity gates green (`tsconfig.logic.json` types:[]; `tests/logicPurity.test.ts`): types only,
  no Foundry, no escaping/bare imports, **no `import.meta.glob`** (Vite-only; breaks kernel tsc and
  vendoring — registries must be explicit exports).

### Phase 1 — Save-target abstraction (the internal refactor)
- Implement CRISPR's current behavior as the **built-in default target** (`services/defaultSaveTarget.ts`)
  wrapping existing `crud`/`folderManager`/`sync`/`import` + the `pf2e-creature-crispr` flag scope
  (`services/constants.ts`). Behavior must be byte-identical to today.
- A small **save-target registry/active-target** holder (default selected unless `editCreature` sets one).
- **Drive Foundry out of the editor core, behind the contract:**
  - Store: split `startEditActor`/`startImport` into host-side load (target.`loadCreatureData` +
    PF2e-NPC reading) → pure `startEdit(creature)` / `startCreate()`. Removes `game.actors` + the
    `foundry-pf2e` `NPCPF2e` import from the store.
  - Shell (`CreatureEditor.svelte`): `handleSave`/`handleSaveAsConfirm`/`handleExport`/
    `openOrCreateActor` call the active target's `createActor`/`updateActor`/`cloneActor`/
    `exportActor`/`onAfterSave`; replace `ui.notifications` with an injected `notify`; move the
    Save-As item-id remapping (`buildItemIdMap`, uses `ActorPF2e`/`ItemPF2e`) into the target impl.
  - Route `BasicInfoSection`'s `pickFile` and `SpecialAbilitiesSection`'s two `ui.notifications`
    through the editor's injected env (notify / pickImage).
- Add a boundary check (mirror of the kernel gate) asserting the **editor core** (`editor/`,
  `ui/components/{sections,widgets,baseComponents}`) imports no `services/*` and no `foundry-pf2e`,
  and references no Foundry globals — only the kernel + the injected contract.
- CRISPR's own app: unchanged UX (default target).

### Phase 2 — Ability-provider registry + registry-driven picker
- Add an ability-provider registry; make `SpecialAbilitiesSection`'s picker render registered
  abilities (search / filter / group tabs — RM's `TroopAbilityPickerDialog` is the UX precedent),
  mapping `CustomAbilityDefinition` → the editor's `SpecialAbility` (kernel `parseAbilityDescription`
  handles scalable macros). Free-form add + drag-drop stay.
- No providers registered → picker shows only the existing built-in flow (CRISPR unchanged).

### Phase 3 — Public runtime API
- Extend `src/index.ts` api object with `registerAbilityProvider`, `registerSaveTarget`,
  `editCreature`. `editCreature` selects the active target + provider filter, loads (or creates),
  and renders `CreatureCrisprApp`.
- Document the API + the two contracts (a `docs/` API reference); version it (api carries a
  `version`); keep it backward-stable.

### Phase 4 — Native troop support (committed)
- Troops are **PF2e-core**, and the kernel already has the math (`calculateTroopThresholds`,
  `getTroopWeaknessValues`, `TROOP_SIZES`). Add `isTroop`/`troopSize` to `EditableCreature` + a troop
  toggle, thresholds + area/splash-weakness display in `DefensesSection`, and troop trait/weaknesses
  on save (written through the active save target from Phase 1). This is CRISPR-native (not RM
  coupling); RM's *named* troop abilities still arrive via the provider API. Depends on Phase 1
  (save) + the kernel math (present); independent of Phases 2–3.
- **Convert to Troop** (one-click, committed): a native action applies the structural transform
  (`isTroop`, `troopSize` default gargantuan, `size`, troop trait + area/splash weaknesses from kernel
  math), then applies the active provider's optional `troopConversion` recipe if present — `levelDelta`,
  `nameSuffix`, `defaultTroopSize`, and `generateAbilities(creature)` for the consumer's standard
  abilities + 1/2/3-action attacks — reconciled so the user's existing non-standard abilities survive.
  RM's `handleConvertToTroop` is the behavioral reference (+5 level, " Troop", gargantuan, Form Up /
  Troop Movement / Troop Defenses + seeded attacks). No provider recipe → structural transform only.

### Phase 5 — RM adoption (FOLLOW-ON; documented, not implemented here)
- RM maps `data/troopAbilities/` → `CustomAbilityDefinition[]` (import the type from vendored
  `@crispr-logic`), registers it; implements `CreatureSaveTarget` over `services/army` faction
  folders + `sync.ts` (`_syncCreatureToActorInternal`) + `cloneCreatureActor` (→ faction folder +
  register Army); routes its "edit army" button to `crisprApi.editCreature`; deletes its editor;
  guards for CRISPR-absent (`module.json` relationship/dependency + a runtime check).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Internal refactor regresses CRISPR's own save/load | Default target wraps current services 1:1; existing vitest + Playwright e2e are the backstop; add before/after byte-identical create/update tests. |
| Editor core silently re-couples to Foundry/services | New boundary test over `editor/` + `ui/components/{sections,widgets,baseComponents}` (mirror of `logicPurity.test.ts`); fails on any `services/*`, `foundry-pf2e`, or Foundry-global ref. |
| RM data under RM's flag scope won't load in CRISPR | Save target owns flag scope via `loadCreatureData`; if absent, CRISPR back-solves benchmarks from live stats (`readActorStatsAndBenchmarks`) — already its fallback. |
| Runtime dependency: RM needs CRISPR installed | Document the hard dependency; RM declares it in `module.json` and guards calls; CRISPR's `api` is versioned + backward-stable. |
| Ability schema mismatch (RM `TroopAbilityDefinition` vs `CustomAbilityDefinition`) | Design `CustomAbilityDefinition` to map 1:1 from RM's existing shape; ship a tiny adapter; minimal RM churn. |
| `import.meta.glob` (RM registry) leaks into kernel | Kernel uses explicit exports only; gate forbids it; runtime registration replaces glob discovery. |
| Save As (clone → faction folder + register Army) | Contract's `cloneActor` + `onAfterSave` cover it; default target keeps CRISPR's clone-into-flat-folder. |
| API churn breaks RM | Freeze the contract types in the kernel (vendored, version-pinned); additive changes only. |

## Acceptance criteria

- **CRISPR's own editor works unchanged for the user** — default target, no providers; no UX/behavior
  regression; `npm run check`, `npm run test`, and the Playwright e2e harness pass.
- **All editor actor-I/O flows through the save-target contract** — the new boundary test confirms the
  editor core has zero `services/*`/`foundry-pf2e`/Foundry-global references.
- **A module can, with NO edits to CRISPR,** register custom abilities (appear + addable in the
  picker), register a save target (creature persists to its location; `onAfterSave` runs), and launch
  the editor bound to them — proven by an in-repo fixture provider/target test.
- **Contracts/types are in the kernel, Foundry-free behind the purity gate,** consumable by RM via the
  existing `sync-crispr` vendoring (no new infra).
- **Native troop support (Phase 4):** marking a creature a troop renders thresholds + area/splash
  weaknesses from kernel math and writes the troop trait/weaknesses on save.
- **Convert to Troop (Phase 4):** the one-click action turns a creature into a troop (structural
  transform) and, when a provider supplies a `troopConversion` recipe, seeds that consumer's standard
  abilities/attacks while preserving the user's existing ones.
- **RM's adoption is a separate follow-on** depending on this landing.

## Verification

- `npm run check` (svelte-check + tsc + `tsconfig.logic.json`) and `npm run test` (vitest incl.
  `logicPurity` + the new editor-boundary test + fixture-provider test).
- In-repo **fixture provider**: registers an ability + a save target writing to a distinct folder +
  `editCreature` → assert ability appears, save lands in the fixture folder, `onAfterSave` fired.
- Manual in Foundry: open CRISPR (existing flow), edit/save a creature (default target) → no
  regression; then drive the fixture provider end-to-end.
- Extend the Playwright e2e harness with one registered-provider/target path.

## Related

- RM's upstream plan: `docs/plans/crispr-logic-vendoring.md` (in the `pf2e-reignmaker` repo) — kernel
  vendoring (Phases 1–4 done); this doc is the new editor-side direction superseding its Phase 5.
