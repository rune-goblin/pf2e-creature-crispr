import type {
  CreatureBenchmarks,
  CreatureSense,
  CreatureSpeeds,
  CreatureStats,
  CreatureStrike,
  DamageModifier,
  Immunity,
  SpecialAbility,
  TroopSize
} from './models';

/** Working copy of a creature: actor-derived fields plus everything the editor can change. */
export interface EditableCreature {
  actorId?: string; // set when editing an existing actor
  name: string;
  level: number;
  creatureType: string;
  size: string;
  traits: string[];
  benchmarks: CreatureBenchmarks;
  baseLevel?: number; // level at which the creature was imported (canonical)
  baseStats?: CreatureStats; // exact stats at baseLevel — used verbatim, not recomputed
  strikes: CreatureStrike[];
  specialAbilities: SpecialAbility[];
  immunities: Immunity[];
  resistances: DamageModifier[];
  weaknesses: DamageModifier[];
  portraitImage?: string;
  tokenImage?: string;
  importedFrom?: string;
  sourceActorUuid?: string;
  speeds: CreatureSpeeds;
  languages: string[];
  senses: CreatureSense[];
  isTroop?: boolean;
  troopSize?: TroopSize; // formation size driving thresholds; the troop trait + area/splash weaknesses are save-derived
}

/** Field-tagged validation error: the editor keys its inline-error map by `field`; the headless save
 *  gate takes just the messages via {@link validateCreature}. Kernel-pure so both callers share it. */
export interface CreatureValidationError {
  field: 'name' | 'level';
  message: string;
}

export function validateCreatureErrors(creature: EditableCreature): CreatureValidationError[] {
  const errors: CreatureValidationError[] = [];
  if (!creature.name.trim()) errors.push({ field: 'name', message: 'Name is required' });
  if (creature.level < -1 || creature.level > 24) {
    errors.push({ field: 'level', message: 'Level must be between -1 and 24' });
  }
  return errors;
}

/** Flat message list — the headless `saveEditableCreature` throws when non-empty, before any write. */
export function validateCreature(creature: EditableCreature): string[] {
  return validateCreatureErrors(creature).map((e) => e.message);
}
