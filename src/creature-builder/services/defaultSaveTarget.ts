import type { ActorPF2e, ItemPF2e } from 'foundry-pf2e';
import type { EditableCreature } from '../logic/editableCreature';
import type { CreatureSaveTarget, StoredCreatureData } from '../logic/contracts';
import type { DamageModifier } from '../logic/models';
import { withTroopTrait, withTroopWeaknesses } from '../logic/troop';
import { MODULE_ID } from '@/constants';
import { createCreatureActor, cloneCreatureActor, getCreatureData } from './crud';
import { updateCreature } from './sync';
import { updateMeleeItems, updateAbilityItems } from './strikes';
import { exportCreatureToFile } from './import';

// Relies on Foundry's toObject() preserving embedded-item order: the ith source item (within a
// filter) maps to the ith clone item.
function buildItemIdMap(
  sourceActor: ActorPF2e,
  cloneActor: ActorPF2e,
  filter: (i: ItemPF2e) => boolean
): Record<string, string> {
  const sourceItems = (sourceActor.items?.contents ?? []).filter(filter);
  const cloneItems = (cloneActor.items?.contents ?? []).filter(filter);
  const map: Record<string, string> = {};
  const len = Math.min(sourceItems.length, cloneItems.length);
  for (let i = 0; i < len; i++) map[sourceItems[i].id] = cloneItems[i].id;
  return map;
}

/** Troops persist with the `troop` trait + level-derived area/splash weaknesses; non-troops unchanged. */
function troopAdjusted(creature: EditableCreature): { traits: string[]; weaknesses: DamageModifier[] } {
  if (!creature.isTroop) return { traits: creature.traits, weaknesses: creature.weaknesses };
  return {
    traits: withTroopTrait(creature.traits),
    weaknesses: withTroopWeaknesses(creature.weaknesses, creature.level)
  };
}

// CRISPR's built-in save target: the "Creature CRISPR" flat folder + the module's own flag scope.
// Wraps the existing crud/sync/import services so behaviour is identical to the pre-contract editor.
export const defaultSaveTarget: CreatureSaveTarget = {
  id: MODULE_ID,
  label: 'Creature CRISPR',

  loadCreatureData(actorId: string): StoredCreatureData | undefined {
    return getCreatureData(actorId);
  },

  createActor(creature: EditableCreature): Promise<string> {
    const { traits, weaknesses } = troopAdjusted(creature);
    return createCreatureActor(creature.name, creature.level, creature.benchmarks, {
      size: creature.size,
      creatureType: creature.creatureType,
      traits,
      portraitImage: creature.portraitImage,
      tokenImage: creature.tokenImage,
      strikes: creature.strikes,
      specialAbilities: creature.specialAbilities,
      immunities: creature.immunities,
      resistances: creature.resistances,
      weaknesses
    });
  },

  async updateActor(actorId: string, creature: EditableCreature): Promise<void> {
    const { traits, weaknesses } = troopAdjusted(creature);
    await updateCreature(actorId, {
      name: creature.name,
      level: creature.level,
      benchmarks: creature.benchmarks,
      size: creature.size,
      creatureType: creature.creatureType,
      traits,
      portraitImage: creature.portraitImage,
      tokenImage: creature.tokenImage,
      immunities: creature.immunities,
      resistances: creature.resistances,
      weaknesses
    });
    await updateMeleeItems(actorId, creature.strikes, creature.level);
    await updateAbilityItems(actorId, creature.specialAbilities, creature.level);
  },

  async cloneActor(sourceActorId: string, newName: string, creature: EditableCreature): Promise<string> {
    const newActorId = await cloneCreatureActor(sourceActorId, newName);

    const sourceActor = game.actors?.get(sourceActorId);
    const cloneActor = game.actors?.get(newActorId);
    if (!sourceActor || !cloneActor) throw new Error('Clone succeeded but new actor could not be resolved');

    const strikeMap = buildItemIdMap(sourceActor, cloneActor, (i) => i.type === 'melee');
    const abilityMap = buildItemIdMap(sourceActor, cloneActor, (i) => {
      if (i.type === 'action') return true;
      if (i.type === 'feat' && (i.system as { category?: string }).category === 'creature') return true;
      return false;
    });

    const remappedStrikes = creature.strikes.map((s) => (s.id && strikeMap[s.id] ? { ...s, id: strikeMap[s.id] } : s));
    const remappedAbilities = creature.specialAbilities.map((a) => (a.id && abilityMap[a.id] ? { ...a, id: abilityMap[a.id] } : a));

    const { traits, weaknesses } = troopAdjusted(creature);
    await updateCreature(newActorId, {
      name: newName,
      level: creature.level,
      benchmarks: creature.benchmarks,
      size: creature.size,
      creatureType: creature.creatureType,
      traits,
      portraitImage: creature.portraitImage,
      tokenImage: creature.tokenImage,
      immunities: creature.immunities,
      resistances: creature.resistances,
      weaknesses
    });
    await updateMeleeItems(newActorId, remappedStrikes, creature.level);
    await updateAbilityItems(newActorId, remappedAbilities, creature.level);

    return newActorId;
  },

  async exportActor(actorId: string): Promise<void> {
    await exportCreatureToFile(actorId);
  }
};
