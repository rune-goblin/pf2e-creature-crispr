import type { ScalableValue } from '../logic/models';
import type { StoredCreatureData } from '../logic/contracts';

/** Data stored as a flag on creature actors — the kernel's shared StoredCreatureData shape (benchmarks,
 *  baseLevel, baseStats, importedFrom) with CRISPR's own create/update timestamps made required. */
export interface CreatureActorData extends StoredCreatureData {
  createdAt: number;
  updatedAt: number;
}

/** Benchmark data stored on individual melee/ability items. */
export interface ItemBenchmarkData {
  attackBenchmark?: number;
  damageBenchmark?: number;
  /** 2: `damageBenchmark` judges main + direct extra rolls, extrapolated past the table. Legacy flags
   *  judged one roll, clamped to 0–1, so the reader re-derives their benchmark from the item. */
  damageVersion?: 2;
  /** Every roll's formula as last authored, so level round trips don't compound rounding. */
  damageOrigin?: StrikeDamageOrigin;
  customDamageFormula?: string;
  /** Legacy fields: mirror the first persistent roll for consumers (ReignMaker) that still read them. */
  persistentBenchmark?: number;
  persistentDamageType?: string;
  customPersistentFormula?: string;
}

export interface StrikeDamageOrigin {
  main: string;
  mainLevel?: number;
  mainRollKey?: string;
  parts: Record<string, { formula: string; level: number }>;
}

/** Per-entry benchmark data stored on spellcasting-entry items. `primary` marks the single entry
 *  the editor's spellDC/spellAttack benchmark edits (the first non-innate entry, or first if all innate). */
export interface SpellEntryBenchmarkData {
  dcBenchmark?: number;
  attackBenchmark?: number;
  primary?: boolean;
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
  img: string;
}
