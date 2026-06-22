import type { CreatureSize } from './models';

/**
 * The editor works in PF2e's long size names ('medium', 'large', …); the actor stores the system's
 * abbreviated slugs ('med', 'lg', …). Map at the actor boundary so the editor stays in one vocabulary.
 */
export const CREATURE_SIZES: { value: CreatureSize; label: string }[] = [
  { value: 'tiny', label: 'Tiny' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'huge', label: 'Huge' },
  { value: 'gargantuan', label: 'Gargantuan' }
];

const TO_PF2E: Record<string, string> = {
  tiny: 'tiny',
  small: 'sm',
  medium: 'med',
  large: 'lg',
  huge: 'huge',
  gargantuan: 'grg'
};

const FROM_PF2E: Record<string, string> = Object.fromEntries(
  Object.entries(TO_PF2E).map(([long, short]) => [short, long])
);

/** Long editor name → PF2e slug. Passes through anything already abbreviated. */
export function sizeToPf2e(size: string): string {
  return TO_PF2E[size] ?? size;
}

/** PF2e slug → long editor name. Passes through anything already long. */
export function pf2eToSize(slug: string): string {
  return FROM_PF2E[slug] ?? slug;
}
