/**
 * Creature Service - Spellcasting helpers
 *
 * Extract and sync helpers for PF2e spellcasting entries on creature actors.
 */

import type { NPCPF2e, SpellcastingEntryPF2e } from 'foundry-pf2e';
import type { CreatureBenchmarks, SpellProgressionType, SpellTradition, SpellFont } from '../logic/models';
import {
  deduceSpellProgression,
  detectFont,
  getSpellSlots,
  resizePreparedSlots,
  MAX_SPELL_RANK
} from '../logic/spellSlotTables';
import {
  calculateCreatureStats,
  getStatRangesForLevel,
  spellStatToScalar,
  interpolateSpellStat
} from '../logic/creatureStatTables';
import { logger } from './logger';
import { CREATURE_FLAG, SPELL_BENCHMARK_KEY } from './constants';
import type { SpellEntryBenchmarkData } from './types';

/** Per-rank spell-slot record; computed `slot${rank}` keys aren't on the prepared entry type. */
type SpellSlots = Record<string, { max?: number; prepared?: Array<{ id?: string | null; expended?: boolean }> }>;

function getSpellcastingEntries(actor: NPCPF2e): SpellcastingEntryPF2e<NPCPF2e>[] {
  return actor.items?.contents?.filter((i): i is SpellcastingEntryPF2e<NPCPF2e> => i.type === 'spellcastingEntry') ?? [];
}

/**
 * The entry the editor's single spellDC/spellAttack benchmark edits: the first non-innate entry,
 * or the first entry if all are innate. Chosen by this deterministic rule (not the stored flag) so
 * import-time extraction, flag stamping, and level sync all agree — extraction runs before the flag
 * is stamped, and legacy actors carry no flag at all.
 */
export function getPrimarySpellcastingEntry(entries: SpellcastingEntryPF2e<NPCPF2e>[]): SpellcastingEntryPF2e<NPCPF2e> | undefined {
  if (entries.length === 0) return undefined;
  return entries.find((e) => e.system?.prepared?.value !== 'innate') ?? entries[0];
}

/**
 * The primary entry's spell DC and spell attack. The editor exposes a single spellDC/spellAttack
 * benchmark, so it edits the primary entry only; every other entry keeps its own per-entry benchmark.
 */
export function extractSpellcastingStats(actor: NPCPF2e): { spellDC?: number; spellAttack?: number } {
  const primary = getPrimarySpellcastingEntry(getSpellcastingEntries(actor));
  if (!primary) return {};
  return { spellDC: primary.system?.spelldc?.dc, spellAttack: primary.system?.spelldc?.value };
}

/**
 * Stamp a per-entry benchmark flag on every spellcasting entry at import, mirroring the melee/ability
 * stampers. Each entry's DC/attack back-solve to their own scalar so a later level change scales each
 * entry independently; `primary: true` marks the entry the editor's single spell benchmark drives.
 */
export async function addBenchmarkFlagsToSpellcastingEntries(actor: NPCPF2e, level: number): Promise<void> {
  const entries = getSpellcastingEntries(actor);
  if (entries.length === 0) return;

  const ranges = getStatRangesForLevel(level);
  const primary = getPrimarySpellcastingEntry(entries);
  const updates: EmbeddedDocumentUpdateData[] = [];

  for (const entry of entries) {
    const dc = entry.system?.spelldc?.dc;
    const attack = entry.system?.spelldc?.value;
    const data: SpellEntryBenchmarkData = {};
    if (dc !== undefined) data.dcBenchmark = spellStatToScalar(dc, ranges.spellDC);
    if (attack !== undefined) data.attackBenchmark = spellStatToScalar(attack, ranges.spellAttack);
    if (entry.id === primary?.id) data.primary = true;

    updates.push({
      _id: entry.id,
      [`flags.${CREATURE_FLAG}.${SPELL_BENCHMARK_KEY}`]: data
    });
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
  }
}

/**
 * Extract spellcasting progression type, tradition, and divine font from an actor's spellcasting entries.
 * Analyzes non-innate entries to deduce the closest standard progression pattern.
 * Detects divine font by checking for excess Heal/Harm slots at the highest rank.
 */
