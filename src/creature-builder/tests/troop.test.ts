import { describe, it, expect, beforeEach } from 'vitest';
import {
  withTroopTrait,
  troopWeaknesses,
  withTroopWeaknesses,
  troopAdjusted,
  applyTroopConversion
} from '@/creature-builder/logic/troop';
import { getTroopWeaknessValues } from '@/creature-builder/logic/creatureStatTables';
import { mergeSpecialAbilitiesByName } from '@/creature-builder/logic/customAbility';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';
import { editorStore } from '@/creature-builder/editor';
import type { DamageModifier, SpecialAbility } from '@/creature-builder/logic/models';
import type { EditableCreature } from '@/creature-builder/logic/editableCreature';
import type { CustomAbilityDefinition } from '@/creature-builder/logic/contracts';

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

  it('seeds only missing area/splash types and keeps everything authored', () => {
    // Level 6 table splash is 4; Wolf Pack authors splash 5 — the authored value must survive.
    const existing: DamageModifier[] = [
      { type: 'fire', value: 5 },
      { type: 'splash-damage', value: 5 }
    ];
    const out = withTroopWeaknesses(existing, 6);
    expect(out.find((m) => m.type === 'fire')).toEqual({ type: 'fire', value: 5 });
    expect(out.filter((m) => m.type === 'splash-damage')).toHaveLength(1);
    expect(out.find((m) => m.type === 'splash-damage')?.value).toBe(5);
    expect(out.find((m) => m.type === 'area-damage')?.value).toBe(getTroopWeaknessValues(6).area);
  });

  it('fills both types when the creature authors neither', () => {
    const out = withTroopWeaknesses([], 5);
    expect(out.find((m) => m.type === 'area-damage')?.value).toBe(getTroopWeaknessValues(5).area);
    expect(out.find((m) => m.type === 'splash-damage')?.value).toBe(getTroopWeaknessValues(5).splash);
  });

  it('is idempotent — a second seeding adds nothing', () => {
    const once = withTroopWeaknesses([], 5);
    const twice = withTroopWeaknesses(once, 5);
    expect(twice).toEqual(once);
  });
});

describe('troopAdjusted', () => {
  const base = (over: Partial<Parameters<typeof troopAdjusted>[0]> = {}) => ({
    level: 5,
    traits: ['animal'],
    weaknesses: [] as DamageModifier[],
    ...over
  });

  it('stamps trait and seeds weaknesses for a troop', () => {
    const out = troopAdjusted(base({ isTroop: true }));
    expect(out.traits).toContain('troop');
    expect(out.weaknesses.find((m) => m.type === 'area-damage')?.value).toBe(getTroopWeaknessValues(5).area);
  });

  it('keeps a troop\'s authored area/splash divergence', () => {
    const out = troopAdjusted(base({ isTroop: true, level: 6, weaknesses: [{ type: 'splash-damage', value: 5 }] }));
    expect(out.weaknesses.find((m) => m.type === 'splash-damage')?.value).toBe(5);
  });

  it('passes a non-troop through untouched', () => {
    const input = base({ isTroop: false, weaknesses: [{ type: 'fire', value: 5 }] });
    const out = troopAdjusted(input);
    expect(out.traits).toEqual(['animal']);
    expect(out.weaknesses).toEqual([{ type: 'fire', value: 5 }]);
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

describe('applyTroopConversion', () => {
  const baseCreature = (over: Partial<EditableCreature> = {}): EditableCreature => ({
    name: 'Wolf',
    level: 3,
    creatureType: 'animal',
    size: 'medium',
    traits: ['animal'],
    benchmarks: getDefaultBenchmarks(),
    speeds: { land: 35 },
    languages: [],
    senses: [],
    strikes: [],
    specialAbilities: [],
    immunities: [],
    resistances: [],
    weaknesses: [],
    ...over
  });

  it('flags a troop, sizes it, bumps + rescales the level, and suffixes the name', () => {
    const c = baseCreature();
    applyTroopConversion(c, { levelDelta: 5, defaultTroopSize: 'large', nameSuffix: ' Pack' });
    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('large');
    expect(c.size).toBe('large');
    expect(c.level).toBe(8);
    expect(c.name).toBe('Wolf Pack');
  });

  it('defaults to gargantuan and leaves level/name when the recipe is empty', () => {
    const c = baseCreature();
    applyTroopConversion(c);
    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('gargantuan');
    expect(c.level).toBe(3);
    expect(c.name).toBe('Wolf');
  });

  it('scales raw IWR values on the level bump', () => {
    const c = baseCreature({ weaknesses: [{ type: 'fire', value: 5 }] });
    applyTroopConversion(c, { levelDelta: 5 });
    expect(c.weaknesses[0].value).toBeGreaterThan(5);
  });

  it("merges the recipe's generated abilities, deduped by name", () => {
    const def: CustomAbilityDefinition = {
      slug: 'trample', name: 'Trample', img: '', group: 'war-action',
      description: '<p>Tramples.</p>', actionType: 'action', actions: 3, traits: []
    };
    const c = baseCreature({
      specialAbilities: [{ id: 'x', name: 'Trample', description: '', actionType: 'action' }]
    });
    applyTroopConversion(c, { generateAbilities: () => [def] });
    expect(c.specialAbilities.filter((a) => a.name === 'Trample')).toHaveLength(1);
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
    editorStore.convertToTroop({ levelDelta: 5, nameSuffix: ' Troop', defaultTroopSize: 'huge' });
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
