import { describe, it, expect, beforeEach } from 'vitest';
import { editorStore } from '@/creature-builder/editor';
import { BENCHMARK_VALUES_4 } from '@/creature-builder/logic/models';

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

  it('toggleSection mutates the reactive SvelteSet; abilities+defenses move together', () => {
    editorStore.startCreate();
    expect(editorStore.expandedSections.has('abilities')).toBe(true);
    expect(editorStore.expandedSections.has('defenses')).toBe(true);
    editorStore.toggleSection('abilities');
    expect(editorStore.expandedSections.has('abilities')).toBe(false);
    expect(editorStore.expandedSections.has('defenses')).toBe(false);
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
  });

  it('resetEditor deactivates and clears state', () => {
    editorStore.startCreate();
    editorStore.resetEditor();
    expect(editorStore.active).toBe(false);
    expect(editorStore.creature).toBeNull();
    expect(editorStore.computedStats).toBeNull();
  });
});