export function extractSpellcastingProgression(actor: NPCPF2e): {
  progression: SpellProgressionType;
  tradition?: SpellTradition;
  font?: SpellFont;
  slotOverrides?: Record<number, number>;
} {
  const spellcastingEntries = actor.items?.contents?.filter((i): i is SpellcastingEntryPF2e<NPCPF2e> => i.type === 'spellcastingEntry') ?? [];

  if (spellcastingEntries.length === 0) {
    return { progression: 'none' };
  }

  // Separate innate and focus from standard entries
  const nonInnateEntries = spellcastingEntries.filter((e) => {
    const preparedType = e.system?.prepared?.value;
    return preparedType !== 'innate' && preparedType !== 'focus';
  });

  if (nonInnateEntries.length === 0) {
    // Only innate/focus spellcasting
    return { progression: 'innate', tradition: spellcastingEntries[0]?.system?.tradition?.value as SpellTradition | undefined };
  }

  // Use the first non-innate entry for analysis
  const primaryEntry = nonInnateEntries[0];
  const castingType = primaryEntry.system?.prepared?.value || 'prepared';
  const tradition = primaryEntry.system?.tradition?.value as SpellTradition | undefined;

  // Build slot-count profile from the entry's slots
  const slotsByRank: Record<number, number> = {};
  const slots = (primaryEntry.system?.slots ?? {}) as SpellSlots;
  for (let rank = 1; rank <= 10; rank++) {
    const slotKey = `slot${rank}`;
    const max = slots[slotKey]?.max ?? 0;
    if (max > 0) {
      slotsByRank[rank] = max;
    }
  }

  // Get the creature's level for font detection
  const level = actor.system?.details?.level?.value ?? 1;

  const progression = deduceSpellProgression(castingType, slotsByRank, level);

  // Detect divine font for prepared casters
  let font: SpellFont | undefined;
  if (progression === 'fullPrepared') {
    // Build prepared spell list at the highest rank for font detection
    const allSpells = actor.items?.contents?.filter((i) =>
      i.type === 'spell' && (i.system as { location?: { value?: string } }).location?.value === primaryEntry.id
    ) ?? [];

    // Get prepared entries at each rank to map spell IDs to names
    const preparedSpells: Array<{ name: string; rank: number }> = [];
    for (let rank = 1; rank <= 10; rank++) {
      const slotKey = `slot${rank}`;
      const prepared = slots[slotKey]?.prepared || [];
      for (const entry of prepared) {
        const spell = allSpells.find((s) => s.id === entry.id);
        if (spell) {
          preparedSpells.push({ name: spell.name, rank });
        }
      }
    }

    font = detectFont(slotsByRank, level, preparedSpells);
  }

  return { progression, tradition, font, slotOverrides: diffSlotOverrides(slots, progression, level, font) };
}

/**
 * Record every rank whose actual slot count differs from what the deduced progression would compute.
 * Without this the editor rebuilds the level-derived layout on load, so a hand-tuned rank list — a
 * high-level creature holding only low ranks, or one reaching past its level — is silently reverted
 * and then zeroed on the next save. Rank 0 is included: cantrips are `slot0`.
 */
