import type {
  CreatureBenchmarks,
  CreatureSpeeds,
  CreatureStats,
  CreatureStrike,
  DamageModifier,
  SpecialAbility
} from '../models';

export type { CreatureStats, CreatureStrike, DamageModifier };

export type EditorMode = 'create' | 'edit' | 'import';

export type EditorSection =
  | 'basic'
  | 'abilities'
  | 'defenses'
  | 'skills'
  | 'offense'
  | 'spellcasting'
  | 'specialAbilities'
  | 'summary';

export const ALL_SECTIONS: EditorSection[] = [
  'basic',
  'abilities',
  'defenses',
  'skills',
  'offense',
  'spellcasting',
  'specialAbilities',
  'summary'
];

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
  resistances: DamageModifier[];
  weaknesses: DamageModifier[];
  portraitImage?: string;
  tokenImage?: string;
  importedFrom?: string;
  sourceActorUuid?: string;
  speeds: CreatureSpeeds;
}
