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
import type { CreatureStrike, DamageModifier, SpecialAbility } from '@/creature-builder/logic/models';
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
    // Level 6 table splash is 5; an authored divergent value must survive re-seeding.
    const existing: DamageModifier[] = [
      { type: 'fire', value: 5 },
      { type: 'splash-damage', value: 3 }
    ];
    const out = withTroopWeaknesses(existing, 6);
    expect(out.find((m) => m.type === 'fire')).toEqual({ type: 'fire', value: 5 });
    expect(out.filter((m) => m.type === 'splash-damage')).toHaveLength(1);
    expect(out.find((m) => m.type === 'splash-damage')?.value).toBe(3);
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
    const out = troopAdjusted(base({ isTroop: true, level: 6, weaknesses: [{ type: 'splash-damage', value: 3 }] }));
    expect(out.weaknesses.find((m) => m.type === 'splash-damage')?.value).toBe(3);
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

  it('dedups the incoming list against itself', () => {
    const merged = mergeSpecialAbilitiesByName([], [ability('Form Up'), ability('form up'), ability('Trample')]);
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

  const meleeStrike = (): CreatureStrike => ({
    name: 'Jaws', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 8,
    damage: '1d6+3', damageType: 'piercing'
  });
  const rangedStrike = (): CreatureStrike => ({
    name: 'Shortbow', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 8,
    damage: '1d6', damageType: 'piercing', isRanged: true, range: 60
  });

  it('recipe overrides still win: explicit levelDelta/size/suffix beat the engine defaults', () => {
    const c = baseCreature();
    applyTroopConversion(c, { levelDelta: 5, defaultTroopSize: 'large', nameSuffix: ' Pack' });
    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('large');
    expect(c.size).toBe('large');
    expect(c.level).toBe(8);
    expect(c.name).toBe('Wolf Pack');
  });

  it('recipe-less conversion runs the default engine: +5 level, " Troop" name, sweep, cleared strikes, kit', () => {
    const c = baseCreature({
      strikes: [meleeStrike()],
      specialAbilities: [{ id: 'howl', name: 'Howl', description: '<p>Howls.</p>', actionType: 'action', actions: 1 }]
    });
    const benchmarks0 = structuredClone(c.benchmarks);
    applyTroopConversion(c);

    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('gargantuan');
    expect(c.size).toBe('gargantuan');
    expect(c.level).toBe(8);
    expect(c.name).toBe('Wolf Troop');
    expect(c.strikes).toEqual([]);
    expect(c.benchmarks).toEqual(benchmarks0); // decision 2: benchmarks (incl. HP) untouched
    expect(c.specialAbilities.find((a) => a.name === 'Howl')).toBeDefined();

    const sweep = c.specialAbilities.find((a) => a.name === 'Jaws Flurry');
    expect(sweep).toBeDefined();
    expect(sweep!.description).toContain('options:area-damage');
    expect(sweep!.description).toContain('@Template[type:emanation');
    expect(sweep!.description).toContain('@Check[reflex');
    expect(sweep!.scalableValues?.length ?? 0).toBeGreaterThan(0);

    expect(c.specialAbilities.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Troop Defenses', 'Troop Movement'])
    );
    expect(c.specialAbilities.find((a) => a.name === 'Form Up')).toBeUndefined();
  });

  it('generates a volley from the best ranged strike alongside the melee sweep', () => {
    const c = baseCreature({ strikes: [meleeStrike(), rangedStrike()] });
    applyTroopConversion(c);
    const volley = c.specialAbilities.find((a) => a.name === 'Shortbow Volley');
    expect(volley).toBeDefined();
    expect(volley!.description).toContain('@Template[type:burst');
    expect(c.specialAbilities.find((a) => a.name === 'Jaws Flurry')).toBeDefined();
    expect(c.strikes).toEqual([]);
  });

  it('keepStrikes retains the source strikes', () => {
    const c = baseCreature({ strikes: [meleeStrike()] });
    applyTroopConversion(c, {}, { keepStrikes: true });
    expect(c.strikes).toHaveLength(1);
    expect(c.strikes[0].name).toBe('Jaws');
    expect(c.specialAbilities.find((a) => a.name === 'Jaws Flurry')).toBeDefined();
  });

  it('is idempotent — converting the result again changes nothing', () => {
    const c = baseCreature({
      strikes: [meleeStrike(), rangedStrike()],
      specialAbilities: [{ id: 'howl', name: 'Howl', description: '', actionType: 'passive' }],
      weaknesses: [{ type: 'fire', value: 5 }]
    });
    applyTroopConversion(c);
    const once = structuredClone(c);
    applyTroopConversion(c);
    expect(c).toEqual(once);
  });

  it('formUp adds Form Up and pre-seeds the half-splash weakness variant', () => {
    const c = baseCreature({ level: 4 });
    applyTroopConversion(c, {}, { formUp: true });
    expect(c.level).toBe(9);
    expect(c.specialAbilities.find((a) => a.name === 'Form Up')).toBeDefined();
    const { area, splash } = getTroopWeaknessValues(9, { formUp: true });
    expect(splash).toBe(5); // half of the level-9 area value (10)
    expect(c.weaknesses.find((w) => w.type === 'area-damage')?.value).toBe(area);
    expect(c.weaknesses.find((w) => w.type === 'splash-damage')?.value).toBe(splash);
  });

  it('scales raw IWR values on the level bump', () => {
    const c = baseCreature({ weaknesses: [{ type: 'fire', value: 5 }] });
    applyTroopConversion(c, { levelDelta: 5 });
    expect(c.weaknesses[0].value).toBeGreaterThan(5);
  });

  it("merges the recipe's generateAbilities extras additively, deduped by name", () => {
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

  it('additive extras land alongside the engine kit', () => {
    const def: CustomAbilityDefinition = {
      slug: 'rally', name: 'Rally', img: '', group: 'war-action',
      description: '<p>Rallies.</p>', actionType: 'action', actions: 1, traits: []
    };
    const c = baseCreature();
    applyTroopConversion(c, { generateAbilities: () => [def] });
    const names = c.specialAbilities.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['Rally', 'Troop Defenses', 'Troop Movement']));
  });

  it('sweepName/volleyName options rename the generated attack actions', () => {
    const c = baseCreature({ strikes: [meleeStrike(), rangedStrike()] });
    applyTroopConversion(c, {}, { sweepName: 'Coordinated Assault', volleyName: 'Arrow Storm' });
    const names = c.specialAbilities.map((a) => a.name);
    expect(names).toContain('Coordinated Assault');
    expect(names).toContain('Arrow Storm');
    expect(names).not.toContain('Jaws Flurry');
    expect(names).not.toContain('Shortbow Volley');
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

  it('convertToTroop with no recipe runs the default engine (+5 level, " Troop", gargantuan)', () => {
    editorStore.startCreate();
    const lvl0 = editorStore.creature!.level;
    const name0 = editorStore.creature!.name;
    editorStore.convertToTroop();
    const c = editorStore.creature!;
    expect(c.isTroop).toBe(true);
    expect(c.troopSize).toBe('gargantuan');
    expect(c.size).toBe('gargantuan');
    expect(c.level).toBe(lvl0 + 5);
    expect(c.name).toBe(`${name0} Troop`);
  });
});

// The editor button (store.convertToTroop) and the headless convertActorToTroop service both funnel
// through the same kernel seam — applyTroopConversion(creature, recipe, opts). This pins that a
// conversion driven through the store equals one driven through the kernel directly for identical input,
// so the two entry points can never silently diverge on the options plumbing (the W3 Done-when).
describe('conversion seam parity: editor store vs. kernel', () => {
  beforeEach(() => editorStore.resetEditor());

  const seamCreature = (): EditableCreature => ({
    name: 'Boar',
    level: 4,
    creatureType: 'animal',
    size: 'medium',
    traits: ['animal'],
    benchmarks: getDefaultBenchmarks(),
    speeds: { land: 35 },
    languages: [],
    senses: [],
    strikes: [
      { name: 'Tusk', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 10, damage: '1d8+4', damageType: 'piercing' },
      { name: 'Sling', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 10, damage: '1d6', damageType: 'bludgeoning', isRanged: true, range: 50 }
    ],
    specialAbilities: [{ id: 'gore', name: 'Gore', description: '<p>Gores.</p>', actionType: 'action', actions: 1 }],
    immunities: [],
    resistances: [],
    weaknesses: [{ type: 'fire', value: 5 }]
  });

  // The store creature is a Svelte $state proxy; JSON round-tripping both sides unwraps it and drops the
  // `undefined` fields the kernel object may carry, so toEqual compares plain, apples-to-apples state.
  const plain = (c: unknown) => JSON.parse(JSON.stringify(c));

  it('produces identical creature state for the same recipe + options', () => {
    const recipe = { nameSuffix: ' Legion', defaultTroopSize: 'large' as const, levelDelta: 3 };
    const opts = { levelDelta: 5, troopSize: 'huge' as const, formUp: true, sweepName: 'Charge', volleyName: 'Volley Fire' };

    editorStore.startEdit(seamCreature());
    editorStore.convertToTroop(recipe, opts);
    const viaStore = plain(editorStore.creature);

    const viaKernel = seamCreature();
    applyTroopConversion(viaKernel, recipe, opts);

    expect(viaStore).toEqual(plain(viaKernel));
  });

  it('produces identical creature state for a recipe-less default conversion', () => {
    editorStore.startEdit(seamCreature());
    editorStore.convertToTroop();
    const viaStore = plain(editorStore.creature);

    const viaKernel = seamCreature();
    applyTroopConversion(viaKernel);

    expect(viaStore).toEqual(plain(viaKernel));
  });
});
