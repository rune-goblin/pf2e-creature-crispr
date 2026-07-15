/**
 * Builds the PF2e inline elements the ability editor's "Add inline element" inserter drops into a
 * description — saving throws, damage, conditions, area templates, and so on.
 *
 * Each built element yields two macro strings and (for scaling elements) a ScalableValue:
 *  - `preview`   — values resolved literally (e.g. `@Check[will|dc:29]`), for the live pill preview.
 *  - `templated` — the same macro with a `{index}` placeholder where the scalable value goes, which
 *                  is what lands in `customDescriptionTemplate`.
 *  - `scalableValue` — constructed to be identical to what `parseAbilityDescription` produces for the
 *                  same macro, so an inserted value behaves exactly like an imported/parsed one: it
 *                  surfaces in the Editable Values panel, scales with level, and round-trips on export.
 */
import type { ScalableValue } from './models/types';
import {
   dcByLevel,
   dcToBenchmark,
   damageToBenchmark,
   persistentDamageToBenchmark,
   parseDiceFormulaAverage,
   scaleDC,
   scaleDamage,
   scalePersistentDamage
} from './abilityScaling';

export type SaveType = 'fortitude' | 'reflex' | 'will';
export type DcTier = 'moderate' | 'high' | 'extreme';
export type DamageTier = 'low' | 'moderate' | 'high' | 'extreme';
export type ThreeTier = 'low' | 'moderate' | 'high';
export type TemplateShape = 'emanation' | 'burst' | 'cone' | 'line';

export type InlineElementSpec =
   | { kind: 'save'; save: SaveType; tier: DcTier; basic: boolean }
   | { kind: 'skill'; skill: string; dc: number }
   | { kind: 'perception'; dc: number }
   | { kind: 'flat'; dc: number }
   | { kind: 'damage'; tier: DamageTier; damageType: string }
   | { kind: 'persistent'; tier: ThreeTier; damageType: string }
   | { kind: 'healing'; dice: string }
   | { kind: 'template'; shape: TemplateShape; distance: number }
   | { kind: 'condition'; name: string; valued: boolean; value: number }
   | { kind: 'roll'; expression: string };

export type InlineElementKind = InlineElementSpec['kind'];

export interface BuiltInlineElement {
   preview: string;
   templated: string;
   scalableValue?: ScalableValue;
}

// Benchmark scalars per tier, matching the tier tables in abilityScaling (DC/persistent/healing are
// 3-tier 0/0.5/1; strike damage is 4-tier 0/⅓/⅔/1).
const DC_TIER_SCALAR: Record<DcTier, number> = { moderate: 0, high: 0.5, extreme: 1 };
const DAMAGE_TIER_SCALAR: Record<DamageTier, number> = { low: 0, moderate: 1 / 3, high: 2 / 3, extreme: 1 };
const THREE_TIER_SCALAR: Record<ThreeTier, number> = { low: 0, moderate: 0.5, high: 1 };

const clampInt = (n: number, min: number): number => Math.max(min, Math.round(Number.isFinite(n) ? n : min));

/**
 * Build the macro + scalable value for a configured inline element at `level`, using `index` as the
 * `{N}` placeholder for its scalable value (the caller passes the next free scalableValues index).
 */
export function buildInlineElement(spec: InlineElementSpec, level: number, index: number): BuiltInlineElement {
   switch (spec.kind) {
      case 'save': {
         const dc = scaleDC(DC_TIER_SCALAR[spec.tier], level);
         const flags = spec.basic ? '|basic:true' : '';
         return {
            preview: `@Check[${spec.save}|dc:${dc}${flags}]`,
            templated: `@Check[${spec.save}|dc:{${index}}${flags}]`,
            scalableValue: {
               type: 'dc',
               benchmark: dcToBenchmark(dc, level),
               originalValue: String(dc),
               baseLevel: level,
               checkType: spec.save
            }
         };
      }
      case 'skill':
      case 'perception': {
         const checkType = spec.kind === 'perception' ? 'perception' : spec.skill.toLowerCase();
         const dc = clampInt(spec.dc, 1);
         return {
            preview: `@Check[${checkType}|dc:${dc}]`,
            templated: `@Check[${checkType}|dc:{${index}}]`,
            // A skill/perception DC is surfaced as an editable value but stays flat (not a creature
            // save), matching parseAbilityDescription — scalesWithLevel() is false for these checkTypes.
            scalableValue: {
               type: 'dc',
               benchmark: dcToBenchmark(dc, level),
               originalValue: String(dc),
               baseLevel: level,
               checkType
            }
         };
      }
      case 'flat': {
         // The parser skips flat checks; a fixed DC (5 to recover, 11 for concealment) isn't scalable.
         const macro = `@Check[flat|dc:${clampInt(spec.dc, 1)}]`;
         return { preview: macro, templated: macro };
      }
      case 'damage': {
         const formula = scaleDamage(DAMAGE_TIER_SCALAR[spec.tier], level);
         const type = spec.damageType && spec.damageType !== 'untyped' ? spec.damageType : '';
         return {
            preview: type ? `@Damage[${formula}[${type}]]` : `@Damage[${formula}]`,
            templated: type ? `@Damage[{${index}}[${type}]]` : `@Damage[{${index}}]`,
            scalableValue: {
               type: 'damage',
               benchmark: damageToBenchmark(parseDiceFormulaAverage(formula), level),
               originalValue: formula,
               baseLevel: level,
               ...(type ? { damageType: type } : {})
            }
         };
      }
      case 'persistent': {
         const formula = scalePersistentDamage(THREE_TIER_SCALAR[spec.tier], level);
         const type = spec.damageType || 'bleed';
         return {
            preview: `@Damage[${formula}[persistent,${type}]]`,
            templated: `@Damage[{${index}}[persistent,${type}]]`,
            scalableValue: {
               type: 'persistent',
               benchmark: persistentDamageToBenchmark(parseDiceFormulaAverage(formula), level),
               originalValue: formula,
               baseLevel: level,
               damageType: type
            }
         };
      }
      case 'healing': {
         // Inline healing is a plain dice roll tagged [healing]; the scaling 'healing' ScalableValue is
         // reserved for FastHealing rule amounts (flat integers), so this stays a literal roll.
         const macro = `@Damage[${(spec.dice.trim() || '1d8')}[healing]]`;
         return { preview: macro, templated: macro };
      }
      case 'template': {
         const macro = `@Template[${spec.shape}|distance:${clampInt(spec.distance, 5)}]`;
         return { preview: macro, templated: macro };
      }
      case 'condition': {
         const uuid = `@UUID[Compendium.pf2e.conditionitems.Item.${spec.name}]`;
         if (spec.valued) {
            const value = clampInt(spec.value, 1);
            return {
               preview: `${uuid}{${spec.name} ${value}}`,
               templated: `${uuid}{${spec.name} {${index}}}`,
               scalableValue: {
                  type: 'condition',
                  benchmark: 0,
                  originalValue: String(value),
                  baseLevel: level,
                  conditionSlug: spec.name,
                  conditionLabel: spec.name
               }
            };
         }
         const macro = `${uuid}{${spec.name}}`;
         return { preview: macro, templated: macro };
      }
      case 'roll': {
         const macro = `[[/r ${spec.expression.trim() || '1d20'}]]`;
         return { preview: macro, templated: macro };
      }
   }
}

