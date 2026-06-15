import { MODULE_ID } from '@/constants';

/** Top-level Actor folder that holds creatures built by this module. */
export const CREATURE_FOLDER = 'Creature CRISPR';

/** Flag scope for creature data on actors and items. */
export const CREATURE_FLAG = MODULE_ID;

/** Flag key for the creature data object inside CREATURE_FLAG. */
export const CREATURE_DATA_KEY = 'creatureData';

/** PF2e system fallback portrait/token when no image is supplied. */
export const DEFAULT_NPC_IMAGE = 'systems/pf2e/icons/default-icons/npc.svg';

/** Flag key for benchmark data on melee/strike items. */
export const ITEM_BENCHMARK_KEY = 'itemBenchmarks';

/** Flag key for benchmark data on ability items. */
export const ABILITY_BENCHMARK_KEY = 'abilityBenchmarks';
