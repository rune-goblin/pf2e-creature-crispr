import { describe, it, expect } from 'vitest';
import { getDefaultBenchmarks, createDefaultStrike, createCreature } from '@/creature-builder/logic/models';

describe('creature factories', () => {
  it('getDefaultBenchmarks returns a full benchmark set', () => {
    const b = getDefaultBenchmarks();
    expect(b.abilities.str).toBeTypeOf('number');
    expect(b.saves.fortitude).toBeTypeOf('number');
    expect(Array.isArray(b.skills)).toBe(true);
    expect(b.ac).toBeTypeOf('number');
  });

  it('createDefaultStrike applies the given name and a default damage type', () => {
    const s = createDefaultStrike('Claw');
    expect(s.name).toBe('Claw');
    expect(s.damageType).toBe('slashing');
    expect(s.attackBenchmark).toBeTypeOf('number');
  });

  it('createCreature clamps level and seeds one default strike', () => {
    const c = createCreature('Goblin', 99);
    expect(c.name).toBe('Goblin');
    expect(c.level).toBe(24); // clamped to PF2e max
    expect(c.id).toContain('creature-');
    expect(c.size).toBe('medium');

    const low = createCreature('Rat', -5);
    expect(low.level).toBe(-1); // clamped to PF2e min
  });
});