/** A default spec for each kind, used to seed the inserter's config form. */
export function defaultSpec(kind: InlineElementKind, level: number): InlineElementSpec {
   switch (kind) {
      case 'save': return { kind, save: 'will', tier: 'moderate', basic: false };
      case 'skill': return { kind, skill: 'Athletics', dc: dcByLevel(level) };
      case 'perception': return { kind, dc: dcByLevel(level) };
      case 'flat': return { kind, dc: 5 };
      case 'damage': return { kind, tier: 'moderate', damageType: 'fire' };
      case 'persistent': return { kind, tier: 'moderate', damageType: 'bleed' };
      case 'healing': return { kind, dice: '2d8' };
      case 'template': return { kind, shape: 'emanation', distance: 30 };
      case 'condition': return { kind, name: 'Frightened', valued: true, value: 1 };
      case 'roll': return { kind, expression: '1d20' };
   }
}

// Conditions offered by the picker. `valued` marks the ones that carry a numeric value (and so become
// an editable scalable value); it matches VALUED_CONDITIONS in abilityScaling so an inserted valued
// condition round-trips through the parser. Names are the conditionitems slugs used in @UUID links.
export interface InlineCondition {
   name: string;
   valued: boolean;
}
export const INLINE_CONDITIONS: InlineCondition[] = [
   { name: 'Clumsy', valued: true },
   { name: 'Doomed', valued: true },
   { name: 'Drained', valued: true },
   { name: 'Dying', valued: true },
   { name: 'Enfeebled', valued: true },
   { name: 'Frightened', valued: true },
   { name: 'Sickened', valued: true },
   { name: 'Slowed', valued: true },
   { name: 'Stunned', valued: true },
   { name: 'Stupefied', valued: true },
   { name: 'Wounded', valued: true },
   { name: 'Blinded', valued: false },
   { name: 'Concealed', valued: false },
   { name: 'Confused', valued: false },
   { name: 'Controlled', valued: false },
   { name: 'Dazzled', valued: false },
   { name: 'Deafened', valued: false },
   { name: 'Fascinated', valued: false },
   { name: 'Fatigued', valued: false },
   { name: 'Fleeing', valued: false },
   { name: 'Grabbed', valued: false },
   { name: 'Immobilized', valued: false },
   { name: 'Invisible', valued: false },
   { name: 'Off-Guard', valued: false },
   { name: 'Paralyzed', valued: false },
   { name: 'Petrified', valued: false },
   { name: 'Prone', valued: false },
   { name: 'Quickened', valued: false },
   { name: 'Restrained', valued: false },
   { name: 'Unconscious', valued: false }
];

export const SAVE_TYPES: { value: SaveType; label: string }[] = [
   { value: 'fortitude', label: 'Fortitude' },
   { value: 'reflex', label: 'Reflex' },
   { value: 'will', label: 'Will' }
];

export const DC_TIERS: DcTier[] = ['moderate', 'high', 'extreme'];
export const DAMAGE_TIERS: DamageTier[] = ['low', 'moderate', 'high', 'extreme'];
export const PERSISTENT_TIERS: ThreeTier[] = ['low', 'moderate', 'high'];
export const TEMPLATE_SHAPES: TemplateShape[] = ['emanation', 'burst', 'cone', 'line'];

export const TIER_LABEL: Record<string, string> = { low: 'Low', moderate: 'Mod', high: 'High', extreme: 'Ext' };
