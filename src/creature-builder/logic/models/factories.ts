import type { TroopSize, Creature, CreatureBenchmarks, CreatureStrike, CreatureSense, SenseType, SpecialAbility } from './types';
import { defaultSenseAcuity } from './types';
import { BENCHMARK_VALUES, BENCHMARK_VALUES_4, BENCHMARK_VALUES_3 } from './benchmarks';

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// The kernel must stay Foundry-free, so we can't call foundry.utils.randomID(); roll an
// equivalent 16-char [A-Za-z0-9] id ourselves.
function randomId16(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}

function generateCreatureId(): string {
  return `creature-${randomId16()}`;
}

export const TROOP_SIZES: TroopSize[] = ['large', 'huge', 'gargantuan'];

// Square counts per troop formation threshold (NxN grid)
export const TROOP_SQUARES: Record<TroopSize, { full: number; threshold1: number; threshold2: number }> = {
  large: { full: 4, threshold1: 3, threshold2: 2 },       // 2x2
  huge: { full: 9, threshold1: 6, threshold2: 4 },        // 3x3
  gargantuan: { full: 16, threshold1: 12, threshold2: 8 } // 4x4 (standard troop)
};

// Keep in sync with CREATURE_PRESETS.baseline — both must return identical values.
export function getDefaultBenchmarks(): CreatureBenchmarks {
  return {
    abilities: {
      str: BENCHMARK_VALUES_4.moderate,
      dex: BENCHMARK_VALUES_4.moderate,
      con: BENCHMARK_VALUES_4.moderate,
      int: BENCHMARK_VALUES_4.moderate,
      wis: BENCHMARK_VALUES_4.moderate,
      cha: BENCHMARK_VALUES_4.moderate
    },
    perception: BENCHMARK_VALUES.moderate,
    ac: BENCHMARK_VALUES_4.moderate,
    hp: BENCHMARK_VALUES_3.moderate,
    saves: {
      fortitude: BENCHMARK_VALUES.high,
      reflex: BENCHMARK_VALUES.moderate,
      will: BENCHMARK_VALUES.low
    },
    strikeAttack: BENCHMARK_VALUES.high,
    strikeDamage: BENCHMARK_VALUES.moderate,
    skills: []
  };
}

export function createDefaultStrike(name: string = 'Strike'): CreatureStrike {
  return {
    name,
    attackBenchmark: BENCHMARK_VALUES_4.high,
    damageBenchmark: BENCHMARK_VALUES_4.moderate,
    attackBonus: 0,  // filled in by stat scaling
    damage: '',      // filled in by stat scaling
    damageType: 'slashing'
  };
}

/** A blank, editable action or passive. The id is a local handle (Foundry assigns the real item _id on save). */
export function createBlankAbility(kind: 'action' | 'passive', name?: string): SpecialAbility {
  const ability: SpecialAbility = {
    id: randomId16(),
    name: name ?? (kind === 'passive' ? 'New Passive' : 'New Action'),
    description: '',
    actionType: kind
  };
  if (kind === 'action') ability.actions = 1;
  return ability;
}

export function createDefaultSense(type: SenseType): CreatureSense {
  const acuity = defaultSenseAcuity(type);
  const sense: CreatureSense = { type, acuity };
  // Imprecise/vague senses are bounded by a range; precise vision is effectively unlimited.
  if (acuity !== 'precise') sense.range = 30;
  return sense;
}

export function createCreature(name: string, level: number = 1): Creature {
  return {
    id: generateCreatureId(),
    name,
    level: Math.max(-1, Math.min(24, level)),
    benchmarks: getDefaultBenchmarks(),
    traits: [],
    size: 'medium',
    creatureType: 'humanoid',
    rarity: 'common',
    senses: [],
    languages: ['common'],
    speeds: { land: 25 },
    immunities: [],
    resistances: [],
    weaknesses: [],
    strikes: [],
    specialAbilities: [],
    createdAt: Date.now()
  };
}
