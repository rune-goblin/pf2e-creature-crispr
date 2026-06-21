# Creature CRISPR — extension API

Creature CRISPR is the single creature editor; other Foundry modules extend it at **runtime via a
JS API** (no shared front-end). A consumer can inject **custom abilities** (into the editor's
ability picker) and a **save target** (where/how the actor persists, plus a post-save hook), then
launch the editor bound to them — with **no edits to CRISPR**.

The contracts below live in CRISPR's Foundry-free **kernel** (`src/creature-builder/logic/`) and are
meant to be vendored by consumers, so you author against the same types CRISPR uses.

## The API object

After CRISPR's `ready`, the API hangs off the module:

```ts
const crispr = game.modules.get('pf2e-creature-crispr')?.api;
```

| Member | Signature | Purpose |
|---|---|---|
| `version` | `string` | CRISPR's module version (for compatibility checks). |
| `open` | `() => void` | Open CRISPR in its default state (list view, built-in target, all providers). |
| `editCreature` | `(opts?: EditCreatureOptions) => void` | Open the editor bound to a target + provider filter, editing an actor or creating new. |
| `registerAbilityProvider` | `(provider: AbilityProvider) => void` | Add a provider's abilities to the picker. |
| `registerSaveTarget` | `(target: CreatureSaveTarget) => void` | Register a persistence backend selectable by `editCreature`. |

```ts
interface EditCreatureOptions {
  actorId?: string;            // edit this actor; omitted → start a new creature
  saveTargetId?: string;       // persistence backend; omitted → CRISPR's built-in default
  abilityProviderIds?: string[]; // providers to surface; omitted → all registered, [] → none
}
```

## Contracts

```ts
interface CustomAbilityDefinition {
  slug: string;
  name: string;
  img: string;
  group: string;            // provider-defined grouping ("war-action", "army-tactic", …) — drives the picker tabs
  description: string;      // HTML; scalable @Damage/@Check macros are parsed by the kernel
  actionType: 'action' | 'reaction' | 'free' | 'passive';
  actions?: 1 | 2 | 3;
  traits?: string[];
  referenceUuid?: string;   // opaque; resolution is host-side if ever needed
}

interface AbilityProvider {
  id: string;
  label: string;
  abilities: CustomAbilityDefinition[];
  groups?: { key: string; label: string }[]; // labels for the group tabs (falls back to the raw key)
  troopConversion?: { /* Phase 4 — Convert to Troop recipe */ };
}

interface StoredCreatureData {        // the flag SHAPE is shared; each target owns its flag SCOPE
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
  loadCreatureData?(actorId: string): StoredCreatureData | undefined; // read from the target's flag scope
  createActor(creature: EditableCreature): Promise<string>;           // create in the target's folder + stamp flag
  updateActor(actorId: string, creature: EditableCreature): Promise<void>;
  cloneActor(sourceActorId: string, newName: string, creature: EditableCreature): Promise<string>; // Save As
  exportActor?(actorId: string): Promise<void>;
  onAfterSave?(actorId: string, creature: EditableCreature, mode: 'create' | 'update' | 'clone'): Promise<void>;
}
```

`EditableCreature`, `CreatureBenchmarks`, and `CreatureStats` are kernel types — import them from the
vendored kernel alongside the contracts.

## Usage

Register in your module's `ready` hook (after CRISPR's `ready` has set up the API), then route your
own UI to `editCreature`:

```ts
Hooks.once('ready', () => {
  const crispr = game.modules.get('pf2e-creature-crispr')?.api;
  if (!crispr) return; // hard dependency — declare it in your module.json and guard here

  crispr.registerAbilityProvider({
    id: 'reignmaker-army',
    label: 'Army Actions',
    groups: [{ key: 'war-action', label: 'War Actions' }],
    abilities: myArmyAbilities // CustomAbilityDefinition[]
  });

  crispr.registerSaveTarget({
    id: 'reignmaker-army',
    label: 'Kingdom Army',
    loadCreatureData: (actorId) => readArmyFlag(actorId),
    createActor: (creature) => createArmyActor(creature),       // into the faction folder
    updateActor: (actorId, creature) => syncArmyActor(actorId, creature),
    cloneActor: (src, name, creature) => cloneArmyActor(src, name, creature),
    onAfterSave: async (actorId) => registerAsArmy(actorId)     // post-save hook
  });
});

// Your own "edit army" button:
crispr.editCreature({ actorId, saveTargetId: 'reignmaker-army', abilityProviderIds: ['reignmaker-army'] });
```

CRISPR opens its editor as its own standalone window; on save it routes through your target, and your
UI refreshes via Foundry's `updateActor` hook.

## Notes & guarantees

- **Zero-config default.** With nothing registered, CRISPR uses its built-in flat-folder target and
  shows no provider picker — identical to standalone use.
- **Stability.** The contracts are frozen in the kernel and changed additively only; `api.version`
  lets you gate on a minimum.
- **Hard dependency.** A consumer must declare CRISPR in its `module.json` and guard for its absence
  (`game.modules.get('pf2e-creature-crispr')?.active`).
- **Single editor window.** The editor store is a singleton — one edit session at a time.
- **Design / phasing:** see `docs/plans/creature-editor-extension-api.md`.
