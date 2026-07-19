# Creature CRISPR — Editor Extension API

Creature CRISPR is meant to be the **single** PF2e creature editor in a world. Other Foundry modules
don't fork or embed its UI — they **extend it at runtime through a small JS API**. A consumer can:

1. **Inject custom abilities** into the editor's ability picker (e.g. an army/troop action set), and
2. **Provide a save target** — where/how the edited actor is persisted, plus a post-save hook —
   instead of CRISPR's built-in flat folder.

It can then **launch the editor bound to those**, with *no edits to CRISPR*. CRISPR also has native
**troop** support with a built-in **Convert to Troop** engine (a per-provider recipe layers optional
overrides on top).

> Why an API and not a shared component? CRISPR's editor is Svelte 5 (runes/`mount`); a Svelte 4
> consumer can't compile or mount it. So nothing crosses the boundary except data + this API. The
> shared **contracts** live in CRISPR's Foundry-free kernel (`src/creature-builder/logic/`) and are
> meant to be **vendored** by consumers, so you author against the exact types CRISPR uses.

---

## Quickstart

```ts
Hooks.once('ready', () => {
  const crispr = game.modules.get('pf2e-creature-crispr')?.api;
  if (!crispr) return; // CRISPR not installed/active — guard (see "Depending on CRISPR")

  crispr.registerAbilityProvider(myProvider);   // abilities → the picker
  crispr.registerSaveTarget(myTarget);          // persistence backend
});

// From your own UI, later:
crispr.editCreature({
  actorId,                          // edit an existing actor (omit to create new)
  saveTargetId: 'my-module',        // persist through your target
  abilityProviderIds: ['my-module'] // surface your abilities (omit for all, [] for none)
});
```

With nothing registered, CRISPR behaves exactly as standalone: built-in flat-folder target, no
custom-ability picker.

---

## The API object

Reached at `game.modules.get('pf2e-creature-crispr').api` after CRISPR's `ready` hook:

| Member | Signature | Purpose |
|---|---|---|
| `version` | `string` | CRISPR's module version (gate on a minimum if you need to). |
| `open` | `() => void` | Open CRISPR in its default state (list view, built-in target, all providers). |
| `editCreature` | `(opts?: EditCreatureOptions) => void` | Open the editor bound to a target + provider filter, editing an actor or creating new. |
| `registerAbilityProvider` | `(provider: AbilityProvider) => void` | Add a provider's abilities to the picker. |
| `registerSaveTarget` | `(target: CreatureSaveTarget) => void` | Register a persistence backend selectable by `editCreature`. |
| `searchBestiary` | `(options?: BestiaryFilterOptions, limit?: number) => Promise<BestiaryEntry[]>` | Search every loaded Actor compendium for NPCs. Self-initializing (builds/reuses its index on first call). |
| `importCreatureFromCompendium` | `(uuid: string) => Promise<string>` | Copy a compendium NPC into the world (items intact, CRISPR-managed); resolves to the new actor id. |
| `applyTroopToActor` | `(actorId: string, opts?: { troopSize?: TroopSize; formUp?: boolean }) => Promise<string>` | Make a world NPC a PF2e troop (trait + weaknesses + glossary kit only); resolves to the actor id. Idempotent. |
| `convertActorToTroop` | `(actorId: string, opts?: { providerId?: string; saveTargetId?: string } & TroopConversionOptions) => Promise<string>` | Headless **Convert to Troop**: runs the default engine (level bump, generated sweep/volley, cleared strikes, kit) and saves through a target. The editor button's non-UI twin. |
| `rescaleActorToLevel` | `(actorId: string, level: number, opts?: { saveTargetId?: string }) => Promise<string>` | Headless level rescale — the editor's level stepper without the UI. Stats recompute from benchmarks; IWR, strikes, abilities, and spells resync at the new level. |
| `exportActorSource` | `(actorId: string) => Promise<Record<string, unknown>>` | Full actor source (`actor.toObject()`) for compiling into your own pack. |
| `exportActorSourceToFile` | `(actorId: string) => Promise<void>` | The same source, written to a JSON file via the save picker. |

