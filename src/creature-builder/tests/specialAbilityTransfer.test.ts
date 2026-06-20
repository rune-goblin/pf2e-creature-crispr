import { describe, it, expect } from 'vitest';
import { parseAbilityDescription } from '@/creature-builder/logic/abilityScaling';
import { composeAbilityItemForExport, type AbilityItemData } from '@/creature-builder/services/abilityItemBuilder';
import { actionItemToSpecialAbility } from '@/creature-builder/services/actorQueries';
import type { SpecialAbility } from '@/creature-builder/logic/models';

// Stand-in for the PF2e item that `specialAbilityFromDrop` builds from a dropped payload, so the
// round-trip can be exercised without Foundry globals.
function asDroppedItem(data: AbilityItemData) {
  const item = {
    id: 'dropped',
    name: data.name,
    type: data.type,
    system: data.system,
    getFlag: (scope: string, key: string) =>
      (data.flags as Record<string, Record<string, unknown>> | undefined)?.[scope]?.[key]
  };
  return item as unknown as Parameters<typeof actionItemToSpecialAbility>[0];
}

describe('special ability drag transfer', () => {
  it('round-trips a passive with no scalable values', () => {
    const passive: SpecialAbility = {
      id: 'p1',
      name: 'Telepathy',
      description: 'Telepathy 100 feet',
      actionType: 'passive',
      traits: ['aura', 'magical', 'mental']
    };

    const data = composeAbilityItemForExport(passive, 3);
    expect(data.type).toBe('action');
    expect(data.system.actionType.value).toBe('passive');
    expect(data.system.actions.value).toBeNull();
    expect(data.system.description.value).toBe('Telepathy 100 feet');
    expect(data.flags).toBeUndefined();

    const back = actionItemToSpecialAbility(asDroppedItem(data), 3);
    expect(back.name).toBe('Telepathy');
    expect(back.actionType).toBe('passive');
    expect(back.actions).toBeUndefined();
    expect(back.traits).toEqual(['aura', 'magical', 'mental']);
  });

  it('round-trips an action with a scalable value via the benchmark flag', () => {
    const description = 'The serpentfolk deals 2d6 fire damage to the target.';
    const parsed = parseAbilityDescription(description, 5);
    expect(parsed.scalableValues.length).toBeGreaterThan(0);

    const ability: SpecialAbility = {
      id: 'a1',
      name: 'Fire Lash',
      description,
      actionType: 'action',
      actions: 2,
      traits: ['fire'],
      descriptionTemplate: parsed.template,
      scalableValues: parsed.scalableValues
    };

    const data = composeAbilityItemForExport(ability, 5);
    expect(data.system.actions.value).toBe(2);
    expect(data.system.traits.value).toEqual(['fire']);
    // The benchmark flag is stamped so the dropped item round-trips back into CRISPR.
    expect(data.flags).toBeDefined();

    const back = actionItemToSpecialAbility(asDroppedItem(data), 5);
    expect(back.name).toBe('Fire Lash');
    expect(back.actionType).toBe('action');
    expect(back.actions).toBe(2);
    expect(back.scalableValues?.length).toBe(parsed.scalableValues.length);
    expect(back.descriptionTemplate).toBe(parsed.template);
  });

  it('honours the user template override when exporting', () => {
    const description = 'Deals 1d8 cold damage.';
    const parsed = parseAbilityDescription(description, 4);

    const ability: SpecialAbility = {
      id: 'a2',
      name: 'Frost Touch',
      description,
      actionType: 'action',
      actions: 1,
      traits: [],
      descriptionTemplate: parsed.template,
      customDescriptionTemplate: 'Custom text with {0} inside.',
      scalableValues: parsed.scalableValues
    };

    const data = composeAbilityItemForExport(ability, 4);
    expect(data.system.description.value).toContain('Custom text with');
    // Reset path is preserved: the parsed template, not the override, is stored on the flag.
    const back = actionItemToSpecialAbility(asDroppedItem(data), 4);
    expect(back.customDescriptionTemplate).toBe('Custom text with {0} inside.');
    expect(back.descriptionTemplate).toBe(parsed.template);
  });
});
