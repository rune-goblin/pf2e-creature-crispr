import type { NPCPF2e } from 'foundry-pf2e';
import type { EditableCreature } from '../logic/editableCreature';
import type { CreatureSaveTarget } from '../logic/contracts';
import type { CreatureSpeeds, CreatureStats, CreatureBenchmarks } from '../logic/models';
import { getDefaultBenchmarks } from '../logic/models';
import { analyzeStatsForBenchmarks } from '../logic/creatureStatTables';
import {
  getStrikesFromActor,
  getSpecialAbilitiesFromActor,
  getResistancesFromActor,
  getWeaknessesFromActor,
  getImmunitiesFromActor
} from './actorQueries';
import { readActorStatsAndBenchmarks, deriveBenchmarksFromActor } from './actorStatsExtractor';
import { getActiveSaveTarget } from './saveTargetRegistry';

/** `system.attributes.speed` isn't on the prepared NPC type; read it through a narrow view of just the movement fields. */
type ActorSpeedView = { speed?: { value?: number; otherSpeeds?: Array<{ type?: string; value?: number }> } };

function getSpeedsFromActor(actor: NPCPF2e | null | undefined): CreatureSpeeds {
  const speed = (actor?.system?.attributes as ActorSpeedView | undefined)?.speed;
  const speeds: CreatureSpeeds = { land: speed?.value ?? 25 };
  for (const other of speed?.otherSpeeds ?? []) {
    if (other.type && other.value != null) {
      (speeds as unknown as Record<string, number>)[other.type] = other.value;
    }
  }
  return speeds;
}

/**
 * Read a PF2e NPC into the editor's pure EditableCreature, sourcing stored benchmarks/baseStats from
 * the save target's flag scope (so a consumer's own scope loads), else back-solving from live stats.
 * The Foundry-touching head of the former store.startEditActor; the store now takes the result.
 */
export function loadCreatureForEdit(
  actorId: string,
  target: CreatureSaveTarget = getActiveSaveTarget()
): EditableCreature | null {
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  if (!actor) {
    console.error('[CreatureEditor] Actor not found:', actorId);
    return null;
  }

  const level = actor.system?.details?.level?.value ?? 1;

  // Flagged creatures keep their stored benchmarks/baseStats verbatim. Actors without the
  // flag back-solve from live stats, so editing them never resets their real numbers.
  const creatureData = target.loadCreatureData?.(actorId);
  const fromActor = creatureData ? undefined : readActorStatsAndBenchmarks(actor, level);
  const benchmarks = creatureData?.benchmarks ?? fromActor?.benchmarks ?? deriveBenchmarksFromActor(actor, level);
  const baseLevel = creatureData ? creatureData.baseLevel : level;
  const baseStats = creatureData ? creatureData.baseStats : fromActor!.baseStats;

  return {
    actorId,
    name: actor.name || 'Unknown',
    level,
    creatureType: (actor.system?.details as { creatureType?: string }).creatureType || 'creature',
    size: actor.system?.traits?.size?.value || 'medium',
    traits: actor.system?.traits?.value || [],
    benchmarks,
    baseLevel,
    baseStats,
    strikes: getStrikesFromActor(actorId),
    specialAbilities: getSpecialAbilitiesFromActor(actorId),
    immunities: getImmunitiesFromActor(actorId),
    resistances: getResistancesFromActor(actorId),
    weaknesses: getWeaknessesFromActor(actorId),
    speeds: getSpeedsFromActor(actor),
    portraitImage: actor.img,
    tokenImage: actor.prototypeToken?.texture?.src ?? undefined,
    importedFrom: creatureData?.importedFrom
  };
}

/**
 * Read a PF2e NPC into an EditableCreature for the import flow: derive benchmarks from the supplied
 * stat snapshot (kernel analysis) and read items/IWR/speeds off the live actor. The Foundry-touching
 * head of the former store.startImport.
 */
export function loadCreatureForImport(
  actorId: string,
  actorData: {
    name: string;
    level: number;
    stats: Partial<CreatureStats>;
    traits?: string[];
    size?: string;
    type?: string;
  }
): EditableCreature {
  const analyzed = analyzeStatsForBenchmarks(actorData.level, actorData.stats);
  const defaults = getDefaultBenchmarks();
  const benchmarks: CreatureBenchmarks = {
    ...defaults,
    ...analyzed,
    abilities: { ...defaults.abilities, ...(analyzed.abilities || {}) },
    saves: { ...defaults.saves, ...(analyzed.saves || {}) }
  };

  return {
    actorId,
    name: actorData.name,
    level: actorData.level,
    creatureType: actorData.type || 'creature',
    size: actorData.size || 'medium',
    traits: actorData.traits || [],
    benchmarks,
    strikes: getStrikesFromActor(actorId),
    specialAbilities: getSpecialAbilitiesFromActor(actorId),
    immunities: getImmunitiesFromActor(actorId),
    resistances: getResistancesFromActor(actorId),
    weaknesses: getWeaknessesFromActor(actorId),
    speeds: getSpeedsFromActor(game.actors?.get(actorId) as NPCPF2e | undefined),
    importedFrom: actorData.name
  };
}
