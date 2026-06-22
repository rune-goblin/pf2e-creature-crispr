import { describe, it, expect, beforeEach } from 'vitest';
import { editorStore } from '@/creature-builder/editor';
import { sizeToPf2e, pf2eToSize, CREATURE_SIZES } from '@/creature-builder/logic/sizes';
import { buildSpeedSystem, buildSensesSystem } from '@/creature-builder/services/crud';
import { createBlankAbility, createDefaultSense } from '@/creature-builder/logic/models';

describe('size mapping', () => {
  it('maps editor long names to PF2e slugs and back', () => {
    expect(sizeToPf2e('medium')).toBe('med');
    expect(sizeToPf2e('large')).toBe('lg');
    expect(sizeToPf2e('gargantuan')).toBe('grg');
    expect(pf2eToSize('med')).toBe('medium');
    expect(pf2eToSize('grg')).toBe('gargantuan');
  });

  it('passes through a value already in the target vocabulary', () => {
    expect(sizeToPf2e('med')).toBe('med');
    expect(pf2eToSize('medium')).toBe('medium');
  });

  it('round-trips every listed size', () => {
    for (const { value } of CREATURE_SIZES) {
      expect(pf2eToSize(sizeToPf2e(value))).toBe(value);
    }
  });
});

describe('buildSpeedSystem', () => {
  it('puts land on value and the rest in otherSpeeds', () => {
    const sys = buildSpeedSystem({ land: 25, fly: 60, swim: 30 });
    expect(sys.value).toBe(25);
    expect(sys.otherSpeeds).toEqual(expect.arrayContaining([
      { type: 'fly', value: 60 },
      { type: 'swim', value: 30 }
    ]));
    expect(sys.otherSpeeds).toHaveLength(2);
  });

  it('defaults land to 25 and omits unset speeds', () => {
    const sys = buildSpeedSystem({ land: 0 } as { land: number });
    expect(sys.value).toBe(0);
    expect(sys.otherSpeeds).toEqual([]);
  });
});

describe('buildSensesSystem', () => {
  it('serializes type/acuity/range and drops empty fields', () => {
    const out = buildSensesSystem([
      { type: 'darkvision', acuity: 'precise' },
      { type: 'scent', acuity: 'imprecise', range: 30 }
    ]);
    expect(out[0]).toEqual({ type: 'darkvision', acuity: 'precise' });
    expect(out[1]).toEqual({ type: 'scent', acuity: 'imprecise', range: 30 });
  });
});

describe('createBlankAbility', () => {
  it('builds an action defaulting to a 1-action cost', () => {
    const a = createBlankAbility('action');
    expect(a.actionType).toBe('action');
    expect(a.actions).toBe(1);
    expect(a.id).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('builds a passive with no action cost', () => {
    const p = createBlankAbility('passive');
    expect(p.actionType).toBe('passive');
    expect(p.actions).toBeUndefined();
  });
});

describe('createDefaultSense', () => {
  it('defaults vision senses to precise with no range', () => {
    const s = createDefaultSense('darkvision');
    expect(s.acuity).toBe('precise');
    expect(s.range).toBeUndefined();
  });

  it('defaults non-vision senses to imprecise with a range', () => {
    const s = createDefaultSense('tremorsense');
    expect(s.acuity).toBe('imprecise');
    expect(s.range).toBe(30);
  });
});

describe('CreatureEditorStore — movement, senses, languages', () => {
  beforeEach(() => editorStore.resetEditor());

  it('startCreate seeds common language and empty senses', () => {
    editorStore.startCreate();
    expect(editorStore.creature!.languages).toEqual(['common']);
    expect(editorStore.creature!.senses).toEqual([]);
  });

  it('updateSpeed sets and clears non-land speeds; land is never deleted', () => {
    editorStore.startCreate();
    editorStore.updateSpeed('fly', 60);
    expect(editorStore.creature!.speeds.fly).toBe(60);
    editorStore.updateSpeed('fly', undefined);
    expect(editorStore.creature!.speeds.fly).toBeUndefined();
    editorStore.updateSpeed('land', undefined);
    expect(editorStore.creature!.speeds.land).toBe(0);
  });

  it('addLanguage is idempotent and removeLanguage drops it', () => {
    editorStore.startCreate();
    editorStore.addLanguage('draconic');
    editorStore.addLanguage('draconic');
    expect(editorStore.creature!.languages.filter((l) => l === 'draconic')).toHaveLength(1);
    editorStore.removeLanguage('draconic');
    expect(editorStore.creature!.languages).not.toContain('draconic');
  });

  it('addSense dedupes, updateSense edits acuity/range, removeSense drops it', () => {
    editorStore.startCreate();
    editorStore.addSense('darkvision');
    editorStore.addSense('darkvision');
    expect(editorStore.creature!.senses).toHaveLength(1);
    expect(editorStore.creature!.senses[0].acuity).toBe('precise');
    editorStore.updateSense(0, { range: 60 });
    expect(editorStore.creature!.senses[0].range).toBe(60);
    editorStore.updateSense(0, { range: undefined });
    expect(editorStore.creature!.senses[0].range).toBeUndefined();
    editorStore.removeSense(0);
    expect(editorStore.creature!.senses).toHaveLength(0);
  });

  it('addBlankAbility appends an action or a passive', () => {
    editorStore.startCreate();
    const before = editorStore.creature!.specialAbilities.length;
    editorStore.addBlankAbility('action');
    editorStore.addBlankAbility('passive');
    const abilities = editorStore.creature!.specialAbilities;
    expect(abilities).toHaveLength(before + 2);
    expect(abilities.at(-2)!.actionType).toBe('action');
    expect(abilities.at(-2)!.actions).toBe(1);
    expect(abilities.at(-1)!.actionType).toBe('passive');
  });
});
