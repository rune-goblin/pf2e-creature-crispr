import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAbilityProvider,
  getAbilityProviders,
  clearAbilityProviders
} from '@/creature-builder/services/abilityProviderRegistry';
import type { AbilityProvider } from '@/creature-builder/logic/contracts';

const provider = (id: string): AbilityProvider => ({
  id,
  label: id,
  abilities: [{ slug: `${id}-a`, name: `${id} A`, img: '', group: 'g', description: 'x', actionType: 'passive' }]
});

describe('abilityProviderRegistry', () => {
  beforeEach(() => clearAbilityProviders());

  it('registers and returns providers', () => {
    registerAbilityProvider(provider('alpha'));
    registerAbilityProvider(provider('beta'));
    expect(getAbilityProviders().map((p) => p.id).sort()).toEqual(['alpha', 'beta']);
  });

  it('filters by id; an empty id list yields nothing, undefined yields all', () => {
    registerAbilityProvider(provider('alpha'));
    registerAbilityProvider(provider('beta'));
    expect(getAbilityProviders(['beta']).map((p) => p.id)).toEqual(['beta']);
    expect(getAbilityProviders([]).length).toBe(0);
    expect(getAbilityProviders().length).toBe(2);
  });

  it('overwrites a provider re-registered under the same id', () => {
    registerAbilityProvider(provider('alpha'));
    registerAbilityProvider({ ...provider('alpha'), label: 'Replaced' });
    const all = getAbilityProviders();
    expect(all.length).toBe(1);
    expect(all[0].label).toBe('Replaced');
  });

  it('clears all providers', () => {
    registerAbilityProvider(provider('alpha'));
    clearAbilityProviders();
    expect(getAbilityProviders()).toEqual([]);
  });
});
