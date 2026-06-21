import { describe, it, expect } from 'vitest';
import { customAbilityToSpecialAbility } from '@/creature-builder/logic/customAbility';
import { parseAbilityDescription } from '@/creature-builder/logic/abilityScaling';
import type { CustomAbilityDefinition } from '@/creature-builder/logic/contracts';

const def = (over: Partial<CustomAbilityDefinition> = {}): CustomAbilityDefinition => ({
  slug: 'test-ability',
  name: 'Test Ability',
  img: 'icons/x.webp',
  group: 'general',
  description: 'A passive effect.',
  actionType: 'passive',
  ...over
});

describe('customAbilityToSpecialAbility', () => {
  it('maps the core fields and uses the supplied id', () => {
    const ability = customAbilityToSpecialAbility(def({ name: 'Telepathy', traits: ['aura', 'magical'] }), 3, 'abc');
    expect(ability.id).toBe('abc');
    expect(ability.name).toBe('Telepathy');
    expect(ability.actionType).toBe('passive');
    expect(ability.actions).toBeUndefined();
    expect(ability.traits).toEqual(['aura', 'magical']);
  });

  it('keeps the action count only for action abilities', () => {
    expect(customAbilityToSpecialAbility(def({ actionType: 'action', actions: 2 }), 1, 'x').actions).toBe(2);
    expect(customAbilityToSpecialAbility(def({ actionType: 'reaction', actions: 2 }), 1, 'y').actions).toBeUndefined();
  });

  it('parses scalable values from the description', () => {
    const description = 'The serpentfolk deals 2d6 fire damage to the target.';
    const parsed = parseAbilityDescription(description, 5);
    expect(parsed.scalableValues.length).toBeGreaterThan(0); // guard the fixture

    const ability = customAbilityToSpecialAbility(def({ description, actionType: 'action', actions: 1 }), 5, 'z');
    expect(ability.descriptionTemplate).toBe(parsed.template);
    expect(ability.scalableValues?.length).toBe(parsed.scalableValues.length);
  });

  it('leaves descriptionTemplate unset when nothing scales', () => {
    const ability = customAbilityToSpecialAbility(def({ description: 'Telepathy 100 feet' }), 3, 'p');
    expect(ability.descriptionTemplate).toBeUndefined();
    expect(ability.scalableValues).toBeUndefined();
  });

  it('copies traits rather than sharing the definition array', () => {
    const source = def({ traits: ['fire'] });
    const ability = customAbilityToSpecialAbility(source, 1, 'q');
    ability.traits!.push('cold');
    expect(source.traits).toEqual(['fire']);
  });
});
