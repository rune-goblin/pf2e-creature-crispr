/**
 * Reads a Foundry actor into this module's domain types.
 *
 * `extractFullStatsFromActor` returns a complete `CreatureStats` (the canonical
 * `baseStats`); `deriveBenchmarksFromActor` back-solves the scalar benchmarks an
 * actor's stats correspond to. Both the import services and the editor's
 * edit-existing-actor path go through these, so a creature is read the same way
 * regardless of where it came from. `extractStatsFromActor` (12 base stats only) is
 * the shared primitive the full extractor builds on.
 */

import type { NPCPF2e, MeleePF2e } from 'foundry-pf2e';
import type { CreatureStats, CreatureBenchmarks } from '../logic/models';
import { getDefaultBenchmarks } from '../logic/models';
import { analyzeStatsForBenchmarks } from '../logic/creatureStatTables';
import { extractSpellcastingStats, extractSpellcastingProgression } from './spells';
import { parseDiceFormulaAverage } from '../logic/abilityScaling';

/** The 12 base stats. Perception reads both the newer `system.perception.value` and the older `system.attributes.perception.value` shape. */
function extractStatsFromActor(actor: NPCPF2e): Pick<CreatureStats,
  'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'ac' | 'hp' | 'perception' | 'fortitude' | 'reflex' | 'will'
> {
  // The legacy `attributes.perception.value` shape isn't on the prepared NPC type.
  const legacyPerception = (actor.system.attributes as { perception?: { value?: number } }).perception?.value;
  return {
    str: actor.system?.abilities?.str?.mod ?? 0,
    dex: actor.system?.abilities?.dex?.mod ?? 0,
    con: actor.system?.abilities?.con?.mod ?? 0,
    int: actor.system?.abilities?.int?.mod ?? 0,
    wis: actor.system?.abilities?.wis?.mod ?? 0,
    cha: actor.system?.abilities?.cha?.mod ?? 0,
    ac: actor.system?.attributes?.ac?.value ?? 10,
    hp: actor.system?.attributes?.hp?.max ?? 10,
    perception: actor.system?.perception?.value ?? legacyPerception ?? 0,
    fortitude: actor.system?.saves?.fortitude?.value ?? 0,
    reflex: actor.system?.saves?.reflex?.value ?? 0,
    will: actor.system?.saves?.will?.value ?? 0,
  };
}

/** Non-zero trained skills, keyed by skill name. */
function extractSkillsFromActor(actor: NPCPF2e): Record<string, number> {
  const skills: Record<string, number> = {};
  for (const [skillName, skillData] of Object.entries(actor.system?.skills ?? {})) {
    const value = skillData?.base ?? skillData?.value ?? 0;
    if (value !== 0) skills[skillName] = value;
  }
  return skills;
}

/** First non-persistent melee strike's attack bonus and damage; defaults when the actor has none. */
function extractPrimaryStrike(actor: NPCPF2e): Pick<CreatureStats, 'strikeAttackBonus' | 'strikeDamage' | 'strikeDamageAverage'> {
  const melee = (actor.items?.contents ?? []).find((i): i is MeleePF2e<NPCPF2e> => i.type === 'melee');
  if (!melee) return { strikeAttackBonus: 0, strikeDamage: '1d4', strikeDamageAverage: 2.5 };

  const strikeAttackBonus = melee.system?.bonus?.value ?? 0;
  for (const roll of Object.values(melee.system?.damageRolls ?? {})) {
    if (roll.category !== 'persistent' && roll.damage) {
      return { strikeAttackBonus, strikeDamage: roll.damage, strikeDamageAverage: parseDiceFormulaAverage(roll.damage) };
    }
  }
  return { strikeAttackBonus, strikeDamage: '1d4', strikeDamageAverage: 2.5 };
}

/**
 * Build a complete `CreatureStats` from a live actor (12 base stats + skills + primary
 * strike + spell DC/attack). Producers of `baseStats` must use this rather than casting
 * the partial `extractStatsFromActor` result — `skills`/strike fields are required, and a
 * missing `skills` makes the statblock crash on `Object.keys(undefined)`.
 */
export function extractFullStatsFromActor(actor: NPCPF2e): CreatureStats {
  return {
    ...extractStatsFromActor(actor),
    ...extractPrimaryStrike(actor),
    skills: extractSkillsFromActor(actor),
    ...extractSpellcastingStats(actor)
  };
}

/**
 * Reverse-engineer the scalar benchmarks an actor's stats correspond to, overlaid on the
 * defaults. Analyzes the full stats so skill and strike benchmarks are back-solved too
 * (otherwise the editor's Skills/Offense sections would be empty while the statblock shows
 * those stats). Used for both importing an actor and editing one that has no stored flag.
 */
export function deriveBenchmarksFromActor(actor: NPCPF2e, level: number): CreatureBenchmarks {
  return deriveBenchmarks(actor, level, extractFullStatsFromActor(actor));
}

/** Back-solve benchmarks from an already-extracted stat block (shared so the extraction runs once). */
function deriveBenchmarks(actor: NPCPF2e, level: number, baseStats: CreatureStats): CreatureBenchmarks {
  const analyzed = analyzeStatsForBenchmarks(level, baseStats);
  const { progression, tradition, font } = extractSpellcastingProgression(actor);
  const defaults = getDefaultBenchmarks();
  return {
    ...defaults,
    ...analyzed,
    abilities: { ...defaults.abilities, ...(analyzed.abilities ?? {}) },
    saves: { ...defaults.saves, ...(analyzed.saves ?? {}) },
    ...(progression !== 'none' ? { spellProgression: progression } : {}),
    ...(tradition ? { spellTradition: tradition } : {}),
    ...(font ? { spellFont: font } : {})
  };
}

/**
 * Read an actor once into both its canonical `baseStats` and the benchmarks those stats back-solve
 * to. Callers needing both (import, edit-unflagged-actor) use this so the full extraction runs once.
 */
export function readActorStatsAndBenchmarks(
  actor: NPCPF2e,
  level: number
): { baseStats: CreatureStats; benchmarks: CreatureBenchmarks } {
  const baseStats = extractFullStatsFromActor(actor);
  return { baseStats, benchmarks: deriveBenchmarks(actor, level, baseStats) };
}
