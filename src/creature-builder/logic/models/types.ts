/**
 * Creature - Represents a Pathfinder 2e creature/monster with benchmark-based stats
 *
 * Uses scalar benchmark values (0.0-1.0) for smooth interpolation between
 * stat levels. This allows:
 * - Smooth stat scaling when level changes
 * - Preservation of relative stat positioning when importing creatures
 * - Values between standard benchmarks (terrible/low/moderate/high/extreme)
 */

export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

// Troop sizes - troops are typically large or larger
export type TroopSize = 'large' | 'huge' | 'gargantuan';

export type AbilityScore = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITY_SCORES: AbilityScore[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_SCORE_LABELS: Record<AbilityScore, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma'
};

export type SpellTradition = 'arcane' | 'divine' | 'occult' | 'primal';
export const SPELL_TRADITIONS: SpellTradition[] = ['arcane', 'divine', 'occult', 'primal'];
type SpellcastingType = 'prepared' | 'spontaneous' | 'innate';

export type SpellProgressionType = 'fullPrepared' | 'fullSpontaneous' | 'bounded' | 'innate' | 'none';

/** Divine font type (cleric feature granting extra heal or harm slots) */
export type SpellFont = 'harm' | 'heal';

/** Spell rank (0-10) -> slot count */
export type SpellSlotLayout = Record<number, number>;

type Rarity = 'common' | 'uncommon' | 'rare' | 'unique';
export type SenseAcuity = 'precise' | 'imprecise' | 'vague';
export type SenseType =
  | 'darkvision' | 'greater-darkvision' | 'low-light-vision' | 'see-invisibility' | 'truesight'
  | 'bloodsense' | 'echolocation' | 'infrared-vision' | 'lifesense' | 'magicsense'
  | 'motion-sense' | 'scent' | 'spiritsense' | 'thoughtsense' | 'tremorsense' | 'wavesense';

/**
 * Creature sense data
 */
export interface CreatureSense {
  type: SenseType;
  acuity?: SenseAcuity;
  range?: number;  // In feet
}

export const SENSE_TYPES: SenseType[] = [
  'darkvision', 'greater-darkvision', 'low-light-vision', 'see-invisibility', 'truesight',
  'infrared-vision', 'scent', 'tremorsense', 'lifesense', 'bloodsense', 'echolocation',
  'magicsense', 'motion-sense', 'spiritsense', 'thoughtsense', 'wavesense'
];

export const SENSE_ACUITIES: SenseAcuity[] = ['precise', 'imprecise', 'vague'];

// Vision-family senses default to precise with no range; everything else is imprecise + ranged.
const PRECISE_VISION_SENSES: SenseType[] = [
  'darkvision', 'greater-darkvision', 'low-light-vision', 'see-invisibility', 'truesight', 'infrared-vision'
];

export function defaultSenseAcuity(type: SenseType): SenseAcuity {
  return PRECISE_VISION_SENSES.includes(type) ? 'precise' : 'imprecise';
}

/**
 * Movement speeds for a creature
 */
export interface CreatureSpeeds {
  land: number;
  burrow?: number;
  climb?: number;
  fly?: number;
  swim?: number;
}

/**
 * Strike/attack action for a creature
 */
export interface CreatureStrike {
  id?: string;                // Item ID on the actor (for updates)
  name: string;
  attackBenchmark: number;    // Scalar 0-1 for attack bonus
  damageBenchmark: number;    // Scalar 0-1 for damage
  attackBonus: number;        // Computed from benchmark + level
  customAttackBonus?: number; // User-specified attack bonus override (from import or manual)
  damage: string;             // Dice formula like "2d8+6" (computed or custom)
  customDamageFormula?: string;  // User-specified formula override
  damageType: string;         // slashing, piercing, bludgeoning, etc.
  traits?: string[];
  range?: number;             // For ranged attacks (in feet)
  isRanged?: boolean;         // True for ranged attacks

