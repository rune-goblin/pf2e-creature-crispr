import { describe, it, expect } from 'vitest';
import { buildActorSystemFromStats } from '@/creature-builder/services/crud';
import { calculateCreatureStats } from '@/creature-builder/config/creatureStatTables';
import { getDefaultBenchmarks } from '@/creature-builder/models';

describe('buildActorSystemFromStats', () => {
  const sys = buildActorSystemFromStats(calculateCreatureStats(5, getDefaultBenchmarks())) as any;
  const stats = calculateCreatureStats(5, getDefaultBenchmarks());

  it('maps abilities, AC, HP and saves to the PF2e NPC system shape', () => {
    expect(sys.abilities.str.mod).toBe(stats.str);
    expect(sys.abilities.cha.mod).toBe(stats.cha);
    expect(sys.attributes.ac.value).toBe(stats.ac);
    expect(sys.attributes.hp.value).toBe(stats.hp);
    expect(sys.attributes.hp.max).toBe(stats.hp);
    expect(sys.saves.fortitude.value).toBe(stats.fortitude);
    expect(sys.saves.will.value).toBe(stats.will);
  });

  // Regression guard for the M2 unification: perception lives at system.perception.mod
  // (the modern NPC path), NOT the legacy system.attributes.perception.value the old
  // sync path wrote — so it actually updates on rescale.
  it('puts perception at system.perception.mod, not under attributes', () => {
    expect(sys.perception.mod).toBe(stats.perception);
    expect(sys.attributes.perception).toBeUndefined();
  });
});