`searchBestiary`, `importCreatureFromCompendium`, `applyTroopToActor`, `convertActorToTroop`,
`rescaleActorToLevel`, and the two `exportActorSource*` methods are the **dev-time creature-library**
surface — a developer uses them inside a running world to assemble a creature, then compiles the exported
source into a shipped compendium. They are not a runtime import path (see "Building troops as a dev-time
flow"). The search/import/export/`applyTroopToActor` set arrived at `api.version` `0.6.0` (gate on
`>= 0.6.0`); the default conversion engine behind `convertActorToTroop` and the Convert-to-Troop button
landed at `0.8.0` (gate on `>= 0.8.0`); `rescaleActorToLevel` landed at `0.9.0` (gate on `>= 0.9.0`).

```ts
interface EditCreatureOptions {
  actorId?: string;              // edit this actor; omitted → start a new creature
  saveTargetId?: string;         // persistence backend; omitted → CRISPR's built-in default ('pf2e-creature-crispr')
  abilityProviderIds?: string[]; // providers to surface; omitted → all registered, [] → none
}
```

Registration is global and idempotent (re-registering the same `id` replaces it); call it once at
`ready`. `editCreature` selects the active target + provider filter for that launch.

---

## Contracts

These types live in the kernel (`src/creature-builder/logic/contracts.ts`, plus `EditableCreature`
in `editableCreature.ts`). They are Foundry-free and **vendored** by consumers — never import them
from CRISPR's runtime; import from your vendored copy of the kernel.

```ts
interface CustomAbilityDefinition {
  slug: string;
  name: string;
  img: string;
  group: string;            // grouping key → drives the picker's group tabs ("war-action", …)
  description: string;      // HTML; scalable @Damage/@Check macros are parsed by the kernel
  actionType: 'action' | 'reaction' | 'free' | 'passive';
  actions?: 1 | 2 | 3;
  traits?: string[];
  referenceUuid?: string;   // opaque; resolution is host-side if you ever need it
}

interface AbilityProvider {
  id: string;
  label: string;
  abilities: CustomAbilityDefinition[];
  groups?: { key: string; label: string }[]; // tab labels (falls back to the raw group key)
  troopConversion?: {                          // optional Convert-to-Troop OVERRIDES (see "Troops")
    levelDelta?: number;                        // tunes the engine's +5 default
    nameSuffix?: string;
    defaultTroopSize?: TroopSize;              // 'large' | 'huge' | 'gargantuan'
    generateAbilities?(creature: EditableCreature): CustomAbilityDefinition[]; // ADDITIVE extras, not the kit
  };
}

// Per-conversion choices the editor button / convertActorToTroop surface (kernel-level, FE-free). An
// explicit field here wins over the same field on a provider's troopConversion recipe.
interface TroopConversionOptions {
  levelDelta?: number;     // default 5, clamped −1..24
  troopSize?: TroopSize;   // default 'gargantuan'
  formUp?: boolean;        // default false — also seeds Form Up + the half-splash weakness
  keepStrikes?: boolean;   // default false — keep the source strikes instead of clearing them
  sweepName?: string;      // override the generated 1-to-3 sweep's name
  volleyName?: string;     // override the generated 2-action volley's name
}

interface StoredCreatureData {     // the flag SHAPE is shared; each target owns its flag SCOPE
  benchmarks: CreatureBenchmarks;
  baseLevel: number;
  baseStats: CreatureStats;
  importedFrom?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface CreatureSaveTarget {
  id: string;
  label: string;
  loadCreatureData?(actorId: string): StoredCreatureData | undefined; // read from your flag scope
  createActor(creature: EditableCreature): Promise<string>;           // create + stamp your flag; returns actorId
  updateActor(actorId: string, creature: EditableCreature): Promise<void>;
  cloneActor(sourceActorId: string, newName: string, creature: EditableCreature): Promise<string>; // "Save As"
  exportActor?(actorId: string): Promise<void>;                       // powers the editor's "Export" button; omit and the button no-ops
  onAfterSave?(actorId: string, creature: EditableCreature, mode: 'create' | 'update' | 'clone'): Promise<void>;
}
```

`EditableCreature`, `CreatureBenchmarks`, `CreatureStats`, and `TroopSize` are kernel types — import
them from the vendored kernel alongside the contracts. `EditableCreature` carries everything the
editor edits (name, level, benchmarks, strikes, special abilities, IWR, speeds, `isTroop`/`troopSize`).

If `loadCreatureData` is omitted (or returns `undefined`), CRISPR back-solves benchmarks from the
actor's live stats — so an actor saved under a different module's flag scope still opens sensibly.