  // Persistent damage component (optional)
  persistentDamage?: string;        // e.g., "1d6" - computed from benchmark
  customPersistentFormula?: string; // User override
  persistentDamageType?: string;    // e.g., "fire"
  persistentBenchmark?: number;     // Scalar 0-1 (uses 3-benchmark system: low/moderate/high)
}

/**
 * Spell entry for creature spellcasting
 */
interface CreatureSpell {
  name: string;
  level: number;
  uses?: number;  // For innate spells with limited uses
}

/**
 * Full spellcasting data for a creature
 */
interface CreatureSpellcasting {
  tradition: SpellTradition;
  type: SpellcastingType;
  dc: number;
  attack?: number;
  focusPoints?: number;
  spells: Record<number, CreatureSpell[]>;  // Keyed by spell level (0-10)
}

/**
 * Scalar benchmarks for creature stats (0.0 = terrible, 1.0 = extreme)
 * Allows smooth interpolation and preserves relative positioning
 */
export interface CreatureBenchmarks {
  abilities: Record<AbilityScore, number>;  // 0.0-1.0 for each ability
  perception: number;
  ac: number;
  hp: number;  // Note: HP only uses low/moderate/high in PF2e rules
  saves: {
    fortitude: number;
    reflex: number;
    will: number;
  };
  strikeAttack: number;
  strikeDamage: number;
  skills: Array<{ skill: string; benchmark: number }>;
  spellDC?: number;
  spellAttack?: number;
  spellProgression?: SpellProgressionType;
  spellTradition?: SpellTradition;
  spellFont?: SpellFont;
  /** Per-rank absolute slot count overrides. Keys are ranks, values replace the computed slot count. */
  spellSlotOverrides?: Record<number, number>;
}

/**
 * Computed stats derived from level + scalar benchmarks
 * These are the actual values displayed and used in gameplay
 */
export interface CreatureStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  ac: number;
  hp: number;
  fortitude: number;
  reflex: number;
  will: number;
  perception: number;
  strikeAttackBonus: number;
  strikeDamage: string;  // Dice formula like "2d8+6"
  strikeDamageAverage: number;  // Average damage from the formula
  skills: Record<string, number>;
  spellDC?: number;
  spellAttack?: number;
  spellSlots?: SpellSlotLayout;
}

/**
 * A scalable value within a special ability (damage formula, DC, or fast-healing/regeneration amount).
 *
 * `healing` values are the flat HP amount of a PF2e FastHealing rule element. Unlike damage/dc/persistent,
 * the value lives on the item's rule + name rather than inside the description text, so it has no `{N}`
 * placeholder in `descriptionTemplate` — the editor surfaces it directly from `scalableValues`.
 */
export interface ScalableValue {
  type: 'damage' | 'dc' | 'persistent' | 'healing';
  benchmark: number;           // Scalar 0-1 representing the benchmark level (immutable after parse)
  originalValue: string;       // Original value from import (e.g., "2d6+4" or "25")
  baseLevel?: number;          // Creature level at which this value was parsed. When the current level matches, the recommendation is the literal `originalValue` instead of the (lossy) benchmark-scaled form.
  damageType?: string;         // For damage/persistent: fire, cold, poison, etc.
  checkType?: string;          // For dc: the save type (will, fortitude, reflex) from @Check format
  override?: number;           // Tier-based override (benchmark scalar 0-1). Scales with level. Replaces `benchmark`.
  customValue?: string;        // Absolute override (raw formula or integer string, e.g. "1d10" / "27"). Takes precedence over override and does NOT auto-scale on level change.
}

/**
 * Special ability or action for a creature
 */
