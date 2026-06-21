import type { CustomAbilityDefinition } from './contracts';
import type { SpecialAbility } from './models';
import { parseAbilityDescription } from './abilityScaling';

/**
 * Map a provider's CustomAbilityDefinition onto the editor's SpecialAbility, parsing scalable
 * @Damage/@Check macros so tier-stepping works just like a dropped-in ability. Pure: the caller
 * supplies `id` (Foundry's randomID is host-side) so this stays deterministic and vendorable.
 */
export function customAbilityToSpecialAbility(
  def: CustomAbilityDefinition,
  level: number,
  id: string
): SpecialAbility {
  const ability: SpecialAbility = {
    id,
    name: def.name,
    description: def.description,
    actionType: def.actionType,
    actions: def.actionType === 'action' ? def.actions : undefined,
    traits: def.traits ? [...def.traits] : []
  };

  const parsed = parseAbilityDescription(def.description, level);
  if (parsed.scalableValues.length > 0) {
    ability.descriptionTemplate = parsed.template;
    ability.scalableValues = parsed.scalableValues;
  }

  return ability;
}

/**
 * Append the incoming abilities the creature doesn't already have (matched by name, case-insensitive).
 * Used by Convert to Troop so a provider's seeded standard abilities don't clobber the user's own.
 */
export function mergeSpecialAbilitiesByName(existing: SpecialAbility[], incoming: SpecialAbility[]): SpecialAbility[] {
  const have = new Set(existing.map((a) => a.name.toLowerCase()));
  return [...existing, ...incoming.filter((a) => !have.has(a.name.toLowerCase()))];
}
