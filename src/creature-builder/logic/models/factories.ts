import type { TroopSize, Creature, CreatureBenchmarks, CreatureStrike } from './types';
import { BENCHMARK_VALUES, BENCHMARK_VALUES_4, BENCHMARK_VALUES_3 } from './benchmarks';

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// The kernel must stay Foundry-free, so we can't call foundry.utils.randomID(); roll an
// equivalent 16-char [A-Za-z0-9] id ourselves.
function generateCreatureId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return `creature-${id}`;
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