export interface SpecialAbility {
  id: string;
  name: string;
  description: string;
  descriptionTemplate?: string;  // Parsed template with {0}, {1}, etc. placeholders for scalable values
  customDescriptionTemplate?: string;  // User-edited override template. Takes precedence over descriptionTemplate when set. Should still contain {N} placeholders for scalable values the user wants inserted.
  scalableValues?: ScalableValue[];  // Scalable damage/DC values
  actionType: 'action' | 'reaction' | 'free' | 'passive';
  actions?: 1 | 2 | 3;  // Number of actions if actionType is 'action'
  traits?: string[];
  /**
   * Present when the ability carries a PF2e FastHealing rule element (fast healing / regeneration).
   * The healing amount itself is a `ScalableValue` of type 'healing' in `scalableValues`; this marker
   * records the rule's kind + deactivation types so the amount can be written back to the rule + name.
   */
  fastHealing?: {
    kind: 'fast-healing' | 'regeneration';
    deactivatedBy?: string[];  // regeneration only: damage-type slugs that suppress it
  };
}

/**
 * Resistance or weakness to a damage type.
 * `exceptions`/`doubleVs` hold IWR type slugs (see config/iwrTypes). `doubleVs` is
 * resistance-only (damage matching it is resisted at double value).
 */
export interface DamageModifier {
  type: string;   // e.g., "fire", "cold", "slashing", "physical", "all-damage"
  value: number;  // Amount of resistance/weakness
  exceptions?: string[];  // qualities/materials that bypass it, e.g. ["silver","adamantine"]
  doubleVs?: string[];    // resistance-only: damage resisted at double, e.g. ["non-magical"]
}

/** Immunity to a damage type, condition, or effect. Immunities carry no value. */
export interface Immunity {
  type: string;
  exceptions?: string[];
}

/**
 * Core creature data structure
 * Captures comprehensive PF2e NPC data for saving/loading
 */
export interface Creature {
  id: string;
  name: string;
  level: number;  // -1 to 24
  actorId?: string;  // Link to Foundry NPC actor (optional)

  // Scalar benchmarks (0.0-1.0) for stat calculation
  benchmarks: CreatureBenchmarks;

  // Basic creature info
  traits: string[];
  size: CreatureSize;
  creatureType: string;  // e.g., "humanoid", "beast", "undead"
  rarity: Rarity;
  alignment?: string;  // e.g., "CE", "LG", "N"

  // Computed/actual stats (populated when saving)
  // These are the real values derived from benchmarks
  stats?: CreatureStats;

  // Perception and senses
  senses: CreatureSense[];
  languages: string[];

  // Movement
  speeds: CreatureSpeeds;

  // Defenses
  immunities: Immunity[];
  resistances: DamageModifier[];
  weaknesses: DamageModifier[];

  // Attacks
  strikes: CreatureStrike[];

  // Spellcasting (can have multiple entries)
  spellcasting?: CreatureSpellcasting[];

  // Special abilities and actions
  specialAbilities: SpecialAbility[];

  // Images
  portraitImage?: string;  // Actor portrait/sheet image
  tokenImage?: string;     // Map token image

  // Additional notes/description
  description?: string;
  publicNotes?: string;
  privateNotes?: string;

  // Metadata
  createdAt: number;
  updatedAt?: number;
  importedFrom?: string;  // Source if imported (e.g., "Bestiary 1", actor name)
  sourceBook?: string;    // Original source book if known

  // Troop-specific fields
  isTroop?: boolean;      // True if this creature is a troop
  troopSize?: TroopSize;  // Troop formation size (default: 'gargantuan')
}

/**
 * Common damage types for resistances/weaknesses/immunities
 * PF2e Remaster types (positive→vitality, negative→void, alignment types removed, spirit added)
 */
export const DAMAGE_TYPES = [
  // Physical
  'bludgeoning',
  'piercing',
  'slashing',
  'bleed',
  // Energy
  'acid',
  'cold',
  'electricity',
  'fire',
  'force',
  'sonic',
  'vitality',
  'void',
  // Other
  'mental',
  'poison',
  'precision',
  'spirit',
  'untyped'
] as const;