---

## Worked example: ReignMaker (the first consumer)

ReignMaker (RM) originally forked CRISPR's creature editor. Because RM is Svelte 4, it can't mount
CRISPR's Svelte 5 editor — so RM **retires its own editor** and becomes a consumer: it injects its
army abilities + a faction-folder save target, and routes its "edit army" button to
`editCreature`. CRISPR opens as its own standalone window; RM's kingdom sheet refreshes via Foundry's
`updateActor` hook. No front-end crosses the boundary.

### 1. Map RM's data → `CustomAbilityDefinition[]`

```ts
// Import the contract types from RM's vendored copy of the kernel (e.g. src/vendor/crispr-logic).
import type { AbilityProvider, CustomAbilityDefinition, EditableCreature } from '@/vendor/crispr-logic';
import { troopAbilities } from '@/data/troopAbilities'; // RM's existing data

const abilities: CustomAbilityDefinition[] = troopAbilities.map((a) => ({
  slug: a.slug,
  name: a.name,
  img: a.img,
  group: a.category,            // e.g. 'war-action' → becomes a picker tab
  description: a.description,    // @Damage/@Check macros are parsed for tier-stepping
  actionType: a.actionType,
  actions: a.actions,
  traits: a.traits
}));
```

### 2. Register the provider (with a Convert-to-Troop recipe)

```ts
const armyProvider: AbilityProvider = {
  id: 'reignmaker-army',
  label: 'Army Actions',
  groups: [{ key: 'war-action', label: 'War Actions' }],
  abilities,
  troopConversion: {
    levelDelta: 5,                 // RM armies are +5 level as troops (matches the engine default)
    nameSuffix: ' Troop',
    defaultTroopSize: 'gargantuan',
    generateAbilities: (creature: EditableCreature) =>
      // ADDITIVE extras only — the engine already generates the sweep/volley + Troop Defenses/Movement.
      // Return just the creature-specific actions RM wants on top (deduped by name); a recipe that still
      // returns the standard kit here would duplicate the engine's. See "Convert to Troop".
      buildArmyExtras(creature)
  }
};
```

### 3. Implement a save target over RM's faction folders

```ts
import type { CreatureSaveTarget } from '@/vendor/crispr-logic';

const armyTarget: CreatureSaveTarget = {
  id: 'reignmaker-army',
  label: 'Kingdom Army',
  loadCreatureData: (actorId) => readArmyFlag(actorId),               // RM's own flag scope
  createActor: (creature) => createArmyActor(creature),               // into the faction folder
  updateActor: (actorId, creature) => syncArmyActor(actorId, creature),
  cloneActor: (sourceId, name, creature) => cloneArmyActor(sourceId, name, creature),
  onAfterSave: async (actorId, _creature, mode) => {
    if (mode === 'create' || mode === 'clone') await registerAsArmy(actorId); // RM post-save hook
  }
};
```

`createActor`/`updateActor`/`cloneActor` receive the kernel `EditableCreature`; use the vendored
kernel math (`calculateCreatureStats`, etc.) to build PF2e system data, exactly as CRISPR's built-in
target does. `cloneActor` powers "Save As".

### 4. Wire it up and route the button

```ts
Hooks.once('ready', () => {
  const crispr = game.modules.get('pf2e-creature-crispr')?.api;
  if (!crispr) { ui.notifications?.error('ReignMaker requires Creature CRISPR.'); return; }
  crispr.registerAbilityProvider(armyProvider);
  crispr.registerSaveTarget(armyTarget);
});

// RM's existing "Edit Army" button handler becomes:
function onEditArmy(actorId: string) {
  const crispr = game.modules.get('pf2e-creature-crispr')?.api;
  crispr?.editCreature({
    actorId,
    saveTargetId: 'reignmaker-army',
    abilityProviderIds: ['reignmaker-army']
  });
}
```

### 5. Refresh + cleanup

- RM's kingdom view already listens to Foundry's `updateActor` hook, so it refreshes automatically
  after a save through the target — no callback needed.
- Delete RM's own creature-editor code; the army abilities now live as data feeding the provider.

---

## Building creatures as a dev-time flow

Use CRISPR as a **creature library at dev time**: a developer, inside a running world, searches the
published bestiaries, imports a base creature, shapes it (including making it a troop), and exports the
full source to compile into their own shipped compendium. This is **not** a runtime import path — your
users never call these; you build the pack, then ship it. `api.version >= 0.6.0` carries this surface.

