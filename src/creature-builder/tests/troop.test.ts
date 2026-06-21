import { describe, it, expect, beforeEach } from 'vitest';
import { withTroopTrait, troopWeaknesses, withTroopWeaknesses } from '@/creature-builder/logic/troop';
import { getTroopWeaknessValues } from '@/creature-builder/logic/creatureStatTables';
import { mergeSpecialAbilitiesByName } from '@/creature-builder/logic/customAbility';
import { editorStore } from '@/creature-builder/editor';
import type { DamageModifier, SpecialAbility } from '@/creature-builder/logic/models';

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
