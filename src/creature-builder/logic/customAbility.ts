import type { CustomAbilityDefinition } from './contracts';
import type { SpecialAbility } from './models';
import { parseAbilityDescription } from './abilityScaling';
import { buildTroopAttackFromTemplate, troopAttackKindOf } from './troopActions';
import { TROOP_DAMAGE_TIER } from './troopBenchmarks';

/**
 * Map a provider's CustomAbilityDefinition onto the editor's SpecialAbility, parsing scalable
 * @Damage/@Check macros so tier-stepping works just like a dropped-in ability. Pure: the caller
 * supplies `id` (Foundry's randomID is host-side) so this stays deterministic and vendorable.
 *
 * A `template` entry (the generic Battle/Salvo) is expanded to its level-appropriate instance first:
 * the registry describes the pattern, but what lands on the creature is a real attack.
 */
export function customAbilityToSpecialAbility(
  def: CustomAbilityDefinition,
  level: number,
  id: string
): SpecialAbility {
  const built = def.template ? buildTroopAttackFromTemplate(def.template, level, { name: def.name }) : def;

  const ability: SpecialAbility = {
    id,
    name: built.name,
    description: built.description,
    actionType: built.actionType,
    actions: built.actionType === 'action' ? built.actions : undefined,
    traits: def.traits ? [...def.traits] : []
  };
  if (def.rules) ability.rules = def.rules.map((r) => ({ ...r }));

  const parsed = parseAbilityDescription(built.description, level);
  if (parsed.scalableValues.length > 0) {
    ability.descriptionTemplate = parsed.template;
    ability.scalableValues = parsed.scalableValues;
  }

  return ability;
}

/**
 * Put a troop attack's damage lines back on the benchmark — the "on the curve" action.
 *
 * Values only: each line takes the tier its own action-scaled ladder calls high, which is where
 * published troops sit. Nothing else is touched — not the save DC, not the areas, and above all not
 * the prose. The description is a template fed by these values, so it re-renders with the new
 * numbers on its own; regenerating it would throw away wording the GM chose.
 *
 * Returns undefined when the ability isn't a troop attack.
 */
export function snapTroopDamageToBenchmark(ability: SpecialAbility): SpecialAbility | undefined {
  if (!troopAttackKindOf(ability)) return undefined;

  const scalableValues = (ability.scalableValues ?? []).map((sv) => {
    if (sv.type !== 'damage' || sv.troopLine === undefined) return sv;
    // Drop the absolute value: an override tracks the ladder, so the line stays on curve if the
    // creature is rescaled later.
    const { customValue: _custom, ...rest } = sv;
    return { ...rest, override: TROOP_DAMAGE_TIER };
  });

  return { ...ability, scalableValues };
}

/**
 * Append the incoming abilities the creature doesn't already have (matched by name, case-insensitive).
 * Used by Convert to Troop so a provider's seeded standard abilities don't clobber the user's own.
 *
 * Incoming is deduped against itself, not just against `existing`: the conversion passes generated +
 * kit + recipe extras as a single array, so a recipe seeding its own copy of a kit ability would
 * otherwise land twice (double Form Up / Troop Defenses / Troop Movement).
 */
export function mergeSpecialAbilitiesByName(existing: SpecialAbility[], incoming: SpecialAbility[]): SpecialAbility[] {
  const have = new Set(existing.map((a) => a.name.toLowerCase()));
  const merged = [...existing];
  for (const ability of incoming) {
    const key = ability.name.toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    merged.push(ability);
  }
  return merged;
}