```ts
const crispr = game.modules.get('pf2e-creature-crispr')?.api;

// 1. Find a base creature (self-initializing — no bestiary browser to open first).
const [match] = await crispr.searchBestiary({ search: 'wolf pack' }, 1);

// 2. Copy it into the world with items intact; the copy is CRISPR-managed.
const actorId = await crispr.importCreatureFromCompendium(match.uuid);

// 3. Make it a troop (idempotent — a no-op on a creature that's already one).
await crispr.applyTroopToActor(actorId, { formUp: true });

// 4. A developer opens the editor and adds a Strike + art (CRISPR's default save target).
crispr.editCreature({ actorId });

// 5. Export the full source and compile it into your own pack.
const source = await crispr.exportActorSource(actorId);
// …write `source` into your pack's _source and build, or:
await crispr.exportActorSourceToFile(actorId); // JSON via the save picker
```

### `searchBestiary(options?, limit?)`

Searches every loaded Actor compendium for NPCs and returns `BestiaryEntry[]`
(`{ uuid, name, level, remaster, traits, source }`). Self-initializing: the first call builds an
index of every Actor pack and later calls reuse it, so you can call it cold — no need to open the
editor or the bestiary tab first.

```ts
interface BestiaryFilterOptions {
  search?: string;        // case-insensitive name substring; omitted → all NPCs
  includeLegacy?: boolean; // include pre-remaster content; default false (remaster only)
}
// limit — cap the result count; omitted or ≤ 0 → all matches.
```

### `importCreatureFromCompendium(uuid)`

Copies the compendium NPC at `uuid` into the world via Foundry's `importFromCompendium` (embedded
items preserved), back-solves its benchmarks, stamps the CRISPR flag (`importedFrom` recorded), and
resolves to the **new actor id**. Rejects non-NPC entries. The source's `publication` (e.g.
`license: 'ORC'`) rides along on the copied actor.

### `applyTroopToActor(actorId, opts?)`

Makes a world NPC a PF2e troop and resolves to the actor id.

```ts
opts?: {
  troopSize?: TroopSize; // 'large' | 'huge' | 'gargantuan'; default 'gargantuan'
  formUp?: boolean;      // also seed the Form Up ability; default false
}
```

It adds the `troop` trait, seeds any **missing** `area-damage`/`splash-damage` weakness (authored
values are kept — see "Native troops"), sets the actor's size, and embeds the standard glossary
abilities (Troop Defenses + Troop Movement always; Form Up when `formUp: true`), deduped by slug. It
does **not** touch token size, HP thresholds/segments, or immunities — the system derives troop
presentation from the trait itself. Requires a world **NPC** (rejects other actor types). Fully
idempotent: re-running, or running on an imported published troop that already has trait, weaknesses,
and abilities, changes nothing.

### `rescaleActorToLevel(actorId, level, opts?)`

Moves a world NPC to `level` (clamped −1..24) exactly as the editor's level stepper would, and
resolves to the actor id: benchmark-driven stats (AC, HP, saves, attack/damage, DCs) recompute at
the new level, raw resistance/weakness values keep their position in the new level's typical range,
and strike, ability, and spellcasting items resync. `opts.saveTargetId` persists through a
registered target instead of the active one.

The troop use case: `convertActorToTroop`'s level bump is **once-only** — an actor that is already
a troop (e.g. an imported published troop) keeps its printed level on conversion, deliberately. So
an imported troop that should sit at a different level is moved with this after import:

```ts
const actorId = await crispr.importCreatureFromCompendium(orcRaidingPartyUuid); // level 5
await crispr.rescaleActorToLevel(actorId, 10);                                  // now level 10
```

### `exportActorSource(actorId)` / `exportActorSourceToFile(actorId)`

`exportActorSource` returns the full actor source (`actor.toObject()`: `system`, `items`,
`prototypeToken`, `img`, and flags — the CRISPR flag kept so a shipped actor stays CRISPR-editable
when reimported). The data-returning form comes first so your pack tooling can consume it directly;
`exportActorSourceToFile` is a thin wrapper that writes the same JSON to a file through the save
picker. This is distinct from the editor's "Export" button, which emits a benchmark/stat snapshot
(`exportCreatureToFile`), not packageable source. That snapshot carries the benchmark/stat core plus
every non-benchmark attribute the editor holds verbatim — `speeds`, `senses`, `languages`, and IWR —
so a consumer rebuilding from it doesn't silently lose e.g. a creature's Speed.