function diffSlotOverrides(
  slots: SpellSlots,
  progression: SpellProgressionType,
  level: number,
  font: SpellFont | undefined
): Record<number, number> | undefined {
  const computed = getSpellSlots(progression, level, font);
  if (!computed) return undefined;

  const overrides: Record<number, number> = {};
  for (let rank = 0; rank <= MAX_SPELL_RANK; rank++) {
    const actual = slots[`slot${rank}`]?.max ?? 0;
    if (actual !== (computed[rank] ?? 0)) overrides[rank] = actual;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Update spellcasting entries on an actor for a new level, per-entry (D6). The primary entry's DC/
 * attack come from the creature's spellDC/spellAttack benchmarks and it alone gets the slot layout;
 * every other entry scales from its OWN stored benchmark (or, unflagged, back-solves at
 * `previousLevel`) and is rewritten only on a genuine level change — so a same-level benchmark edit
 * touches the primary alone and can never flatten a distinct innate/secondary DC onto it.
 */
export async function syncSpellcastingEntriesForLevel(
  actor: NPCPF2e,
  level: number,
  benchmarks: CreatureBenchmarks,
  opts: { previousLevel?: number } = {}
): Promise<void> {
  const entries = getSpellcastingEntries(actor);
  if (entries.length === 0) return;

  const previousLevel = opts.previousLevel;
  const levelChanged = previousLevel !== undefined && previousLevel !== level;

  const stats = calculateCreatureStats(level, benchmarks);
  const slotLayout = stats.spellSlots;
  const ranges = getStatRangesForLevel(level);
  const prevRanges = previousLevel !== undefined ? getStatRangesForLevel(previousLevel) : ranges;

  const primaryId = getPrimarySpellcastingEntry(entries)?.id;

  // A binding whose spell item was deleted would otherwise be resized forward forever.
  const liveSpellIds = new Set(
    actor.items?.contents?.filter((i) => i.type === 'spell').map((i) => i.id) ?? []
  );

  const updates: EmbeddedDocumentUpdateData[] = [];

  for (const entry of entries) {
    const update: EmbeddedDocumentUpdateData = { _id: entry.id };
    const isInnate = entry.system?.prepared?.value === 'innate';

    if (entry.id === primaryId) {
      if (stats.spellDC !== undefined) update['system.spelldc.dc'] = stats.spellDC;
      if (stats.spellAttack !== undefined) update['system.spelldc.value'] = stats.spellAttack;

      // Slot layout is the primary entry's alone. Only prepared entries bind spells to slots; a
      // spontaneous repertoire and innate spells hang off the spell items' own `location.value`,
      // so leaving them alone already preserves them.
      if (slotLayout && !isInnate) {
        const isPrepared = entry.system?.prepared?.value === 'prepared';
        const slots = (entry.system?.slots ?? {}) as SpellSlots;

        for (let rank = 0; rank <= MAX_SPELL_RANK; rank++) {
          const slotKey = `slot${rank}`;
          const slotCount = slotLayout[rank] ?? 0;

          if (isPrepared) {
            const assigned = (slots[slotKey]?.prepared ?? [])
              .map((slot) => ({ id: slot.id ?? null, expended: slot.expended ?? false }))
              .filter((slot) => slot.id === null || liveSpellIds.has(slot.id));
            const prepared = resizePreparedSlots(assigned, slotCount);
            update[`system.slots.${slotKey}.prepared`] = prepared;
            // Length, not slotCount: resize widens past the computed count rather than drop a spell.
            update[`system.slots.${slotKey}.max`] = prepared.length;
            update[`system.slots.${slotKey}.value`] = prepared.length;
          } else {
            update[`system.slots.${slotKey}.max`] = slotCount;
            update[`system.slots.${slotKey}.value`] = slotCount;
          }
        }
      }
    } else {
      // Non-primary entries scale only across a real level change; a same-level benchmark edit must
      // leave their distinct DC/attack (and slots) untouched.
      if (!levelChanged) continue;

      const entryBenchmark = entry.getFlag(CREATURE_FLAG, SPELL_BENCHMARK_KEY) as SpellEntryBenchmarkData | undefined;
      const dcScalar = entryBenchmark?.dcBenchmark;
      const attackScalar = entryBenchmark?.attackBenchmark;

      if (dcScalar !== undefined || attackScalar !== undefined) {
        // Flagged: scale each entry from its own stored scalar benchmark.
        if (dcScalar !== undefined) update['system.spelldc.dc'] = Math.round(interpolateSpellStat(dcScalar, ranges.spellDC));
        if (attackScalar !== undefined) update['system.spelldc.value'] = Math.round(interpolateSpellStat(attackScalar, ranges.spellAttack));
      } else {
        // Unflagged (foreign entry): back-solve the current value at previousLevel, forward at level.
        const curDC = entry.system?.spelldc?.dc;
        const curAttack = entry.system?.spelldc?.value;
        if (curDC !== undefined) update['system.spelldc.dc'] = Math.round(interpolateSpellStat(spellStatToScalar(curDC, prevRanges.spellDC), ranges.spellDC));
        if (curAttack !== undefined) update['system.spelldc.value'] = Math.round(interpolateSpellStat(spellStatToScalar(curAttack, prevRanges.spellAttack), ranges.spellAttack));
      }
    }

    if (Object.keys(update).length > 1) updates.push(update);
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
    logger.info(`[CreatureService] Updated ${updates.length} spellcasting entries for level ${level}`);
  }
}
