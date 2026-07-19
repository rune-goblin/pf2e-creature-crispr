import type { NPCPF2e } from 'foundry-pf2e';
import type { EditableCreature } from '../logic/editableCreature';
import type { CreatureSaveTarget } from '../logic/contracts';
import type { CreatureStats, CreatureBenchmarks, TroopSize } from '../logic/models';
import { getDefaultBenchmarks, TROOP_SIZES } from '../logic/models';
import { pf2eToSize } from '../logic/sizes';
import { analyzeStatsForBenchmarks } from '../logic/creatureStatTables';
import {
  getStrikesFromActor,
  getSpecialAbilitiesFromActor,
  getResistancesFromActor,
  getWeaknessesFromActor,
  getImmunitiesFromActor,
  getSpeedsFromActor,
  getLanguagesFromActor,
  getSensesFromActor
} from './actorQueries';
import { readActorStatsAndBenchmarks, deriveBenchmarksFromActor } from './actorStatsExtractor';
import { getActiveSaveTarget } from './saveTargetRegistry';

// TroopSize only spans large/huge/gargantuan; the system forces a grg token footprint regardless of
// stored size, so a troop authored at any other size loads at the gargantuan default.
function toTroopSize(size: string): TroopSize {
  return (TROOP_SIZES as readonly string[]).includes(size) ? (size as TroopSize) : 'gargantuan';
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
  const traits = actor.system?.traits?.value || [];
  const size = pf2eToSize(actor.system?.traits?.size?.value || 'med');
  // Troop-ness is not persisted in the flag — the actor is the record (trait + size).
  const isTroop = traits.includes('troop');

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
    size,
    traits,
    benchmarks,
    baseLevel,
    baseStats,
    strikes: getStrikesFromActor(actorId),
    specialAbilities: getSpecialAbilitiesFromActor(actorId),
    immunities: getImmunitiesFromActor(actorId),
    resistances: getResistancesFromActor(actorId),
    weaknesses: getWeaknessesFromActor(actorId),
    speeds: getSpeedsFromActor(actorId),
    languages: getLanguagesFromActor(actorId),
    senses: getSensesFromActor(actorId),
    portraitImage: actor.img,
    tokenImage: actor.prototypeToken?.texture?.src ?? undefined,
    importedFrom: creatureData?.importedFrom,
    isTroop,
    troopSize: isTroop ? toTroopSize(size) : undefined
  };
}

/**
 * Drop the fabricated strike a strike-less actor loads with. `getStrikesFromActor` returns a no-id
 * default "Melee Strike" so the editor always shows a row, but a save mints a real melee item from
 * any id-less strike — so headless load→transform→save paths must call this, or rescaling/converting
 * a strike-less actor (every published troop) plants a phantom strike. Real loaded strikes always
 * carry their item id and survive.
 */
export function dropPlaceholderStrikes(creature: EditableCreature): void {
  creature.strikes = creature.strikes.filter((s) => s.id);
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
    size: pf2eToSize(actorData.size || 'med'),
    traits: actorData.traits || [],
    benchmarks,
    strikes: getStrikesFromActor(actorId),
    specialAbilities: getSpecialAbilitiesFromActor(actorId),
    immunities: getImmunitiesFromActor(actorId),
    resistances: getResistancesFromActor(actorId),
    weaknesses: getWeaknessesFromActor(actorId),
    speeds: getSpeedsFromActor(actorId),
    languages: getLanguagesFromActor(actorId),
    senses: getSensesFromActor(actorId),
    importedFrom: actorData.name
  };
}
