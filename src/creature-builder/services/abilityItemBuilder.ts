/**
 * Ability item builder
 *
 * Builds PF2e `action`-type itemData objects from editor-side `SpecialAbility`
 * entries. Mirrors `strikeItemBuilder` for melee strikes. Used by both creature
 * creation (`_createCreatureActorInternal`) and the create-missing branch of
 * `updateAbilityItems`.
 *
 * If the ability's description contains scalable patterns (PF2e @Damage /
 * @Check enricher macros, or plain dice/DC patterns), the parsed
 * `descriptionTemplate` + `scalableValues` are stamped onto the item's
 * benchmark flag at create time. That makes the values available for tier
 * stepping in the editor UI and ensures `syncAbilityItemsForLevel` rescales
 * them when the creature's level changes.
 */

import type { SpecialAbility } from '../models';
import { parseAbilityDescription } from './abilityScaling';
import { CREATURE_FLAG, ABILITY_BENCHMARK_KEY } from './constants';
import type { AbilityBenchmarkData } from './types';

const ACTION_ICONS: Record<SpecialAbility['actionType'], (actions?: 1 | 2 | 3) => string> = {
  action: (actions) =>
    actions === 3 ? 'systems/pf2e/icons/actions/ThreeActions.webp'
    : actions === 2 ? 'systems/pf2e/icons/actions/TwoActions.webp'
    : 'systems/pf2e/icons/actions/OneAction.webp',
  reaction: () => 'systems/pf2e/icons/actions/Reaction.webp',
  free: () => 'systems/pf2e/icons/actions/FreeAction.webp',
  passive: () => 'systems/pf2e/icons/actions/Passive.webp'
};

export function composeAbilityItemData(ability: SpecialAbility, level: number): any {
  const itemData: any = {
    name: ability.name,
    type: 'action',
    img: ACTION_ICONS[ability.actionType](ability.actions),
    system: {
      description: { value: ability.description },
      actionType: { value: ability.actionType },
      actions: { value: ability.actionType === 'action' ? (ability.actions ?? 1) : null },
      traits: { value: ability.traits || [] }
    }
  };

  // Parse the description and stamp scalable values onto the benchmark flag so
  // the editor can tier-step damage/DC and so syncAbilityItemsForLevel rescales
  // them on level change. Skip if there's nothing to scale.
  const parsed = parseAbilityDescription(ability.description, level);
  if (parsed.scalableValues.length > 0) {
    const benchmarkData: AbilityBenchmarkData = {
      descriptionTemplate: parsed.template,
      scalableValues: parsed.scalableValues,
      originalDescription: ability.description
    };
    itemData.flags = {
      [CREATURE_FLAG]: {
        [ABILITY_BENCHMARK_KEY]: benchmarkData
      }
    };
  }

  return itemData;
}
