/**
 * Spell Slot Progression Tables
 *
 * Pure data and calculation functions for PF2e spellcasting progressions.
 * Used to scale creature spell slots when level changes.
 *
 * Three progression patterns cover nearly all PF2e caster creatures:
 * - Full Prepared (Cleric/Druid/Wizard/Witch): 3 slots per rank, 2 at highest
 * - Full Spontaneous (Sorcerer/Oracle/Bard): 4 slots per rank, 3 at highest
 * - Bounded (Magus/Summoner): 2 slots, only top 2 ranks active
 */

import type { SpellProgressionType, SpellSlotLayout, SpellFont } from './models';

// ============================================================================
// CORE HELPERS
// ============================================================================

/**
 * Get the highest spell rank a full caster can access at a given level.
 * New rank every 2 levels: rank 1 at level 1, rank 2 at level 3, etc.
 * Caps at rank 10 at level 19.
 */
export function getHighestSpellRank(level: number): number {
  if (level < 1) return 1;
  // Rank 1 at level 1, rank 2 at level 3, rank 3 at level 5, ...
  // Formula: ceil(level / 2), capped at 10
  return Math.min(10, Math.ceil(level / 2));
}

/**
 * Get the highest spell rank a bounded caster can access at a given level.
 * Same progression as full casters (ceil(level/2)) but caps at rank 9.
 *
 * Reference (Magus):
 *   Lv1-2: R1    Lv3-4: R2    Lv5-6: R3    Lv7-8: R4    Lv9-10: R5
 *   Lv11-12: R6  Lv13-14: R7  Lv15-16: R8  Lv17+: R9
 */
function getBoundedHighestRank(level: number): number {
  if (level < 1) return 0;
  return Math.min(9, Math.ceil(level / 2));
}

// ============================================================================
// PROGRESSION FUNCTIONS
// ============================================================================

/**
 * Full Prepared progression (Cleric, Druid, Wizard, Witch pattern).
 *
 * Reference table (from PF2e class data):
 *   Lv-1: R0=3 (3 cantrips, no slots)  [creature-building extrapolation]
 *   Lv0:  R0=3, R1=1                   [creature-building extrapolation]
 *   Lv1:  R1=2                         Lv2:  R1=3
 *   Lv3:  R1=3, R2=2                   Lv4:  R1=3, R2=3
 *   Lv5:  R1-2=3, R3=2                 Lv6:  R1-3=3
 *   Lv7:  R1-3=3, R4=2                 Lv8:  R1-4=3
 *   ...pattern continues...
 *   Lv17: R1-8=3, R9=2                 Lv18: R1-9=3
 *   Lv19: R1-9=3, R10=1               Lv20: R1-9=3, R10=1
 *
 * Rules:
 * - Level -1 and 0: 3 cantrips (these levels aren't part of the official PC system)
 * - Level 1+: 5 cantrips
 * - Odd levels: new highest rank unlocks with 2 slots
 * - Even levels: highest rank fills to 3 slots
 * - All lower ranks: 3 slots
 * - Rank 10: 1 slot at level 19+ (special capstone)
 */
export function getFullPreparedSlots(level: number): SpellSlotLayout {
  // Sub-level-1 creatures (not part of official PC progression)
  if (level <= -1) return { 0: 3 };
  if (level === 0) return { 0: 3, 1: 1 };

  const slots: SpellSlotLayout = { 0: 5 };
  const highestRank = getHighestSpellRank(level);

  for (let rank = 1; rank <= Math.min(highestRank, 9); rank++) {
    if (rank === highestRank) {
      // Odd levels: just gained this rank (2 slots)
      // Even levels: rank has been filled (3 slots)
      slots[rank] = (level % 2 === 0) ? 3 : 2;
    } else {
      slots[rank] = 3;
    }
  }

  // Rank 10 at level 19+
  if (level >= 19) {
    slots[10] = 1;
    // When rank 10 unlocks, rank 9 becomes "filled" (3 slots)
    if (slots[9] !== undefined) {
      slots[9] = 3;
    }
  }

  return slots;
}

