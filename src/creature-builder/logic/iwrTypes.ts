/**
 * Immunity / Weakness / Resistance (IWR) type vocabularies, mirrored from the PF2e
 * system's `CONFIG.PF2E.{immunity,weakness,resistance}Types` (src/scripts/config/iwr.ts).
 *
 * The dropdowns must offer every slug the system accepts, or imported creatures whose
 * IWR uses a category/material/condition we omit become un-editable. Slugs are the
 * canonical lowercase-hyphenated keys PF2e stores in `system.attributes.*`.
 */

export interface IwrTypeOption {
  value: string;
  label: string;
}

export interface IwrTypeGroup {
  label: string;
  options: IwrTypeOption[];
}

/** Precious materials that carry IWR properties (PF2e omits 5 niche AP-only ones). */
const MATERIALS = [
  'abysium', 'adamantine', 'cold-iron', 'dawnsilver', 'djezet', 'duskwood',
  'inubrix', 'noqual', 'orichalcum', 'peachwood', 'siccatite', 'silver'
];

const TRADITIONS = ['arcane', 'divine', 'occult', 'primal'];
const SANCTIFICATION = ['holy', 'unholy'];

const LABEL_OVERRIDES: Record<string, string> = {
  'all-damage': 'All Damage',
  'non-magical': 'Non-Magical',
  'off-guard': 'Off-Guard'
};

/** Title-case a slug for display (PF2e ships localized labels, but the slug humanizes cleanly). */
export function humanizeIwrType(slug: string): string {
  return (
    LABEL_OVERRIDES[slug] ??
    slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  );
}

function group(label: string, slugs: string[]): IwrTypeGroup {
  return { label, options: slugs.map((value) => ({ value, label: humanizeIwrType(value) })) };
}

const ENERGY_ELEMENTAL = ['acid', 'air', 'cold', 'earth', 'electricity', 'fire', 'force', 'light', 'metal', 'plant', 'sonic', 'vitality', 'void', 'water', 'wood'];
const PHYSICAL = ['physical', 'bludgeoning', 'piercing', 'slashing', 'bleed'];

export const RESISTANCE_TYPE_GROUPS: IwrTypeGroup[] = [
  group('Physical', PHYSICAL),
  group('Energy & Elemental', ENERGY_ELEMENTAL),
  group('Mental & Other', ['mental', 'poison', 'precision', 'spirit']),
  group('Categories', ['all-damage', 'energy', 'area-damage', 'persistent-damage', 'critical-hits', 'salt', 'salt-water', 'time']),
  group('Attack Source', ['axes', 'nonlethal', 'nonlethal-attacks', 'unarmed-attacks', 'weapons', 'weapons-shedding-bright-light', 'spells', 'damage-from-spells']),
  group('Magic', ['magical', 'non-magical', ...TRADITIONS]),
  group('Sanctification', SANCTIFICATION),
  group('Materials', MATERIALS),
  group('Special', ['alchemical', 'ghost-touch', 'mythic', 'radiation', 'protean-anatomy', 'vorpal', 'vorpal-adamantine'])
];

export const WEAKNESS_TYPE_GROUPS: IwrTypeGroup[] = [
  group('Physical', PHYSICAL),
  group('Energy & Elemental', ENERGY_ELEMENTAL),
  group('Mental & Other', ['mental', 'poison', 'precision', 'spirit']),
  group('Categories', ['all-damage', 'energy', 'area-damage', 'persistent-damage', 'splash-damage', 'critical-hits', 'salt', 'salt-water', 'time', 'emotion']),
  group('Attack Source', ['nonlethal-attacks', 'unarmed-attacks', 'weapons', 'weapons-shedding-bright-light', 'spells', 'arrow-vulnerability', 'axe-vulnerability']),
  group('Magic', ['magical', 'non-magical', ...TRADITIONS]),
  group('Sanctification', SANCTIFICATION),
  group('Materials', MATERIALS),
  group('Special', ['alchemical', 'ghost-touch', 'glass', 'mythic', 'radiation', 'vorpal', 'vorpal-fear', 'vampire-weaknesses', 'vulnerable-to-sunlight'])
];

export const IMMUNITY_TYPE_GROUPS: IwrTypeGroup[] = [
  group('Physical', PHYSICAL),
  // immunityTypes has no `plant`
  group('Energy & Elemental', ENERGY_ELEMENTAL.filter((s) => s !== 'plant')),
  group('Mental & Other', ['mental', 'poison', 'precision', 'spirit']),
  group('Categories', ['critical-hits', 'area-damage', 'persistent-damage', 'energy', 'salt-water', 'time']),
  group('Effects', ['death-effects', 'disease', 'curse', 'emotion', 'fear-effects', 'fortune-effects', 'misfortune-effects', 'healing', 'illusion', 'polymorph', 'possession', 'prediction', 'scrying', 'detection', 'sleep', 'aging', 'trip', 'swarm-attacks', 'swarm-mind', 'spell-deflection', 'object-immunities']),
  group('Conditions', ['blinded', 'clumsy', 'confused', 'controlled', 'dazzled', 'deafened', 'doomed', 'drained', 'enfeebled', 'fascinated', 'fatigued', 'fleeing', 'frightened', 'grabbed', 'immobilized', 'off-guard', 'paralyzed', 'petrified', 'prone', 'restrained', 'sickened', 'slowed', 'stunned', 'stupefied', 'unconscious', 'wounded']),
  group('Sense & Vector', ['auditory', 'olfactory', 'visual', 'inhaled']),
  group('Magic', ['magic', 'non-magical', ...TRADITIONS]),
  group('Sanctification', SANCTIFICATION),
  group('Attack Source', ['nonlethal-attacks', 'unarmed-attacks']),
  group('Materials', MATERIALS),
  group('Special', ['alchemical', 'radiation'])
];

/**
 * Slugs offered when picking an `exceptions` entry (resistance/weakness "except …") or a
 * resistance `doubleVs` entry — the damage qualities and materials that bypass or double an
 * IWR. Covers every exception value present in the bestiary.
 */
export const EXCEPTION_TYPE_GROUPS: IwrTypeGroup[] = [
  group('Materials', MATERIALS),
  group('Physical', ['bludgeoning', 'piercing', 'slashing', 'physical']),
  group('Energy & Other', ['acid', 'cold', 'electricity', 'fire', 'force', 'sonic', 'vitality', 'void', 'spirit', 'mental', 'light']),
  group('Categories', ['critical-hits', 'area-damage']),
  group('Magic', ['magical', 'non-magical', ...TRADITIONS]),
  group('Sanctification', SANCTIFICATION),
  group('Special', ['ghost-touch', 'vorpal-adamantine', 'weapons', 'unarmed-attacks', 'axes', 'weapons-shedding-bright-light'])
];

function flatten(groups: IwrTypeGroup[]): string[] {
  return groups.flatMap((g) => g.options.map((o) => o.value));
}

export const RESISTANCE_TYPES = flatten(RESISTANCE_TYPE_GROUPS);
export const WEAKNESS_TYPES = flatten(WEAKNESS_TYPE_GROUPS);
export const IMMUNITY_TYPES = flatten(IMMUNITY_TYPE_GROUPS);
export const EXCEPTION_TYPES = flatten(EXCEPTION_TYPE_GROUPS);
