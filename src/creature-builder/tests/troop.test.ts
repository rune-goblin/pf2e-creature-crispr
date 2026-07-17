import { describe, it, expect, beforeEach } from 'vitest';
import {
  withTroopTrait,
  troopWeaknesses,
  withTroopWeaknesses,
  troopImmunities,
  withTroopImmunities,
  troopAdjusted
} from '@/creature-builder/logic/troop';
import { getTroopWeaknessValues } from '@/creature-builder/logic/creatureStatTables';
import { mergeSpecialAbilitiesByName } from '@/creature-builder/logic/customAbility';
import { editorStore } from '@/creature-builder/editor';
import type { DamageModifier, Immunity, SpecialAbility } from '@/creature-builder/logic/models';

describe('troop derivation (kernel)', () => {
  it('adds the troop trait without duplicating', () => {
    expect(withTroopTrait(['earth'])).toEqual(['earth', 'troop']);
    expect(withTroopTrait(['troop', 'earth'])).toEqual(['troop', 'earth']);
  });

  it('derives area/splash weaknesses at the creature level', () => {
    const { area, splash } = getTroopWeaknessValues(5);
    expect(troopWeaknesses(5)).toEqual([
      { type: 'area-damage', value: area },
      { type: 'splash-damage', value: splash }
    ]);
  });

  it('overlays troop weaknesses, replacing prior area/splash but keeping others', () => {
    const existing: DamageModifier[] = [
      { type: 'fire', value: 5 },
      { type: 'area-damage', value: 99 }
    ];
    const out = withTroopWeaknesses(existing, 5);
    expect(out.find((m) => m.type === 'fire')).toEqual({ type: 'fire', value: 5 });
    expect(out.filter((m) => m.type === 'area-damage')).toHaveLength(1);
    expect(out.find((m) => m.type === 'area-damage')?.value).toBe(getTroopWeaknessValues(5).area);
  });

  it('carries the effects a formation shrugs off but an individual would not', () => {
    expect(troopImmunities().map((i) => i.type)).toEqual([
      'death-effects',
      'disease',
      'paralyzed',
      'poison',
      'unconscious'
    ]);
  });

  it('overlays troop immunities, keeping the creature\'s own and not duplicating', () => {
    const existing: Immunity[] = [{ type: 'fire' }, { type: 'poison' }];
    const out = withTroopImmunities(existing);
    expect(out.find((i) => i.type === 'fire')).toEqual({ type: 'fire' });
    expect(out.filter((i) => i.type === 'poison')).toHaveLength(1);
  });
});

describe('troopAdjusted', () => {
  const base = (over: Partial<Parameters<typeof troopAdjusted>[0]> = {}) => ({
    level: 5,
    traits: ['animal'],
    weaknesses: [] as DamageModifier[],
    immunities: [] as Immunity[],
    ...over
  });

  it('stamps trait, weaknesses and immunities together for a troop', () => {
    const out = troopAdjusted(base({ isTroop: true }));
    expect(out.traits).toContain('troop');
    expect(out.weaknesses.find((m) => m.type === 'area-damage')?.value).toBe(getTroopWeaknessValues(5).area);
    expect(out.immunities.map((i) => i.type)).toContain('death-effects');
  });

  it('passes a non-troop through untouched', () => {
    const input = base({ isTroop: false, weaknesses: [{ type: 'fire', value: 5 }] });
    const out = troopAdjusted(input);
    expect(out.traits).toEqual(['animal']);
    expect(out.weaknesses).toEqual([{ type: 'fire', value: 5 }]);
    expect(out.immunities).toEqual([]);
  });

  // Save targets call this on every persist, so a second pass must not stack duplicates.
  it('is idempotent', () => {
    const once = troopAdjusted(base({ isTroop: true }));
    const twice = troopAdjusted(base({ isTroop: true, ...once }));
    expect(twice).toEqual(once);
  });
});

describe('mergeSpecialAbilitiesByName', () => {
  const ability = (name: string): SpecialAbility => ({ id: name, name, description: '', actionType: 'passive' });

  it('appends only abilities not already present (case-insensitive)', () => {
    const merged = mergeSpecialAbilitiesByName([ability('Form Up')], [ability('form up'), ability('Trample')]);
    expect(merged.map((a) => a.name)).toEqual(['Form Up', 'Trample']);
  });
});

describe('store troop methods', () => {
  beforeEach(() => editorStore.resetEditor());

  it('setTroop toggles the flag and defaults the formation size', () => {
    editorStore.startCreate();
    editorStore.setTroop(true);
    expect(editorStore.creature!.isTroop).toBe(true);
    expect(editorStore.creature!.troopSize).toBe('gargantuan');
    editorStore.setTroop(false);
    expect(editorStore.creature!.isTroop).toBe(false);
  });

  it('convertToTroop applies the structural transform + recipe tweaks', () => {
    editorStore.startCreate();
    const name0 = editorStore.creature!.name;
    const lvl0 = editorStore.creature!.level;
    editorStore.convertToTroop({ levelDelta: 5, nameSuffix: ' Troop', troopSize: 'huge' });
    const c = editorStore.creature!;
    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('huge');
    expect(c.size).toBe('huge');
    expect(c.level).toBe(lvl0 + 5);
    expect(c.name).toBe(`${name0} Troop`);
  });

  it('convertToTroop with no recipe defaults to gargantuan and leaves level/name', () => {
    editorStore.startCreate();
    const lvl0 = editorStore.creature!.level;
    const name0 = editorStore.creature!.name;
    editorStore.convertToTroop();
    const c = editorStore.creature!;
    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('gargantuan');
    expect(c.size).toBe('gargantuan');
    expect(c.level).toBe(lvl0);
    expect(c.name).toBe(name0);
  });
});