---

## Native troops

Troops are PF2e-core and CRISPR-native (no consumer required). The `troop` trait is the whole record:
CRISPR derives `isTroop`/`troopSize` from the actor (trait + size), and the **PF2e system** derives all
troop *presentation and combat state* from the trait — 4/3/2-segment HP thresholds, the fixed 10×10-ft
(2×2-square) footprint, and unflankability — regardless of actor size. **CRISPR does not manage token
size or thresholds; the system owns them.**

- The **Defenses** section has a **Troop** toggle + a formation-size select (`large`/`huge`/
  `gargantuan`). When on, it shows level-derived area/splash weakness *guidance*.
- On save, the active target stamps the **`troop` trait** + **`area-damage`/`splash-damage`**
  weaknesses. Semantics are **seed-if-missing**: any authored `area-damage`/`splash-damage` value is
  preserved and only absent types are filled from the level table (`withTroopWeaknesses`). The table is
  a *guideline* for from-scratch troops — published troops author their own values, and those always
  win. CRISPR's built-in target does this for you; a custom target gets the kernel helpers
  `withTroopTrait` / `withTroopWeaknesses` to do the same. The guideline is **area = splash**, stepping
  **5** (L2–6) → **8** (L7–8) → **10** (L9–12) → **12** (L13) → **15** (L14–18) → **20** (L19+); below
  L2 it floors at 2. (This was realigned to the published corpus — earlier tables ran a few points low
  with splash below area.)
- **No immunities.** There is no troop *immunity* rule — the system reads only authored weaknesses at
  damage time. IWR beyond area/splash is creature-specific (the mindless-undead package on undead
  troops, etc.), so CRISPR stamps none.
- `formUp: true` seeds the Form Up ability; troops with Form Up run **splash ≈ half the area value**
  (the published cluster is 5/2, 10/5, 15/8). On `applyTroopToActor` this is convention only, but the
  conversion engine (below) *pre-seeds* the half-splash value when `formUp` is set, so it survives the
  seed-if-missing pass.
