/**
 * Picker vocabularies for traits / languages / senses, shaped as {@link IwrTypeGroup}[] so they drop
 * straight into TypeFilterMenu. Traits and languages are sourced from the live PF2e config
 * (`CONFIG.PF2E.creatureTraits` / `.languages`) so the lists stay complete and localized — and so an
 * imported creature's trait can always be re-added after removal. Small static fallbacks keep the
 * pickers usable outside a running Foundry (e.g. a bare component harness).
 */
import type { IwrTypeGroup, IwrTypeOption } from '@/creature-builder/logic/iwrTypes';
import { humanizeIwrType } from '@/creature-builder/logic/iwrTypes';
import { SENSE_TYPES } from '@/creature-builder/logic/models';
import { SKILLS } from '@/creature-builder/editor/creatureEditorUtils';

type ConfigRecord = Record<string, string>;

function configRecord(key: string): ConfigRecord {
  const pf2e = (globalThis as { CONFIG?: { PF2E?: Record<string, unknown> } }).CONFIG?.PF2E;
  const record = pf2e?.[key];
  return record && typeof record === 'object' ? (record as ConfigRecord) : {};
}

function localize(key: string, fallback: string): string {
  const i18n = (globalThis as { game?: { i18n?: { localize(k: string): string } } }).game?.i18n;
  const out = i18n?.localize(key);
  return out && out !== key ? out : fallback;
}

function recordToOptions(record: ConfigRecord): IwrTypeOption[] {
  return Object.entries(record)
    .map(([value, i18nKey]) => ({ value, label: localize(i18nKey, humanizeIwrType(value)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function slugsToOptions(slugs: string[]): IwrTypeOption[] {
  return slugs.map((value) => ({ value, label: humanizeIwrType(value) }));
}

const FALLBACK_TRAITS = [
  'aberration', 'animal', 'astral', 'beast', 'celestial', 'construct', 'dragon', 'dream', 'elemental',
  'fey', 'fiend', 'fungus', 'giant', 'humanoid', 'monitor', 'mutant', 'ooze', 'plant', 'spirit',
  'undead', 'holy', 'unholy', 'mindless', 'incorporeal', 'amphibious', 'aquatic'
];

const FALLBACK_LANGUAGES = ['common', 'draconic', 'dwarven', 'elven', 'goblin', 'jotun', 'orcish', 'sylvan', 'undercommon', 'aklo'];

export function getTraitGroups(): IwrTypeGroup[] {
  const record = configRecord('creatureTraits');
  const options = Object.keys(record).length ? recordToOptions(record) : slugsToOptions(FALLBACK_TRAITS);
  return [{ label: 'Traits', options }];
}

export function getLanguageGroups(): IwrTypeGroup[] {
  const record = configRecord('languages');
  const options = Object.keys(record).length ? recordToOptions(record) : slugsToOptions(FALLBACK_LANGUAGES);
  return [{ label: 'Languages', options }];
}

export function getSenseGroups(): IwrTypeGroup[] {
  return [{ label: 'Senses', options: slugsToOptions([...SENSE_TYPES]) }];
}

export function getSkillGroups(): IwrTypeGroup[] {
  return [{ label: 'Skills', options: SKILLS.map((value) => ({ value, label: value })) }];
}

const DAMAGE_PHYSICAL = ['bludgeoning', 'piercing', 'slashing'];
const DAMAGE_ENERGY = ['acid', 'cold', 'electricity', 'fire', 'force', 'sonic', 'vitality', 'void'];
const DAMAGE_MENTAL = ['mental', 'spirit', 'poison'];

/**
 * Canonical Remaster damage types, grouped as {@link IwrTypeGroup}[] so they drop into the same
 * grouped pickers as traits/IWR. Reused for both the primary attack type and the persistent rider.
 * `bleed` is conventionally persistent-only, so it's offered only when `includeBleed` is set (the
 * rider) — never on the primary attack.
 */
export function getDamageTypeGroups(opts: { includeBleed?: boolean } = {}): IwrTypeGroup[] {
  const physical = opts.includeBleed ? [...DAMAGE_PHYSICAL, 'bleed'] : DAMAGE_PHYSICAL;
  return [
    { label: 'Physical', options: slugsToOptions(physical) },
    { label: 'Energy & Other', options: slugsToOptions(DAMAGE_ENERGY) },
    { label: 'Mental, Spirit & Poison', options: slugsToOptions(DAMAGE_MENTAL) },
    { label: 'Untyped', options: slugsToOptions(['untyped']) }
  ];
}
