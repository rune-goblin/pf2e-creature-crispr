import type { CreatureStats, CreatureStrike, DamageModifier, Immunity } from '../logic/models';

export type { CreatureStats, CreatureStrike, DamageModifier, Immunity };

// EditableCreature (pure data) lives in the kernel so the contracts can reference it and consumers
// vendor it; re-exported here so editor code keeps importing it from `editor/`.
export type { EditableCreature } from '../logic/editableCreature';

export type EditorMode = 'create' | 'edit' | 'import';

export type EditorSection =
  | 'basic'
  | 'abilities'
  | 'defenses'
  | 'skills'
  | 'details'
  | 'offense'
  | 'spellcasting'
  | 'actions'
  | 'passives'
  | 'summary';

export const ALL_SECTIONS: EditorSection[] = [
  'basic',
  'abilities',
  'defenses',
  'skills',
  'details',
  'offense',
  'spellcasting',
  'actions',
  'passives',
  'summary'
];
