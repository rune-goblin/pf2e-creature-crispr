import { describe, it, expect, beforeEach, vi } from 'vitest';
import { editorStore, ALL_SECTIONS } from '@/creature-builder/editor';
import type { CreatureStats, EditableCreature, EditorEnvironment, SpecialAbility } from '@/creature-builder/editor';
import { BENCHMARK_VALUES_4, createDefaultStrike, getDefaultBenchmarks } from '@/creature-builder/logic/models';

const makeEditable = (overrides: Partial<EditableCreature> = {}): EditableCreature => ({
  name: 'Goblin Warrior',
  level: 3,
  creatureType: 'humanoid',
  size: 'small',
  traits: ['goblin'],
  benchmarks: getDefaultBenchmarks(),
  speeds: { land: 25 },
  languages: ['common'],
  senses: [],
  strikes: [createDefaultStrike('Dogslicer')],
  specialAbilities: [],
  immunities: [],
  resistances: [],
  weaknesses: [],
  ...overrides
});

const makeBaseStats = (hp: number): CreatureStats => ({
  str: 2, dex: 3, con: 1, int: 0, wis: 1, cha: 0,
  ac: 18, hp,
  fortitude: 9, reflex: 11, will: 7,
  perception: 8,
  strikeAttackBonus: 10,
  strikeDamage: '1d8+4',
  strikeDamageAverage: 8.5,
  skills: {}
});

const makeAbility = (overrides: Partial<SpecialAbility> = {}): SpecialAbility => ({
  id: 'ab1',
  name: 'Rend',
  description: 'Rends the target.',
  actionType: 'action',
  actions: 1,
  ...overrides
});

// Exercises the runes store's reactivity contract headlessly: mutating $state must make
// the $derived `computedStats` recompute, and SvelteSet/SvelteMap mutations must be visible.
describe('CreatureEditorStore', () => {
  beforeEach(() => editorStore.resetEditor());

  it('startCreate activates a level-1 creature with computed stats', () => {
    editorStore.startCreate();
    expect(editorStore.active).toBe(true);
    expect(editorStore.creature?.level).toBe(1);
    expect(editorStore.computedStats).not.toBeNull();
    expect(editorStore.computedStats!.hp).toBeGreaterThan(0);
  });

  it('updateBenchmark recomputes computedStats, sets dirty, and clears baseStats', () => {
    editorStore.startCreate();
    const before = editorStore.computedStats!.ac;
    editorStore.updateBenchmark('ac', BENCHMARK_VALUES_4.extreme);
    expect(editorStore.computedStats!.ac).toBeGreaterThan(before);
    expect(editorStore.isDirty).toBe(true);
    expect(editorStore.creature!.baseStats).toBeUndefined();
  });

  it('updateLevel rescales computedStats', () => {
    editorStore.startCreate();
    const hp1 = editorStore.computedStats!.hp;
    editorStore.updateLevel(12);
    expect(editorStore.creature!.level).toBe(12);
    expect(editorStore.computedStats!.hp).toBeGreaterThan(hp1);
  });

  it('toggleSection mutates the reactive SvelteSet; abilities+skills move together', () => {
    editorStore.startCreate();
    expect(editorStore.expandedSections.has('abilities')).toBe(true);
    expect(editorStore.expandedSections.has('skills')).toBe(true);
    editorStore.toggleSection('skills');
    expect(editorStore.expandedSections.has('abilities')).toBe(false);
    expect(editorStore.expandedSections.has('skills')).toBe(false);
  });

  it('validate records and clears errors in the reactive SvelteMap', () => {
    editorStore.startCreate();
    editorStore.updateCreature({ name: '   ' });
    expect(editorStore.validate()).toBe(false);
    expect(editorStore.validationErrors.get('name')).toBeTruthy();
    editorStore.updateCreature({ name: 'Goblin' });
    expect(editorStore.validate()).toBe(true);
    expect(editorStore.validationErrors.size).toBe(0);
  });

  it('applyRolePreset preserves user-authored skills', () => {
    editorStore.startCreate();
    editorStore.addSkill('Stealth', 0.5);
    editorStore.applyRolePreset('brute');
    expect(editorStore.creature!.benchmarks.skills.some((s) => s.skill === 'Stealth')).toBe(true);
  });

  it('removeStrike keeps at least one strike; addStrike appends', () => {
    editorStore.startCreate();
    expect(editorStore.creature!.strikes.length).toBe(1);
    editorStore.removeStrike(0);
    expect(editorStore.creature!.strikes.length).toBe(1);
    editorStore.addStrike('Bite');
    expect(editorStore.creature!.strikes.length).toBe(2);
    editorStore.removeStrike(0);
    expect(editorStore.creature!.strikes.map((s) => s.name)).toEqual(['Bite']);
  });

  it('updateBenchmark writes dotted ability and save paths through to computedStats', () => {
    editorStore.startCreate();
    const strBefore = editorStore.computedStats!.str;
    const fortBefore = editorStore.computedStats!.fortitude;
    editorStore.updateBenchmark('abilities.str', BENCHMARK_VALUES_4.extreme);
    editorStore.updateBenchmark('saves.fortitude', 0);
    expect(editorStore.creature!.benchmarks.abilities.str).toBe(BENCHMARK_VALUES_4.extreme);
    expect(editorStore.creature!.benchmarks.saves.fortitude).toBe(0);
    expect(editorStore.computedStats!.str).toBeGreaterThan(strBefore);
    expect(editorStore.computedStats!.fortitude).toBeLessThan(fortBefore);
  });

  it('resetEditor deactivates and clears state', () => {
    editorStore.startCreate();
    editorStore.resetEditor();
    expect(editorStore.active).toBe(false);
    expect(editorStore.creature).toBeNull();
    expect(editorStore.computedStats).toBeNull();
  });
});

