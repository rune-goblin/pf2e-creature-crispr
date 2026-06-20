import type { CreatureBenchmarks, CreatureStats, ScalableValue } from '../logic/models';

/** Data stored as a flag on creature actors. */
export interface CreatureActorData {
  benchmarks: CreatureBenchmarks;
  baseLevel: number;        // level at which the creature was imported/created
  baseStats: CreatureStats; // exact stats at baseLevel — used verbatim when level is unchanged
  importedFrom?: string;
  createdAt: number;
  updatedAt: number;
}

/** Benchmark data stored on individual melee/ability items. */
export interface ItemBenchmarkData {
  attackBenchmark?: number;
  damageBenchmark?: number;
  persistentBenchmark?: number;
  persistentDamageType?: string;
  customDamageFormula?: string;
  customPersistentFormula?: string;
}

/** Benchmark data stored on ability items (actions, feats with category: creature). */
export interface AbilityBenchmarkData {
  descriptionTemplate?: string;       // parsed template with {0}, {1}, … placeholders
  customDescriptionTemplate?: string; // user override; takes precedence over descriptionTemplate
  scalableValues?: ScalableValue[];
  originalDescription?: string;
}

/** Lightweight creature row derived from an actor (full data via getCreatureData). */
export interface CreatureEntry {
  actorId: string;
  name: string;
  level: number;
  creatureType: string;
  size: string;
  ac: number;
  hp: number;
}
