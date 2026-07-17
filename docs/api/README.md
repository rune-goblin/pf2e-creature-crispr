# Creature CRISPR — Editor Extension API

Creature CRISPR is meant to be the **single** PF2e creature editor in a world. Other Foundry modules
don't fork or embed its UI — they **extend it at runtime through a small JS API**. A consumer can:

1. **Inject custom abilities** into the editor's ability picker (e.g. an army/troop action set), and
2. **Provide a save target** — where/how the edited actor is persisted, plus a post-save hook —
   instead of CRISPR's built-in flat folder.

It can then **launch the editor bound to those**, with *no edits to CRISPR*. CRISPR also has native
**troop** support, with an optional per-provider **Convert to Troop** recipe.

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
  troopConversion?: {                          // optional Convert-to-Troop recipe (see "Troops")
    levelDelta?: number;
    nameSuffix?: string;
    defaultTroopSize?: TroopSize;              // 'large' | 'huge' | 'gargantuan'
    generateAbilities?(creature: EditableCreature): CustomAbilityDefinition[];
  };
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
    levelDelta: 5,                 // RM armies are +5 level as troops
    nameSuffix: ' Troop',
    defaultTroopSize: 'gargantuan',
    generateAbilities: (creature: EditableCreature) =>
      // RM's standard set (Form Up / Troop Movement / Troop Defenses) + 1/2/3-action attacks,
      // scaled to creature.level. Returns CustomAbilityDefinition[].
      buildStandardTroopAbilities(creature)
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

## Native troops

Troops are PF2e-core and CRISPR-native (no consumer required):

- The **Defenses** section has a **Troop** toggle + a formation-size select (`large`/`huge`/
  `gargantuan`). When on, it shows the HP/square thresholds and the level-derived area/splash
  weakness values (read-only guidance).
- On save, the active target stamps the **`troop` trait** + **`area-damage`/`splash-damage`**
  weaknesses (CRISPR's built-in target does this for you; a custom target gets the kernel helpers
  `withTroopTrait` / `withTroopWeaknesses` to do the same).

**Convert to Troop** (the Defenses button) applies the structural transform (flag, formation size,
actor size). If the *active provider* supplies a `troopConversion` recipe, CRISPR also applies its
`levelDelta` / `nameSuffix` / `defaultTroopSize` and merges `generateAbilities(creature)` into the
creature — **without clobbering the user's existing abilities** (reconciled by name). With no recipe,
it's the structural transform only.

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
