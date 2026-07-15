import { describe, it, expect } from 'vitest';
import {
   buildInlineElement,
   defaultSpec,
   INLINE_CONDITIONS,
   type InlineElementKind,
   type InlineElementSpec
} from '@/creature-builder/logic/inlineElements';
import {
   parseAbilityDescription,
   renderAbilityDescription,
   renderAbilityDescriptionHtml
} from '@/creature-builder/logic/abilityScaling';

const LEVEL = 12;
const ALL_KINDS: InlineElementKind[] = [
   'save', 'skill', 'perception', 'flat', 'damage', 'persistent', 'healing', 'template', 'condition', 'roll'
];

describe('buildInlineElement', () => {
   it('every default spec round-trips: rendering the templated macro with its value reproduces the preview', () => {
      for (const kind of ALL_KINDS) {
         const built = buildInlineElement(defaultSpec(kind, LEVEL), LEVEL, 0);
         const values = built.scalableValue ? [built.scalableValue] : [];
         expect(renderAbilityDescription(built.templated, values, LEVEL), kind).toBe(built.preview);
      }
   });

   it('scalable kinds emit a value; literal kinds do not', () => {
      const scalable: InlineElementKind[] = ['save', 'skill', 'perception', 'damage', 'persistent', 'condition'];
      const literal: InlineElementKind[] = ['flat', 'healing', 'template', 'roll'];
      for (const kind of scalable) {
         expect(buildInlineElement(defaultSpec(kind, LEVEL), LEVEL, 0).scalableValue, kind).toBeDefined();
      }
      for (const kind of literal) {
         expect(buildInlineElement(defaultSpec(kind, LEVEL), LEVEL, 0).scalableValue, kind).toBeUndefined();
      }
      // A non-valued condition is literal too.
      const grabbed: InlineElementSpec = { kind: 'condition', name: 'Grabbed', valued: false, value: 1 };
      expect(buildInlineElement(grabbed, LEVEL, 0).scalableValue).toBeUndefined();
   });

   it('a saving throw matches what the parser produces for the same macro', () => {
      const built = buildInlineElement({ kind: 'save', save: 'will', tier: 'moderate', basic: false }, LEVEL, 0);
      const parsed = parseAbilityDescription(built.preview, LEVEL);
      expect(built.templated).toBe(parsed.template);
      expect(built.scalableValue).toEqual(parsed.scalableValues[0]);
      expect(built.scalableValue).toMatchObject({ type: 'dc', checkType: 'will', baseLevel: LEVEL });
   });

   it('a basic save carries the basic flag through both preview and template', () => {
      const built = buildInlineElement({ kind: 'save', save: 'reflex', tier: 'high', basic: true }, LEVEL, 3);
      expect(built.preview).toMatch(/^@Check\[reflex\|dc:\d+\|basic:true\]$/);
      expect(built.templated).toBe('@Check[reflex|dc:{3}|basic:true]');
   });

   it('a skill DC is editable but flat (checkType is the skill slug, not a save)', () => {
      const built = buildInlineElement({ kind: 'skill', skill: 'Athletics', dc: 30 }, LEVEL, 0);
      expect(built.preview).toBe('@Check[athletics|dc:30]');
      expect(built.templated).toBe('@Check[athletics|dc:{0}]');
      expect(built.scalableValue).toEqual(parseAbilityDescription(built.preview, LEVEL).scalableValues[0]);
   });

   it('a flat check is a literal macro with no scalable value', () => {
      const built = buildInlineElement({ kind: 'flat', dc: 5 }, LEVEL, 0);
      expect(built.preview).toBe('@Check[flat|dc:5]');
      expect(built.templated).toBe('@Check[flat|dc:5]');
      expect(built.scalableValue).toBeUndefined();
   });

   it('damage matches the parser and preserves the type bracket', () => {
      const built = buildInlineElement({ kind: 'damage', tier: 'moderate', damageType: 'fire' }, LEVEL, 0);
      expect(built.preview).toMatch(/^@Damage\[.+\[fire\]\]$/);
      expect(built.templated).toBe(`@Damage[{0}[fire]]`);
      expect(built.scalableValue).toEqual(parseAbilityDescription(built.preview, LEVEL).scalableValues[0]);
      expect(built.scalableValue).toMatchObject({ type: 'damage', damageType: 'fire' });
   });

   it('untyped damage omits the type bracket', () => {
      const built = buildInlineElement({ kind: 'damage', tier: 'moderate', damageType: 'untyped' }, LEVEL, 1);
      expect(built.templated).toBe('@Damage[{1}]');
      expect(built.scalableValue).not.toHaveProperty('damageType');
   });

   it('persistent damage tags [persistent,type] and scales', () => {
      const built = buildInlineElement({ kind: 'persistent', tier: 'moderate', damageType: 'bleed' }, LEVEL, 2);
      expect(built.templated).toBe('@Damage[{2}[persistent,bleed]]');
      expect(built.scalableValue).toMatchObject({ type: 'persistent', damageType: 'bleed', baseLevel: LEVEL });
   });

   it('a valued condition emits a name-based @UUID and a condition scalable', () => {
      const built = buildInlineElement({ kind: 'condition', name: 'Frightened', valued: true, value: 2 }, LEVEL, 0);
      expect(built.preview).toBe('@UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened 2}');
      expect(built.templated).toBe('@UUID[Compendium.pf2e.conditionitems.Item.Frightened]{Frightened {0}}');
      expect(built.scalableValue).toEqual(parseAbilityDescription(built.preview, LEVEL).scalableValues[0]);
      expect(built.scalableValue).toMatchObject({ type: 'condition', conditionSlug: 'Frightened', conditionLabel: 'Frightened' });
   });

   it('an area template and a raw roll are literal', () => {
      expect(buildInlineElement({ kind: 'template', shape: 'emanation', distance: 30 }, LEVEL, 0).preview)
         .toBe('@Template[emanation|distance:30]');
      expect(buildInlineElement({ kind: 'roll', expression: '1d20+5' }, LEVEL, 0).preview).toBe('[[/r 1d20+5]]');
   });

   it('an inserted {N} inside a macro renders as a plain value (a working pill), not a highlight span', () => {
      const built = buildInlineElement({ kind: 'save', save: 'will', tier: 'moderate', basic: false }, LEVEL, 0);
      const html = renderAbilityDescriptionHtml(built.templated, [built.scalableValue!], LEVEL);
      expect(html).toBe(built.preview); // no <span class="scalable-inline"> wrapping the in-macro value
      expect(html).not.toContain('scalable-inline');
   });

   it('all valued conditions in the picker are recognised as scalable by the parser', () => {
      for (const c of INLINE_CONDITIONS.filter((c) => c.valued)) {
         const built = buildInlineElement({ kind: 'condition', name: c.name, valued: true, value: 1 }, LEVEL, 0);
         const parsed = parseAbilityDescription(built.preview, LEVEL);
         expect(parsed.scalableValues[0], c.name).toMatchObject({ type: 'condition', conditionSlug: c.name });
      }
   });
});
