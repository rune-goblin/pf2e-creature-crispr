import type {
  CreatureBenchmarks,
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
  isTroop?: boolean;
  troopSize?: TroopSize; // formation size driving thresholds; the troop trait + area/splash weaknesses are save-derived
}
