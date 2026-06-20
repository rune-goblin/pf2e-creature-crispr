/**
 * Creature Service - Spellcasting helpers
 *
 * Extract and sync helpers for PF2e spellcasting entries on creature actors.
 */

import type { NPCPF2e, SpellcastingEntryPF2e } from 'foundry-pf2e';
import type { CreatureBenchmarks, SpellProgressionType, SpellTradition, SpellFont } from '../logic/models';
import { deduceSpellProgression, detectFont } from '../logic/spellSlotTables';
import { calculateCreatureStats } from '../logic/creatureStatTables';
import { logger } from './logger';

/** Per-rank spell-slot record; computed `slot${rank}` keys aren't on the prepared entry type. */
type SpellSlots = Record<string, { max?: number; prepared?: Array<{ id?: string }> }>;

/**
 * Extract the highest spell DC and spell attack from an actor's spellcasting entries.
 * NPCs can have multiple spellcasting entries (e.g., arcane prepared, divine innate).
 * We use the highest values found for benchmarking.
 */
export function extractSpellcastingStats(actor: NPCPF2e): { spellDC?: number; spellAttack?: number } {
  const spellcastingEntries = actor.items?.contents?.filter((i): i is SpellcastingEntryPF2e<NPCPF2e> => i.type === 'spellcastingEntry') ?? [];

  if (spellcastingEntries.length === 0) {
    return {};
  }

  let highestDC: number | undefined;
  let highestAttack: number | undefined;

  for (const entry of spellcastingEntries) {
    // PF2e stores spell DC and attack in system.spelldc
    const dc = entry.system?.spelldc?.dc;
    const attack = entry.system?.spelldc?.value;

    if (dc !== undefined && (highestDC === undefined || dc > highestDC)) {
      highestDC = dc;
    }
    if (attack !== undefined && (highestAttack === undefined || attack > highestAttack)) {
      highestAttack = attack;
    }
  }

  return {
    spellDC: highestDC,
    spellAttack: highestAttack
  };
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

  return { progression, tradition, font };
}

/**
 * Update spellcasting entries on an actor for a new level using stored benchmarks.
 * Scales spell DC, spell attack, and spell slots based on the creature's benchmarks.
 */
export async function syncSpellcastingEntriesForLevel(actor: NPCPF2e, level: number, benchmarks: CreatureBenchmarks): Promise<void> {
  const spellcastingEntries = actor.items?.contents?.filter((i): i is SpellcastingEntryPF2e<NPCPF2e> => i.type === 'spellcastingEntry') ?? [];

  if (spellcastingEntries.length === 0) {
    return;
  }

  // Calculate new spell stats for this level
  const stats = calculateCreatureStats(level, benchmarks);

  // If no spell benchmarks, nothing to scale
  if (stats.spellDC === undefined && stats.spellAttack === undefined && stats.spellSlots === undefined) {
    return;
  }

  // Compute spell slot layout if we have a progression
  const slotLayout = stats.spellSlots;

  const updates: EmbeddedDocumentUpdateData[] = [];

  for (const entry of spellcastingEntries) {
    const update: EmbeddedDocumentUpdateData = { _id: entry.id };
    const isInnate = entry.system?.prepared?.value === 'innate';

    // Update spell DC if we have a benchmark
    if (stats.spellDC !== undefined) {
      update['system.spelldc.dc'] = stats.spellDC;
    }

    // Update spell attack if we have a benchmark
    if (stats.spellAttack !== undefined) {
      update['system.spelldc.value'] = stats.spellAttack;
    }

    // Update spell slots for non-innate entries
    if (slotLayout && !isInnate) {
      for (let rank = 0; rank <= 10; rank++) {
        const slotKey = `slot${rank}`;
        const slotCount = slotLayout[rank] ?? 0;
        update[`system.slots.${slotKey}.max`] = slotCount;
        update[`system.slots.${slotKey}.value`] = slotCount;
      }
    }

    updates.push(update);
  }

  if (updates.length > 0) {
    await actor.updateEmbeddedDocuments('Item', updates);
    logger.info(`[CreatureService] Updated ${updates.length} spellcasting entries for level ${level}`);
  }
}
