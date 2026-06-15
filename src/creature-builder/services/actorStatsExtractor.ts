/**
 * Actor stats extractor
 *
 * Extracts the 12 base creature stats from a Foundry PF2e actor. Used by both
 * `importCreatureFromActor` and `importCreatureFromCompendium`, which previously
 * inlined the same literal-object body. Spell DC, spell attack, strike data and
 * skills are NOT extracted here — they require additional context the caller
 * already has, so the caller spreads the result and adds those fields.
 */

import type { CreatureStats } from '../models';

/**
 * Extract the 12 base creature stats from a Foundry actor.
 *
 * The perception path tolerates both `actor.system.perception.value` (newer
 * PF2e data shape) and `actor.system.attributes.perception.value` (older).
 * This is strictly more accepting than the previous `importCreatureFromActor`
 * site, which only consulted the `attributes` path.
 *
 * Spell DC and spell attack are NOT extracted here because they require
 * walking spellcasting entries — caller passes them in.
 */
export function extractStatsFromActor(actor: any): Pick<CreatureStats,
  'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'ac' | 'hp' | 'perception' | 'fortitude' | 'reflex' | 'will'
> {
  return {
    str: actor.system?.abilities?.str?.mod ?? 0,
    dex: actor.system?.abilities?.dex?.mod ?? 0,
    con: actor.system?.abilities?.con?.mod ?? 0,
    int: actor.system?.abilities?.int?.mod ?? 0,
    wis: actor.system?.abilities?.wis?.mod ?? 0,
    cha: actor.system?.abilities?.cha?.mod ?? 0,
    ac: actor.system?.attributes?.ac?.value ?? 10,
    hp: actor.system?.attributes?.hp?.max ?? 10,
    perception: actor.system?.perception?.value ?? actor.system?.attributes?.perception?.value ?? 0,
    fortitude: actor.system?.saves?.fortitude?.value ?? 0,
    reflex: actor.system?.saves?.reflex?.value ?? 0,
    will: actor.system?.saves?.will?.value ?? 0,
  };
}
