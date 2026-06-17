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
import { parseAbilityDescription, renderAbilityDescription } from './abilityScaling';
import { CREATURE_FLAG, ABILITY_BENCHMARK_KEY } from './constants';
import type { AbilityBenchmarkData } from './types';

/** PF2e action item-create payload; Foundry fills the remaining defaults at create time. */
export interface AbilityItemData {
  name: string;
  type: 'action';
  img: string;
  system: {
    description: { value: string };
    actionType: { value: SpecialAbility['actionType'] };
    actions: { value: number | null };
    traits: { value: string[] };
  };
  flags?: Record<string, Record<string, AbilityBenchmarkData>>;
}

const ACTION_ICONS: Record<SpecialAbility['actionType'], (actions?: 1 | 2 | 3) => string> = {
  action: (actions) =>
    actions === 3 ? 'systems/pf2e/icons/actions/ThreeActions.webp'
    : actions === 2 ? 'systems/pf2e/icons/actions/TwoActions.webp'
    : 'systems/pf2e/icons/actions/OneAction.webp',
  reaction: () => 'systems/pf2e/icons/actions/Reaction.webp',
  free: () => 'systems/pf2e/icons/actions/FreeAction.webp',
  passive: () => 'systems/pf2e/icons/actions/Passive.webp'
};

export function composeAbilityItemData(ability: SpecialAbility, level: number): AbilityItemData {
  const itemData: AbilityItemData = {
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

/**
 * Serialize an in-editor SpecialAbility to a PF2e action item for export (drag onto an actor
 * sheet). Unlike {@link composeAbilityItemData}, this renders the description from the ability's
 * *current* template + scalable values — honouring the user's tier/override edits — and re-stamps
 * the benchmark flag so dragging the item back into CRISPR restores those values exactly.
 */
export function composeAbilityItemForExport(ability: SpecialAbility, level: number): AbilityItemData {
  const template = ability.customDescriptionTemplate ?? ability.descriptionTemplate;
  const hasScalables = !!(template && ability.scalableValues && ability.scalableValues.length > 0);

  const description = hasScalables
    ? renderAbilityDescription(template!, ability.scalableValues!, level)
    : (ability.customDescriptionTemplate ?? ability.description);

  const itemData: AbilityItemData = {
    name: ability.name,
    type: 'action',
    img: ACTION_ICONS[ability.actionType](ability.actions),
    system: {
      description: { value: description },
      actionType: { value: ability.actionType },
      actions: { value: ability.actionType === 'action' ? (ability.actions ?? 1) : null },
      traits: { value: ability.traits || [] }
    }
  };

  if (hasScalables) {
    const benchmarkData: AbilityBenchmarkData = {
      descriptionTemplate: ability.descriptionTemplate ?? template!,
      scalableValues: ability.scalableValues!,
      originalDescription: ability.description
    };
    if (ability.customDescriptionTemplate) benchmarkData.customDescriptionTemplate = ability.customDescriptionTemplate;
    itemData.flags = { [CREATURE_FLAG]: { [ABILITY_BENCHMARK_KEY]: benchmarkData } };
  }

  return itemData;
}
