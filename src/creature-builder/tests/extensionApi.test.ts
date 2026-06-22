import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSaveTarget,
  getSaveTarget,
  getActiveSaveTarget,
  setActiveSaveTarget,
  resetSaveTargets
} from '@/creature-builder/services/saveTargetRegistry';
import { defaultSaveTarget } from '@/creature-builder/services/defaultSaveTarget';
import {
  registerAbilityProvider,
  getActiveProviders,
  setActiveProviderFilter,
  clearAbilityProviders
} from '@/creature-builder/services/abilityProviderRegistry';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';
import type { CreatureSaveTarget, AbilityProvider } from '@/creature-builder/logic/contracts';
import type { EditableCreature } from '@/creature-builder/logic/editableCreature';

const sampleCreature = (): EditableCreature => ({
  name: 'Fixture',
  level: 1,
  creatureType: 'creature',
  size: 'medium',
  traits: [],
  benchmarks: getDefaultBenchmarks(),
  strikes: [],
  specialAbilities: [],
  immunities: [],
  resistances: [],
  weaknesses: [],
  speeds: { land: 25 },
  languages: ['common'],
  senses: []
});

function makeFixtureTarget() {
  const afterSave: Array<{ actorId: string; mode: string }> = [];
  const target: CreatureSaveTarget = {
    id: 'fixture-target',
    label: 'Fixture Target',
    createActor: async () => 'fixture-new',
    updateActor: async () => {},
    cloneActor: async () => 'fixture-clone',
    onAfterSave: async (actorId, _creature, mode) => {
      afterSave.push({ actorId, mode });
    }
  };
  return { target, afterSave };
}

const fixtureProvider: AbilityProvider = {
  id: 'fixture-provider',
  label: 'Fixture Provider',
  abilities: [
    { slug: 'zap', name: 'Zap', img: '', group: 'attacks', description: 'Deals 2d6 fire damage.', actionType: 'action', actions: 1 }
  ]
};

describe('extension API — save targets', () => {
  beforeEach(() => resetSaveTargets());

  it('defaults to the built-in target before any selection', () => {
    expect(getActiveSaveTarget()).toBe(defaultSaveTarget);
  });

  it('registers a target and selects it as active by id', () => {
    const { target } = makeFixtureTarget();
    registerSaveTarget(target);
    expect(getSaveTarget('fixture-target')).toBe(target);

    setActiveSaveTarget('fixture-target');
    expect(getActiveSaveTarget()).toBe(target);
  });

  it('falls back to the built-in default for an unknown id', () => {
    setActiveSaveTarget('nope');
    expect(getActiveSaveTarget()).toBe(defaultSaveTarget);
  });

  it('the built-in default has no post-save hook (CRISPR stays side-effect-free)', () => {
    expect(defaultSaveTarget.onAfterSave).toBeUndefined();
  });

  it('a registered target satisfies the contract as a black box (create + onAfterSave)', async () => {
    const { target, afterSave } = makeFixtureTarget();
    registerSaveTarget(target);
    setActiveSaveTarget('fixture-target');
    const active = getActiveSaveTarget();

    const creature = sampleCreature();
    const newId = await active.createActor(creature);
    expect(newId).toBe('fixture-new');

    await active.onAfterSave?.(newId, creature, 'create');
    expect(afterSave).toEqual([{ actorId: 'fixture-new', mode: 'create' }]);
  });
});

describe('extension API — ability providers', () => {
  beforeEach(() => clearAbilityProviders());

  it('surfaces a registered provider through the active filter', () => {
    registerAbilityProvider(fixtureProvider);

    setActiveProviderFilter(undefined); // all
    expect(getActiveProviders().map((p) => p.id)).toEqual(['fixture-provider']);

    setActiveProviderFilter(['fixture-provider']); // explicit subset
    expect(getActiveProviders()).toHaveLength(1);

    setActiveProviderFilter([]); // none
    expect(getActiveProviders()).toHaveLength(0);
  });
});