/**
 * Full Spontaneous progression (Sorcerer, Oracle, Bard pattern).
 *
 * Reference table (from PF2e class data - Sorcerer/Oracle):
 *   Lv-1: R0=3 (3 cantrips, no slots)  [creature-building extrapolation]
 *   Lv0:  R0=3, R1=2                   [creature-building extrapolation]
 *   Lv1:  R1=3                         Lv2:  R1=4
 *   Lv3:  R1=4, R2=3                   Lv4:  R1=4, R2=4
 *   Lv5:  R1-2=4, R3=3                 Lv6:  R1-3=4
 *   ...pattern continues...
 *   Lv19: R1-9=4, R10=1               Lv20: R1-9=4, R10=1
 *
 * Rules:
 * - Level -1 and 0: 3 cantrips (these levels aren't part of the official PC system)
 * - Level 1+: 5 cantrips
 * - Odd levels: new highest rank unlocks with 3 slots
 * - Even levels: highest rank fills to 4 slots
 * - All lower ranks: 4 slots
 * - Rank 10: 1 slot at level 19+ (special capstone)
 */
export function getFullSpontaneousSlots(level: number): SpellSlotLayout {
  // Sub-level-1 creatures (not part of official PC progression)
  // Spontaneous gets slightly more slots than prepared at these low levels
  if (level <= -1) return { 0: 3 };
  if (level === 0) return { 0: 3, 1: 2 };

  const slots: SpellSlotLayout = { 0: 5 };
  const highestRank = getHighestSpellRank(level);

  for (let rank = 1; rank <= Math.min(highestRank, 9); rank++) {
    if (rank === highestRank) {
      // Odd levels: just gained this rank (3 slots)
      // Even levels: rank has been filled (4 slots)
      slots[rank] = (level % 2 === 0) ? 4 : 3;
    } else {
      slots[rank] = 4;
    }
  }

  // Rank 10 at level 19+
  if (level >= 19) {
    slots[10] = 1;
    // When rank 10 unlocks, rank 9 becomes "filled" (4 slots)
    if (slots[9] !== undefined) {
      slots[9] = 4;
    }
  }

  return slots;
}

/**
 * Bounded spellcasting progression (Magus, Summoner pattern).
 *
 * Reference table (from PF2e Magus):
 *   Lv-1: R0=3 (3 cantrips, no slots)  [creature-building extrapolation]
 *   Lv0:  R0=3, R1=1                   [creature-building extrapolation]
 *   Lv1:  R1=1                    Lv2:  R1=2
 *   Lv3:  R1=2, R2=1              Lv4:  R1=2, R2=2
 *   Lv5:  R2=2, R3=2              Lv6:  R2=2, R3=2
 *   Lv7:  R3=2, R4=2              Lv8:  R3=2, R4=2
 *   ...pattern continues (top 2 ranks with 2 slots each)...
 *   Lv17+: R8=2, R9=2
 *
 * Rules:
 * - Level -1 and 0: 3 cantrips (these levels aren't part of the official PC system)
 * - Level 1+: 5 cantrips
 * - Levels 1-4: building up (odd = new rank at 1 slot, even = fills to 2)
 * - Levels 5+: exactly 2 active ranks with 2 slots each, lower ranks drop off
 * - Caps at rank 9
 */
export function getBoundedSlots(level: number): SpellSlotLayout {
  // Sub-level-1 creatures (not part of official PC progression)
  if (level <= -1) return { 0: 3 };
  if (level === 0) return { 0: 3, 1: 1 };

  const slots: SpellSlotLayout = { 0: 5 };
  const highestRank = getBoundedHighestRank(level);

  if (highestRank <= 0) return slots;

  if (level <= 4) {
    // Early levels: accumulating ranks, odd = 1 slot at new rank, even = fills to 2
    if (highestRank === 1) {
      slots[1] = (level % 2 === 0) ? 2 : 1;
    } else {
      slots[1] = 2;
      slots[2] = (level % 2 === 0) ? 2 : 1;
    }
  } else {
    // Level 5+: exactly 2 active ranks with 2 slots each
    slots[highestRank] = 2;
    slots[highestRank - 1] = 2;
  }

  return slots;
}

// ============================================================================
// DIVINE FONT
// ============================================================================

/**
 * Get the number of divine font slots for a given level.
 * - Levels 1-4: 4 slots
 * - Levels 5-14: 5 slots
 * - Levels 15+: 6 slots
 */
export function getFontSlotCount(level: number): number {
  if (level >= 15) return 6;
  if (level >= 5) return 5;
  return 4;
}

/**
 * Apply divine font slots to a spell slot layout.
 * Font slots are added to the highest non-cantrip rank.
 */
export function applyFontSlots(slots: SpellSlotLayout, level: number): SpellSlotLayout {
  const result = { ...slots };
  const fontCount = getFontSlotCount(level);

  // Find the highest non-cantrip rank
  const ranks = Object.keys(result).map(Number).filter(r => r > 0 && result[r] > 0);
  if (ranks.length === 0) return result;

  const highestRank = Math.max(...ranks);
  result[highestRank] = (result[highestRank] ?? 0) + fontCount;

  return result;
}