- **Save target for the dev flow.** Build packs through CRISPR's **default** save target. A consumer's
  own target (RM's faction folders / army registration) is for its *runtime* worlds, not pack-building;
  mixing scopes mid-flow makes `loadCreatureData` miss and the editor back-solve.

## Convert to Troop

**Convert to Troop** — the Defenses-section button, and its non-UI twin `convertActorToTroop(actorId, opts)`
— runs CRISPR's **default conversion engine**. No consumer recipe is required; a recipe-less conversion is
now the full transform (not a no-op). In one pass the engine:

- **Bumps the level +5** (published troop = base + 5, clamped −1..24) and rescales raw IWR values to the
  new level.
- **Suffixes the name** with ` Troop` — guarded, so an existing ` Troop` suffix is not doubled.
- **Sizes the formation** to Gargantuan (the published default; 157/162 troops are Gargantuan).
- **Generates the two published attack actions from the pre-conversion strikes, then clears the strikes**
  (published troops carry **zero** strike items — all offense is `action` items with inline
  `@Damage`/`@Check`):
  - the **best melee strike** becomes a **1-to-3-action sweep** (`"{Strike} Flurry"`): a
    `@Template[type:emanation|distance:5]` (10 ft for reach weapons) with a basic Reflex `@Check` at the
    level's `spellDC.moderate`, and three `options:area-damage` lines that keep the strike's die;
  - the **best ranged strike** becomes a **2-action volley** (`"{Strike} Volley"`): a `@Template[type:burst]`
    within the strike's range band, dice-only damage ≈ the 2-action sweep line, the same save, and a
    closing sentence shrinking the burst by 5 ft at 2 segments. Melee-only creatures get no volley.
- **Seeds the standard glossary kit** (Troop Defenses + Troop Movement; plus Form Up when `formUp` is set),
  deduped by name so it never clobbers the user's own abilities.
- Leaves the `troop` **trait** and **area/splash weaknesses** to land **on save** (seed-if-missing via
  `troopAdjusted`), exactly like the toggle. Special abilities, spellcasting, senses, speeds, languages,
  and non-area IWR **pass through untouched** (decision 1 — signature abilities are the GM's manual pass).

The per-conversion choices are `TroopConversionOptions` (kernel-level, FE-free — the editor button surfaces
the first four):

| Option | Default | Effect |
|---|---|---|
| `levelDelta` | `5` | Levels added on conversion (clamped −1..24). |
| `troopSize` | `'gargantuan'` | Formation size → token footprint. |
| `formUp` | `false` | Also seed Form Up and pre-seed the half-splash weakness. |
| `keepStrikes` | `false` | Retain the source strikes instead of clearing them. |
| `sweepName` / `volleyName` | generated | Rename the generated action items (hosts localize here). |

### Recipe as overrides, not generation

A provider's `troopConversion` recipe is now an **override/additive layer** over this engine, not the
conversion itself. `levelDelta` / `nameSuffix` / `defaultTroopSize` tune the engine (an explicit
`TroopConversionOptions` field wins over the same recipe field); **`generateAbilities` is additive** — its
output merges (by name) *alongside* the engine's sweep/volley/kit, never replacing them. Two consequences:

- **`generateAbilities(creature)` runs *after* the strikes are cleared**, so a recipe reading
  `creature.strikes` sees an empty array — unless the conversion was called with `keepStrikes: true`. If a
  recipe needs the source strikes, read them before conversion or pass `keepStrikes`.
- A recipe that used to hand-author its own Troop Defenses / 1-2-3 attacks now **duplicates** the engine's
  kit (only exact-name collisions are deduped). Trim such recipes down to genuine creature-specific extras.

### Preserved HP is a deliberate divergence

Conversion **does not touch benchmarks** — the HP benchmark carries through the +5 level bump, so the
troop's HP is recomputed at the *new* level from the base creature's HP *position*. Published troops
normalize HP to the moderate column for the troop level, so a mook-origin troop runs **leaner** than its
published equivalent. This is intentional (the benchmark system already rescales stats on a level change,
so preserving HP is *no code*); the editor's **HP benchmark control is the fix-up** when you want the
published value.

### No reverse conversion; export identity

Import-from-compendium already minted the world copy (fresh world `_id`, `importedFrom` provenance);
conversion differentiates that copy with the ` Troop` suffix + the `troop` trait. There is **no
un-convert** — recovery is **re-importing the source**. Because the converted troop is a *copy* of a
still-present source compendium doc, `exportActorSource` gives it a **fresh `_id`** so a keepId pack build
can't collide with the source doc; `importedFrom` provenance is kept.

### Toggling `setTroop(true)` first suppresses the level bump

`isTroop` is the "already a troop" signal, and it gates **only the once-only +5 level bump**. So toggling
`setTroop(true)` *before* converting suppresses just the bump — the offense transform (sweep/volley +
strike clearing), the kit, and the ` Troop` suffix all still run on a later Convert to Troop (the suffix is
skipped only when the name already ends in ` Troop`). The genuine no-op is re-converting the *result of a
full conversion*: strikes already cleared, name already suffixed, kit already present, level already bumped —
nothing changes. Convert a **non**-troop that's still at base level to get the bump. To move an
**already-troop** actor to a different level (an imported published troop at its printed level, say),
use `rescaleActorToLevel` — the once-only gate is on the *bump*, not on rescaling.

---

## Depending on CRISPR

CRISPR is a hard runtime dependency for a consumer. In your `module.json`:

```json
"relationships": {
  "requires": [{ "id": "pf2e-creature-crispr", "type": "module" }]
}
```

and always guard at the call site:

```ts
const crispr = game.modules.get('pf2e-creature-crispr');
if (!crispr?.active) return; // degrade gracefully
```

CRISPR sets `module.api` in its `ready` hook; declaring the dependency makes CRISPR load first, so
your own `ready` hook sees the API.

---

## Guarantees & notes

- **Zero-config default.** Nothing registered → CRISPR is unchanged (built-in target, no picker).
- **Stability.** The contracts are frozen in the kernel and only changed additively; gate on
  `api.version` if you need a minimum.
- **Single editor window.** The editor store is a singleton — one edit session at a time.
- **Vendoring, not importing.** Author against your vendored copy of the kernel; do not import from
  CRISPR's runtime bundle.

For in-flight API work, see `docs/plans/troop-build-api-for-reignmaker.md`.
