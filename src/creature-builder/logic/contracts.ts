// Foundry-free contracts a consuming module implements to extend the editor (custom abilities +
// where/how creatures persist). They live in the kernel so they stay behind the purity gate and
// reach consumers (e.g. ReignMaker) through the same vendoring as the rest of logic/. Interfaces
// use opaque handles (actorId: string, the kernel creature model) — never Foundry types — so the
// implementations stay app-side while the contract stays clean.

import type { CreatureBenchmarks, CreatureStats, TroopSize } from './models';
import type { EditableCreature } from './editableCreature';

/** A registerable, FE-free ability definition. Shaped to map 1:1 from RM's TroopAbilityDefinition. */
export interface CustomAbilityDefinition {
  slug: string;
  name: string;
  img: string;
  group: string; // provider-defined grouping ("war-action", "army-tactic", …)
  description: string; // HTML; scalable @Damage/@Check macros parsed by the kernel
  actionType: 'action' | 'reaction' | 'free' | 'passive';
  actions?: 1 | 2 | 3;
  traits?: string[];
  referenceUuid?: string; // opaque string; resolution (fromUuid) is host-side if ever needed
}

/** A provider's "Convert to Troop" recipe: CRISPR does the structural transform, this supplies the
 *  consumer's level/size/name heuristics + the standard troop ability set. Consumed identically by the
 *  editor (store.convertToTroop) and the headless convertActorToTroop service via applyTroopConversion. */
export interface TroopConversionRecipe {
  levelDelta?: number;
  nameSuffix?: string;
  defaultTroopSize?: TroopSize;
  generateAbilities?(creature: EditableCreature): CustomAbilityDefinition[];
}

export interface AbilityProvider {
  id: string;
  label: string;
  abilities: CustomAbilityDefinition[];
  groups?: { key: string; label: string }[];
  troopConversion?: TroopConversionRecipe;
}

/** Persisted creature blob — the flag SHAPE is shared across targets; the flag SCOPE is per-target. */
export interface StoredCreatureData {
  benchmarks: CreatureBenchmarks;
  baseLevel: number; // level at which the creature was imported/created
  baseStats: CreatureStats; // exact stats at baseLevel — used verbatim when level is unchanged
  importedFrom?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Everything Foundry/actor-specific the editor delegates. A save target OWNS its folder + flag scope. */
export interface CreatureSaveTarget {
  id: string;
  label: string;
  loadCreatureData?(actorId: string): StoredCreatureData | undefined; // read from the target's flag scope
  createActor(creature: EditableCreature): Promise<string>; // create in the target's folder + stamp flag
  updateActor(actorId: string, creature: EditableCreature): Promise<void>;
  cloneActor(sourceActorId: string, newName: string, creature: EditableCreature): Promise<string>; // Save As
  exportActor?(actorId: string): Promise<void>;
  onAfterSave?(actorId: string, creature: EditableCreature, mode: 'create' | 'update' | 'clone'): Promise<void>;
}
