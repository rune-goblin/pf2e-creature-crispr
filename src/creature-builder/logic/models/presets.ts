/**
 * Preset benchmark configurations for common creature archetypes.
 *
 * These are starting templates referenced by the bestiary UI when the user
 * clicks "use a preset". The "baseline" preset shares its benchmarks with
 * {@link getDefaultBenchmarks} (must remain in sync).
 */

import type { CreatureBenchmarks } from './types';
import { BENCHMARK_VALUES, BENCHMARK_VALUES_4, BENCHMARK_VALUES_3 } from './benchmarks';
import { getDefaultBenchmarks } from './factories';

/**
 * Preset benchmark configurations for common creature archetypes
 * Note: Abilities and AC use the 4-benchmark system (BENCHMARK_VALUES_4)
 */
export const CREATURE_PRESETS: Record<string, {
  name: string;
  description: string;
  baseSpeed?: number;
  benchmarks: Partial<CreatureBenchmarks>;
}> = {
  baseline: {
    name: 'Baseline',
    description: 'Generic humanoid — GMG-typical save spread and high attack bonus',
    benchmarks: getDefaultBenchmarks()
  },
  brute: {
    name: 'Brute',
    description: 'High HP and damage, lower AC and saves',
    benchmarks: {
      abilities: {
        str: BENCHMARK_VALUES_4.extreme,
        dex: BENCHMARK_VALUES_4.low,
        con: BENCHMARK_VALUES_4.high,
        int: BENCHMARK_VALUES_4.low,  // No "terrible" in 4-benchmark system
        wis: BENCHMARK_VALUES_4.low,
        cha: BENCHMARK_VALUES_4.low
      },
      perception: BENCHMARK_VALUES.low,
      ac: BENCHMARK_VALUES_4.low,
      hp: BENCHMARK_VALUES_3.high,
      saves: {
        fortitude: BENCHMARK_VALUES.high,
        reflex: BENCHMARK_VALUES.low,
        will: BENCHMARK_VALUES.low
      },
      strikeAttack: BENCHMARK_VALUES.high,
      strikeDamage: BENCHMARK_VALUES.high
    }
  },
  soldier: {
    name: 'Soldier',
    description: 'Disciplined melee — high Str, AC, Fort, attack and damage',
    benchmarks: {
      abilities: {
        str: BENCHMARK_VALUES_4.high,
        dex: BENCHMARK_VALUES_4.moderate,
        con: BENCHMARK_VALUES_4.moderate,
        int: BENCHMARK_VALUES_4.moderate,
        wis: BENCHMARK_VALUES_4.moderate,
        cha: BENCHMARK_VALUES_4.moderate
      },
      perception: BENCHMARK_VALUES.moderate,
      ac: BENCHMARK_VALUES_4.high,
      hp: BENCHMARK_VALUES_3.moderate,
      saves: {
        fortitude: BENCHMARK_VALUES.high,
        reflex: BENCHMARK_VALUES.moderate,
        will: BENCHMARK_VALUES.moderate
      },
      strikeAttack: BENCHMARK_VALUES.high,
      strikeDamage: BENCHMARK_VALUES.high
    }
  },
  skirmisher: {
    name: 'Skirmisher',
    description: 'Fast and evasive — high Dex and Reflex, low Fort',
    baseSpeed: 35,
    benchmarks: {
      abilities: {
        str: BENCHMARK_VALUES_4.moderate,
        dex: BENCHMARK_VALUES_4.high,
        con: BENCHMARK_VALUES_4.moderate,
        int: BENCHMARK_VALUES_4.moderate,
        wis: BENCHMARK_VALUES_4.moderate,
        cha: BENCHMARK_VALUES_4.moderate
      },
      perception: BENCHMARK_VALUES.moderate,
      ac: BENCHMARK_VALUES_4.moderate,
      hp: BENCHMARK_VALUES_3.moderate,
      saves: {
        fortitude: BENCHMARK_VALUES.low,
        reflex: BENCHMARK_VALUES.high,
        will: BENCHMARK_VALUES.moderate
      },
      strikeAttack: BENCHMARK_VALUES.moderate,
      strikeDamage: BENCHMARK_VALUES.moderate
    }
  },
  sniper: {
    name: 'Sniper',
    description: 'Ranged striker — high Perception and Dex; low HP and Fort',
    benchmarks: {
      abilities: {
        str: BENCHMARK_VALUES_4.moderate,
        dex: BENCHMARK_VALUES_4.high,
        con: BENCHMARK_VALUES_4.moderate,
        int: BENCHMARK_VALUES_4.moderate,
        wis: BENCHMARK_VALUES_4.moderate,
        cha: BENCHMARK_VALUES_4.moderate
      },
      perception: BENCHMARK_VALUES.high,
      ac: BENCHMARK_VALUES_4.moderate,
      hp: BENCHMARK_VALUES_3.low,
      saves: {
        fortitude: BENCHMARK_VALUES.low,
        reflex: BENCHMARK_VALUES.high,
        will: BENCHMARK_VALUES.moderate
      },
      strikeAttack: BENCHMARK_VALUES.high,
      strikeDamage: BENCHMARK_VALUES.high
    }
  },
  magicalStriker: {
    name: 'Magical Striker',
    description: 'Melee/magic hybrid — high strike attack, damage, and spell DC',
    benchmarks: {
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
        fortitude: BENCHMARK_VALUES.moderate,
        reflex: BENCHMARK_VALUES.moderate,
        will: BENCHMARK_VALUES.moderate
      },
      strikeAttack: BENCHMARK_VALUES.high,
      strikeDamage: BENCHMARK_VALUES.high,
      spellDC: BENCHMARK_VALUES.high,
      spellAttack: BENCHMARK_VALUES.high
    }
  },
  caster: {
    name: 'Caster',
    description: 'Extreme casting attribute, fragile in melee',
    benchmarks: {
      abilities: {
        str: BENCHMARK_VALUES_4.moderate,
        dex: BENCHMARK_VALUES_4.moderate,
        con: BENCHMARK_VALUES_4.moderate,
        int: BENCHMARK_VALUES_4.extreme,
        wis: BENCHMARK_VALUES_4.moderate,
        cha: BENCHMARK_VALUES_4.moderate
      },
      perception: BENCHMARK_VALUES.moderate,
      ac: BENCHMARK_VALUES_4.moderate,
      hp: BENCHMARK_VALUES_3.low,
      saves: {
        fortitude: BENCHMARK_VALUES.low,
        reflex: BENCHMARK_VALUES.moderate,
        will: BENCHMARK_VALUES.high
      },
      strikeAttack: BENCHMARK_VALUES.low,
      strikeDamage: BENCHMARK_VALUES.low,
      spellDC: BENCHMARK_VALUES.high,
      spellAttack: BENCHMARK_VALUES.high
    }
  },
  skillParagon: {
    name: 'Skill Paragon',
    description: 'Skill-focused NPC — defaults to high Cha/Will; adjust to match best skills',
    benchmarks: {
      abilities: {
        str: BENCHMARK_VALUES_4.moderate,
        dex: BENCHMARK_VALUES_4.moderate,
        con: BENCHMARK_VALUES_4.moderate,
        int: BENCHMARK_VALUES_4.moderate,
        wis: BENCHMARK_VALUES_4.moderate,
        cha: BENCHMARK_VALUES_4.high
      },
      perception: BENCHMARK_VALUES.moderate,
      ac: BENCHMARK_VALUES_4.moderate,
      hp: BENCHMARK_VALUES_3.moderate,
      saves: {
        fortitude: BENCHMARK_VALUES.low,
        reflex: BENCHMARK_VALUES.moderate,
        will: BENCHMARK_VALUES.high
      },
      strikeAttack: BENCHMARK_VALUES.moderate,
      strikeDamage: BENCHMARK_VALUES.moderate
    }
  }
};