// ============================================================================
// DISPATCH
// ============================================================================

/**
 * Get spell slot layout for a given progression type and level.
 * Optionally includes divine font slots at the highest rank.
 * Returns a record of rank -> slot count.
 */
export function getSpellSlots(
  progression: SpellProgressionType,
  level: number,
  font?: SpellFont
): SpellSlotLayout | undefined {
  let slots: SpellSlotLayout | undefined;

  switch (progression) {
    case 'fullPrepared':
      slots = getFullPreparedSlots(level);
      break;
    case 'fullSpontaneous':
      slots = getFullSpontaneousSlots(level);
      break;
    case 'bounded':
      slots = getBoundedSlots(level);
      break;
    case 'innate':
    case 'none':
      return undefined;
  }

  if (slots && font) {
    slots = applyFontSlots(slots, level);
  }

  return slots;
}

// ============================================================================
// IMPORT DEDUCTION
// ============================================================================

/**
 * Deduce the spell progression type from a creature's spellcasting data.
 *
 * Analyzes the spellcasting type (prepared/spontaneous) and slot counts
 * to match the closest standard progression pattern. When detecting prepared
 * casters, strips out font slots (excess at highest rank) before matching.
 *
 * @param castingType - 'prepared' or 'spontaneous'
 * @param slotsByRank - Record of rank (1-10) to slot count from the actor
 * @param level - creature level, used to calculate expected font slot excess
 */
export function deduceSpellProgression(
  castingType: string,
  slotsByRank: Record<number, number>,
  level?: number
): SpellProgressionType {
  const ranks = Object.keys(slotsByRank)
    .map(Number)
    .filter(r => r > 0 && slotsByRank[r] > 0)
    .sort((a, b) => a - b);

  if (ranks.length === 0) return 'none';

  // For prepared casters, the highest rank may be inflated by font slots.
  // Strip font excess before checking for bounded pattern.
  const highestRank = ranks[ranks.length - 1];
  const highestCount = slotsByRank[highestRank];

  // Expected highest-rank slots for full prepared = 2
  // If we see more, it's likely font. Check lower ranks for bounded pattern.
  const lowerRanks = ranks.filter(r => r < highestRank);
  const lowerMaxSlots = lowerRanks.length > 0
    ? Math.max(...lowerRanks.map(r => slotsByRank[r]))
    : 0;

  // Check for bounded pattern: only 1-2 active ranks with max 2 slots each
  // (font doesn't apply to bounded casters)
  if (ranks.length <= 2 && highestCount <= 2 && lowerMaxSlots <= 2) {
    return 'bounded';
  }

  // Full caster: check type
  if (castingType === 'spontaneous') {
    return 'fullSpontaneous';
  }

  return 'fullPrepared';
}

/**
 * Detect divine font from a prepared spellcasting entry.
 *
 * Compares the actual slot count at the highest rank against the expected
 * count for a full prepared caster. If there's an excess, checks the
 * prepared spell list for repeated Heal or Harm entries.
 *
 * @param slotsByRank - Record of rank (1-10) to slot count from the actor
 * @param level - creature level
 * @param preparedSpells - array of { name, rank } for spells at the highest rank
 * @returns detected font type, or undefined if no font
 */
export function detectFont(
  slotsByRank: Record<number, number>,
  level: number,
  preparedSpells: Array<{ name: string; rank: number }>
): SpellFont | undefined {
  const ranks = Object.keys(slotsByRank)
    .map(Number)
    .filter(r => r > 0 && slotsByRank[r] > 0)
    .sort((a, b) => a - b);

  if (ranks.length === 0) return undefined;

  const highestRank = ranks[ranks.length - 1];
  const actualCount = slotsByRank[highestRank];
  const expectedCount = highestRank === getHighestSpellRank(level) ? 2 : 3;
  const excess = actualCount - expectedCount;

  if (excess < 3) return undefined; // Font gives at least 4 slots; need meaningful excess

  // Check if excess is explained by repeated Heal or Harm at the highest rank
  const highestRankSpells = preparedSpells.filter(s => s.rank === highestRank);
  const harmCount = highestRankSpells.filter(s => s.name.toLowerCase() === 'harm').length;
  const healCount = highestRankSpells.filter(s => s.name.toLowerCase() === 'heal').length;

  if (harmCount >= excess) return 'harm';
  if (healCount >= excess) return 'heal';

  // Even without exact spell matching, large excess at highest rank suggests font
  if (excess >= 4) {
    return harmCount > healCount ? 'harm' : healCount > 0 ? 'heal' : undefined;
  }

  return undefined;
}