describe('confirmDiscardIfDirty (shared Cancel/close guard)', () => {
  beforeEach(() => editorStore.resetEditor());

  const envWith = (result: boolean) => {
    const confirmDiscard = vi.fn(async () => result);
    return { env: { confirmDiscard } as unknown as EditorEnvironment, confirmDiscard };
  };

  it('proceeds without prompting when no edit is active', async () => {
    const { env, confirmDiscard } = envWith(false);
    expect(await editorStore.confirmDiscardIfDirty(env)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('proceeds without prompting when active but not dirty', async () => {
    editorStore.startCreate();
    const { env, confirmDiscard } = envWith(false);
    expect(editorStore.isDirty).toBe(false);
    expect(await editorStore.confirmDiscardIfDirty(env)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('prompts when dirty and relays the user choice', async () => {
    editorStore.startCreate();
    editorStore.updateBenchmark('ac', BENCHMARK_VALUES_4.extreme);
    expect(editorStore.isDirty).toBe(true);

    const keep = envWith(false);
    expect(await editorStore.confirmDiscardIfDirty(keep.env)).toBe(false);
    expect(keep.confirmDiscard).toHaveBeenCalledOnce();

    const discard = envWith(true);
    expect(await editorStore.confirmDiscardIfDirty(discard.env)).toBe(true);
    expect(discard.confirmDiscard).toHaveBeenCalledOnce();
  });
});

describe('edit and import lifecycle', () => {
  beforeEach(() => editorStore.resetEditor());

  it('startEdit snapshots an original that later edits do not touch', () => {
    editorStore.startEdit(makeEditable());
    expect(editorStore.mode).toBe('edit');
    expect(editorStore.active).toBe(true);
    expect(editorStore.isDirty).toBe(false);
    editorStore.updateCreature({ name: 'Renamed' });
    expect(editorStore.creature!.name).toBe('Renamed');
    expect(editorStore.originalCreature!.name).toBe('Goblin Warrior');
    expect(editorStore.isDirty).toBe(true);
  });

  it('startEdit serves canonical baseStats at baseLevel and rescales once the level moves', () => {
    editorStore.startEdit(makeEditable({ baseLevel: 3, baseStats: makeBaseStats(999) }));
    expect(editorStore.computedStats!.hp).toBe(999);
    editorStore.updateLevel(5);
    expect(editorStore.computedStats!.hp).not.toBe(999);
    expect(editorStore.computedStats!.hp).toBeGreaterThan(0);
  });

  it('startImport starts dirty with no original and import-focused sections', () => {
    editorStore.startImport(makeEditable());
    expect(editorStore.mode).toBe('import');
    expect(editorStore.isDirty).toBe(true);
    expect(editorStore.originalCreature).toBeNull();
    expect(editorStore.isSectionExpanded('summary')).toBe(true);
    expect(editorStore.isSectionExpanded('spellcasting')).toBe(false);
  });

  it('cancelEdit drops the working copy and deactivates', () => {
    editorStore.startEdit(makeEditable());
    editorStore.updateCreature({ name: 'Doomed Edit' });
    editorStore.cancelEdit();
    expect(editorStore.active).toBe(false);
    expect(editorStore.creature).toBeNull();
    expect(editorStore.originalCreature).toBeNull();
    expect(editorStore.isDirty).toBe(false);
    expect(editorStore.mode).toBe('create');
  });

  it('mutations without an active creature are no-ops', () => {
    editorStore.removeTrait('goblin');
    editorStore.removeSkill('Stealth');
    editorStore.setSpellSlotOverride(1, 3);
    expect(editorStore.creature).toBeNull();
    expect(editorStore.isDirty).toBe(false);
    expect(editorStore.getCreatureForSave()).toBeNull();
  });
});

describe('sections', () => {
  beforeEach(() => editorStore.resetEditor());

  it('expandAllSections and collapseAllSections drive isSectionExpanded for every section', () => {
    editorStore.startCreate();
    editorStore.collapseAllSections();
    expect(ALL_SECTIONS.every((s) => !editorStore.isSectionExpanded(s))).toBe(true);
    editorStore.expandAllSections();
    expect(ALL_SECTIONS.every((s) => editorStore.isSectionExpanded(s))).toBe(true);
  });

  it('toggleSection re-expands a collapsed section, abilities and skills as a pair', () => {
    editorStore.startCreate();
    editorStore.collapseAllSections();
    editorStore.toggleSection('offense');
    expect(editorStore.isSectionExpanded('offense')).toBe(true);
    editorStore.toggleSection('abilities');
    expect(editorStore.isSectionExpanded('abilities')).toBe(true);
    expect(editorStore.isSectionExpanded('skills')).toBe(true);
  });
});

describe('traits', () => {
  beforeEach(() => editorStore.resetEditor());

  it('addTrait ignores duplicates and removeTrait deletes only the named trait', () => {
    editorStore.startCreate();
    editorStore.addTrait('undead');
    editorStore.addTrait('undead');
    editorStore.addTrait('mindless');
    expect(editorStore.creature!.traits).toEqual(['undead', 'mindless']);
    editorStore.removeTrait('undead');
    expect(editorStore.creature!.traits).toEqual(['mindless']);
    editorStore.removeTrait('missing');
    expect(editorStore.creature!.traits).toEqual(['mindless']);
  });
});

describe('validation and save payload', () => {
  beforeEach(() => editorStore.resetEditor());

  it('getCreatureForSave returns the edited creature only when valid', () => {
    editorStore.startCreate();
    editorStore.updateCreature({ name: 'Goblin Boss' });
    editorStore.updateLevel(5);
    const saved = editorStore.getCreatureForSave();
    expect(saved?.name).toBe('Goblin Boss');
    expect(saved?.level).toBe(5);
    editorStore.updateCreature({ name: '' });
    expect(editorStore.getCreatureForSave()).toBeNull();
    expect(editorStore.validationErrors.get('name')).toBeTruthy();
  });

  it('getCreatureForSave rejects an out-of-range level', () => {
    editorStore.startCreate();
    editorStore.updateCreature({ level: 99 });
    expect(editorStore.getCreatureForSave()).toBeNull();
    expect(editorStore.validationErrors.get('level')).toBeTruthy();
  });
});

describe('skills', () => {
  beforeEach(() => editorStore.resetEditor());

  it('addSkill upserts by name and updateSkillBenchmark rewrites the value', () => {
    editorStore.startCreate();
    editorStore.addSkill('Stealth', BENCHMARK_VALUES_4.moderate);
    const moderate = editorStore.computedStats!.skills['Stealth'];
    editorStore.addSkill('Stealth', BENCHMARK_VALUES_4.high);
    expect(editorStore.creature!.benchmarks.skills).toEqual([
      { skill: 'Stealth', benchmark: BENCHMARK_VALUES_4.high }
    ]);
    editorStore.updateSkillBenchmark('Stealth', BENCHMARK_VALUES_4.extreme);
    expect(editorStore.creature!.benchmarks.skills[0].benchmark).toBe(BENCHMARK_VALUES_4.extreme);
    expect(editorStore.computedStats!.skills['Stealth']).toBeGreaterThan(moderate);
  });

  it('updateSkillBenchmark on an unknown skill changes nothing', () => {
    editorStore.startCreate();
    editorStore.addSkill('Stealth', BENCHMARK_VALUES_4.moderate);
    editorStore.updateSkillBenchmark('Acrobatics', BENCHMARK_VALUES_4.extreme);
    expect(editorStore.creature!.benchmarks.skills).toEqual([
      { skill: 'Stealth', benchmark: BENCHMARK_VALUES_4.moderate }
    ]);
  });

  it('removeSkill drops the entry and invalidates canonical baseStats', () => {
    const benchmarks = getDefaultBenchmarks();
    benchmarks.skills = [{ skill: 'Stealth', benchmark: BENCHMARK_VALUES_4.moderate }];
    editorStore.startEdit(makeEditable({ benchmarks, baseLevel: 3, baseStats: makeBaseStats(999) }));
    expect(editorStore.computedStats!.hp).toBe(999);
    editorStore.removeSkill('Stealth');
    expect(editorStore.creature!.benchmarks.skills).toEqual([]);
    expect(editorStore.creature!.baseStats).toBeUndefined();
    expect(editorStore.computedStats!.hp).not.toBe(999);
  });
});

describe('spell slot overrides', () => {
  beforeEach(() => editorStore.resetEditor());

  it('setSpellSlotOverride clamps at zero; resetSpellSlotOverride removes and drops an emptied map', () => {
    editorStore.startCreate();
    editorStore.setSpellSlotOverride(1, 3);
    editorStore.setSpellSlotOverride(2, -4);
    expect(editorStore.creature!.benchmarks.spellSlotOverrides).toEqual({ 1: 3, 2: 0 });
    editorStore.resetSpellSlotOverride(2);
    expect(editorStore.creature!.benchmarks.spellSlotOverrides).toEqual({ 1: 3 });
    editorStore.resetSpellSlotOverride(1);
    expect(editorStore.creature!.benchmarks.spellSlotOverrides).toBeUndefined();
  });

  it('resetSpellSlotOverride without an existing override changes nothing', () => {
    editorStore.startCreate();
    editorStore.resetSpellSlotOverride(3);
    expect(editorStore.creature!.benchmarks.spellSlotOverrides).toBeUndefined();
    expect(editorStore.isDirty).toBe(false);
  });
});

describe('strikes', () => {
  beforeEach(() => editorStore.resetEditor());

  it('updateStrike merges fields and deletes keys explicitly set to undefined', () => {
    editorStore.startCreate();
    editorStore.updateStrike(0, { name: 'Claw', range: 30, isRanged: true });
    const merged = editorStore.creature!.strikes[0];
    expect(merged.name).toBe('Claw');
    expect(merged.range).toBe(30);
    expect(merged.isRanged).toBe(true);
    editorStore.updateStrike(0, { range: undefined, isRanged: undefined });
    const stripped = editorStore.creature!.strikes[0];
    expect('range' in stripped).toBe(false);
    expect('isRanged' in stripped).toBe(false);
    expect(stripped.name).toBe('Claw');
  });

  it('updateStrike ignores an out-of-range index', () => {
    editorStore.startCreate();
    editorStore.updateStrike(1, { name: 'Ghost' });
    editorStore.updateStrike(-1, { name: 'Ghost' });
    expect(editorStore.creature!.strikes[0].name).toBe('Melee Strike');
    expect(editorStore.isDirty).toBe(false);
  });

  it('benchmark and persistent setters write through; clearStrikePersistent strips every persistent field', () => {
    editorStore.startCreate();
    editorStore.updateStrikeAttackBenchmark(0, 1);
    editorStore.updateStrikeDamageBenchmark(0, 0);
    editorStore.updateStrikePersistentType(0, 'fire');
    editorStore.setStrikeCustomPersistentFormula(0, '2d6');
    const strike = editorStore.creature!.strikes[0];
    expect(strike.attackBenchmark).toBe(1);
    expect(strike.damageBenchmark).toBe(0);
    expect(strike.persistentDamageType).toBe('fire');
    expect(strike.customPersistentFormula).toBe('2d6');
    editorStore.clearStrikePersistent(0);
    const cleared = editorStore.creature!.strikes[0];
    expect('persistentBenchmark' in cleared).toBe(false);
    expect('persistentDamage' in cleared).toBe(false);
    expect('customPersistentFormula' in cleared).toBe(false);
    expect('persistentDamageType' in cleared).toBe(false);
  });
});

describe('special abilities', () => {
  beforeEach(() => editorStore.resetEditor());

  it('add, update, and remove round-trip; out-of-range updates are ignored', () => {
    editorStore.startCreate();
    editorStore.addSpecialAbility(makeAbility());
    editorStore.updateSpecialAbility(0, { name: 'Greater Rend', actions: 2 });
    const ability = editorStore.creature!.specialAbilities[0];
    expect(ability.name).toBe('Greater Rend');
    expect(ability.actions).toBe(2);
    expect(ability.description).toBe('Rends the target.');
    editorStore.updateSpecialAbility(3, { name: 'Nope' });
    expect(editorStore.creature!.specialAbilities[0].name).toBe('Greater Rend');
    editorStore.removeSpecialAbility(0);
    expect(editorStore.creature!.specialAbilities).toEqual([]);
  });

  it('updateAbilityScalableOverride replaces the tier, discards a custom value, and undefined clears both', () => {
    editorStore.startCreate();
    editorStore.addSpecialAbility(
      makeAbility({
        scalableValues: [{ type: 'damage', benchmark: 0.5, originalValue: '2d6+4', customValue: '3d6' }]
      })
    );
    editorStore.updateAbilityScalableOverride(0, 0, 0.75);
    const withOverride = editorStore.creature!.specialAbilities[0].scalableValues![0];
    expect(withOverride.override).toBe(0.75);
    expect('customValue' in withOverride).toBe(false);
    expect(withOverride.benchmark).toBe(0.5);
    expect(withOverride.originalValue).toBe('2d6+4');
    editorStore.updateAbilityScalableOverride(0, 0, undefined);
    expect('override' in editorStore.creature!.specialAbilities[0].scalableValues![0]).toBe(false);
  });

  it('updateAbilityScalableCustomValue overlays without touching the tier override; empty string clears it', () => {
    editorStore.startCreate();
    editorStore.addSpecialAbility(
      makeAbility({
        scalableValues: [{ type: 'dc', benchmark: 0.5, originalValue: '25', override: 0.75 }]
      })
    );
    editorStore.updateAbilityScalableCustomValue(0, 0, '27');
    const withCustom = editorStore.creature!.specialAbilities[0].scalableValues![0];
    expect(withCustom.customValue).toBe('27');
    expect(withCustom.override).toBe(0.75);
    editorStore.updateAbilityScalableCustomValue(0, 0, '');
    const cleared = editorStore.creature!.specialAbilities[0].scalableValues![0];
    expect('customValue' in cleared).toBe(false);
    expect(cleared.override).toBe(0.75);
  });

  it('scalable edits ignore abilities without scalable values and out-of-range indexes', () => {
    editorStore.startCreate();
    editorStore.addSpecialAbility(makeAbility());
    editorStore.addSpecialAbility(
      makeAbility({ id: 'ab2', scalableValues: [{ type: 'damage', benchmark: 0.5, originalValue: '2d6' }] })
    );
    editorStore.updateAbilityScalableOverride(0, 0, 1);
    expect(editorStore.creature!.specialAbilities[0].scalableValues).toBeUndefined();
    editorStore.updateAbilityScalableCustomValue(1, 5, '9');
    editorStore.updateAbilityScalableOverride(9, 0, 1);
    expect(editorStore.creature!.specialAbilities[1].scalableValues).toEqual([
      { type: 'damage', benchmark: 0.5, originalValue: '2d6' }
    ]);
  });

  it('updateAbilityCustomDescriptionTemplate sets a template and empty input reverts it', () => {
    editorStore.startCreate();
    editorStore.addSpecialAbility(makeAbility());
    editorStore.updateAbilityCustomDescriptionTemplate(0, 'Deals {0} fire damage');
    expect(editorStore.creature!.specialAbilities[0].customDescriptionTemplate).toBe('Deals {0} fire damage');
    editorStore.updateAbilityCustomDescriptionTemplate(0, '');
    expect('customDescriptionTemplate' in editorStore.creature!.specialAbilities[0]).toBe(false);
    editorStore.updateAbilityCustomDescriptionTemplate(4, 'ignored');
    expect(editorStore.creature!.specialAbilities).toHaveLength(1);
  });
});

describe('damage modifiers and immunities', () => {
  beforeEach(() => editorStore.resetEditor());

  it('addResistance dedupes by type; updateResistance merges; removeResistance splices', () => {
    editorStore.startCreate();
    editorStore.addResistance('fire');
    editorStore.addResistance('fire', 10);
    editorStore.addResistance('cold', 10);
    expect(editorStore.creature!.resistances).toEqual([
      { type: 'fire', value: 5 },
      { type: 'cold', value: 10 }
    ]);
    editorStore.updateResistance(0, { value: 15, exceptions: ['adamantine'] });
    expect(editorStore.creature!.resistances[0]).toEqual({
      type: 'fire',
      value: 15,
      exceptions: ['adamantine']
    });
    editorStore.updateResistance(5, { value: 1 });
    editorStore.removeResistance(0);
    expect(editorStore.creature!.resistances).toEqual([{ type: 'cold', value: 10 }]);
  });

  it('addWeakness dedupes by type; updateWeakness merges; removeWeakness splices', () => {
    editorStore.startCreate();
    editorStore.addWeakness('slashing');
    editorStore.addWeakness('slashing', 10);
    editorStore.addWeakness('vitality', 7);
    expect(editorStore.creature!.weaknesses).toEqual([
      { type: 'slashing', value: 5 },
      { type: 'vitality', value: 7 }
    ]);
    editorStore.updateWeakness(1, { value: 9 });
    expect(editorStore.creature!.weaknesses[1]).toEqual({ type: 'vitality', value: 9 });
    editorStore.updateWeakness(5, { value: 1 });
    editorStore.removeWeakness(0);
    expect(editorStore.creature!.weaknesses).toEqual([{ type: 'vitality', value: 9 }]);
  });

  it('addImmunity dedupes by type; updateImmunity merges; removeImmunity splices', () => {
    editorStore.startCreate();
    editorStore.addImmunity('fire');
    editorStore.addImmunity('fire');
    editorStore.addImmunity('mental');
    expect(editorStore.creature!.immunities).toEqual([{ type: 'fire' }, { type: 'mental' }]);
    editorStore.updateImmunity(0, { exceptions: ['magical'] });
    expect(editorStore.creature!.immunities[0]).toEqual({ type: 'fire', exceptions: ['magical'] });
    editorStore.updateImmunity(5, { type: 'ignored' });
    editorStore.removeImmunity(0);
    expect(editorStore.creature!.immunities).toEqual([{ type: 'mental' }]);
  });
});

describe('senses', () => {
  beforeEach(() => editorStore.resetEditor());

  it('updateSense merges and an explicit undefined range clears it', () => {
    editorStore.startCreate();
    editorStore.addSense('scent');
    expect(editorStore.creature!.senses[0]).toEqual({ type: 'scent', acuity: 'imprecise', range: 30 });
    editorStore.updateSense(0, { acuity: 'precise', range: undefined });
    const sense = editorStore.creature!.senses[0];
    expect(sense.acuity).toBe('precise');
    expect('range' in sense).toBe(false);
    editorStore.updateSense(2, { range: 60 });
    expect(editorStore.creature!.senses).toHaveLength(1);
  });
});

describe('troop', () => {
  beforeEach(() => editorStore.resetEditor());

  it('setTroop seeds a default formation size and setTroopSize changes it', () => {
    editorStore.startCreate();
    editorStore.setTroop(true);
    expect(editorStore.creature!.isTroop).toBe(true);
    expect(editorStore.creature!.troopSize).toBe('gargantuan');
    editorStore.setTroopSize('huge');
    expect(editorStore.creature!.troopSize).toBe('huge');
    editorStore.setTroop(true);
    expect(editorStore.creature!.troopSize).toBe('huge');
    editorStore.setTroop(false);
    expect(editorStore.creature!.isTroop).toBe(false);
  });
});

describe('role presets', () => {
  beforeEach(() => editorStore.resetEditor());

  it('applyRolePreset with an unknown key changes nothing', () => {
    editorStore.startCreate();
    const acBefore = editorStore.creature!.benchmarks.ac;
    editorStore.applyRolePreset('not-a-preset');
    expect(editorStore.creature!.benchmarks.ac).toBe(acBefore);
    expect(editorStore.isDirty).toBe(false);
  });

  it('applyRolePreset applies the preset base speed and preserves other speeds', () => {
    editorStore.startCreate();
    editorStore.updateSpeed('fly', 40);
    editorStore.applyRolePreset('skirmisher');
    expect(editorStore.creature!.speeds.land).toBe(35);
    expect(editorStore.creature!.speeds.fly).toBe(40);
  });
});

describe('no-op mutations keep the editor clean', () => {
  beforeEach(() => editorStore.resetEditor());

  it('duplicate adds change nothing and do not dirty', () => {
    editorStore.startEdit(makeEditable({
      resistances: [{ type: 'fire', value: 5 }],
      weaknesses: [{ type: 'cold', value: 5 }],
      immunities: [{ type: 'poison' }],
      senses: [{ type: 'darkvision' }]
    }));
    editorStore.addResistance('fire');
    editorStore.addWeakness('cold');
    editorStore.addImmunity('poison');
    editorStore.addSense('darkvision');
    editorStore.addLanguage('common');
    editorStore.addTrait('goblin');
    expect(editorStore.creature!.resistances).toHaveLength(1);
    expect(editorStore.creature!.languages).toEqual(['common']);
    expect(editorStore.isDirty).toBe(false);
  });

  it('removing absent entries does not dirty', () => {
    editorStore.startEdit(makeEditable());
    editorStore.removeTrait('undead');
    editorStore.removeLanguage('draconic');
    editorStore.removeSkill('Stealth');
    editorStore.updateSkillBenchmark('Stealth', BENCHMARK_VALUES_4.extreme);
    expect(editorStore.isDirty).toBe(false);
  });

  it('out-of-range removes are ignored and do not dirty', () => {
    editorStore.startEdit(makeEditable({
      strikes: [createDefaultStrike('A'), createDefaultStrike('B')]
    }));
    editorStore.removeResistance(0);
    editorStore.removeWeakness(-1);
    editorStore.removeImmunity(5);
    editorStore.removeSense(0);
    editorStore.removeSpecialAbility(2);
    editorStore.removeStrike(7);
    expect(editorStore.creature!.strikes).toHaveLength(2);
    expect(editorStore.isDirty).toBe(false);
  });
});
