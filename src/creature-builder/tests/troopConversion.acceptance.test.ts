import { describe, it, expect } from 'vitest';
import { applyTroopConversion, troopAdjusted } from '@/creature-builder/logic/troop';
import { getDefaultBenchmarks } from '@/creature-builder/logic/models';
import { parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import type { EditableCreature } from '@/creature-builder/logic/editableCreature';
import type { CreatureStrike, SpecialAbility } from '@/creature-builder/logic/models';

// Acceptance fixtures for the default conversion engine, transcribed from the published numbers in
// docs/plans/troop-conversion-v2.md — NOT copied from any statblock JSON. Kernel-only imports so
// this runs under plain vitest (no Foundry, no editor store). Tolerances are the plan's: DC exact,
// damage-line averages ±2.

const fixture = (over: Partial<EditableCreature>): EditableCreature => ({
  name: 'Creature', level: 0, creatureType: 'humanoid', size: 'medium',
  traits: [], benchmarks: getDefaultBenchmarks(),
  speeds: { land: 25 }, languages: [], senses: [],
  strikes: [], specialAbilities: [], immunities: [], resistances: [], weaknesses: [],
  ...over
});

// The 2-action sweep line is glyph-numbered "2" followed by its @Damage macro; the "1 to 3" header
// glyph is never followed by @Damage, so this targets the damage line unambiguously.
const sweepLineAverage = (description: string, action: 1 | 2 | 3): number => {
  const match = new RegExp(`<span class="action-glyph">${action}</span>\\s*@Damage\\[\\(?([0-9d+\\- ]+?)\\)?\\[`).exec(description);
  if (!match) throw new Error(`no action-${action} damage line in: ${description}`);
  return parseDiceFormulaAverage(match[1].trim());
};

describe('default conversion — Orc-Scrapper-like (L0, d6 melee + range-30 ranged)', () => {
  const orc = (): EditableCreature => fixture({
    name: 'Orc Scrapper', traits: ['humanoid', 'orc'], speeds: { land: 25 }, languages: ['Orcish'],
    strikes: [
      { name: 'Knuckle Dagger', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 8, damage: '1d6+3', damageType: 'piercing' },
      { name: 'Javelin', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 8, damage: '1d6', damageType: 'piercing', isRanged: true, range: 30 }
    ]
  });

  it('bumps to level 5', () => {
    const c = orc();
    applyTroopConversion(c);
    expect(c.level).toBe(5);
  });

  it('sizes the formation to gargantuan', () => {
    const c = orc();
    applyTroopConversion(c);
    expect(c.troopSize).toBe('gargantuan');
    expect(c.size).toBe('gargantuan');
  });

  it('suffixes the name with " Troop"', () => {
    const c = orc();
    applyTroopConversion(c);
    expect(c.name).toBe('Orc Scrapper Troop');
  });

  it('clears all strikes (published troops carry zero strike items)', () => {
    const c = orc();
    applyTroopConversion(c);
    expect(c.strikes).toEqual([]);
  });

  it('emits the sweep with a basic Reflex save at DC 19 (spellDC.moderate for level 5)', () => {
    const c = orc();
    applyTroopConversion(c);
    const sweep = c.specialAbilities.find((a) => a.name === 'Knuckle Dagger Flurry');
    expect(sweep).toBeDefined();
    expect(sweep!.description).toContain('@Check[reflex|dc:19|basic|options:area-effect]');
    expect(sweep!.description).toContain('@Template[type:emanation|distance:5]');
    expect(sweep!.description).toContain('options:area-damage');
    expect(sweep!.scalableValues?.find((s) => s.type === 'dc')?.originalValue).toBe('19');
  });

  it('lands the sweep 2-action line within ±2 of 12 (published Orc Raiding Party 2d6+5)', () => {
    const c = orc();
    applyTroopConversion(c);
    const sweep = c.specialAbilities.find((a) => a.name === 'Knuckle Dagger Flurry')!;
    expect(Math.abs(sweepLineAverage(sweep.description, 2) - 12)).toBeLessThanOrEqual(2);
  });

  it('emits the ranged volley as a burst-10 within 30 feet', () => {
    const c = orc();
    applyTroopConversion(c);
    const volley = c.specialAbilities.find((a) => a.name === 'Javelin Volley');
    expect(volley).toBeDefined();
    expect(volley!.description).toContain('@Template[type:burst|distance:10]');
    expect(volley!.description).toContain('within 30 feet');
  });

  it('seeds the standard kit (Troop Defenses + Troop Movement)', () => {
    const c = orc();
    applyTroopConversion(c);
    expect(c.specialAbilities.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Troop Defenses', 'Troop Movement'])
    );
  });

  // The conversion stamps these itself — no save step — so they can't be lost to a save target
  // that forgets `troopAdjusted`.
  it('stamps the troop trait and 5/5 area/splash weaknesses during conversion', () => {
    const c = orc();
    applyTroopConversion(c);
    expect(c.traits).toContain('troop');
    expect(c.weaknesses).toEqual(
      expect.arrayContaining([
        { type: 'area-damage', value: 5 },
        { type: 'splash-damage', value: 5 }
      ])
    );
  });

  it('re-asserting at save time changes nothing already stamped', () => {
    const c = orc();
    applyTroopConversion(c);
    const adjusted = troopAdjusted({ isTroop: c.isTroop, level: c.level, traits: c.traits, weaknesses: c.weaknesses });
    expect(adjusted.traits).toEqual(c.traits);
    expect(adjusted.weaknesses).toEqual(c.weaknesses);
  });

  it('does not duplicate weaknesses when converted twice', () => {
    const c = orc();
    applyTroopConversion(c);
    applyTroopConversion(c);
    const troopTypes = c.weaknesses.filter((w) => w.type === 'area-damage' || w.type === 'splash-damage');
    expect(troopTypes).toHaveLength(2);
    expect(c.traits.filter((t) => t === 'troop')).toHaveLength(1);
  });

  it("keeps Form Up's divergent half-splash instead of the standard value", () => {
    const c = orc();
    applyTroopConversion(c, {}, { formUp: true });
    expect(c.weaknesses).toEqual(
      expect.arrayContaining([
        { type: 'area-damage', value: 5 },
        { type: 'splash-damage', value: 2 }
      ])
    );
  });

  it('never replaces an authored weakness with the standard value', () => {
    const c = orc();
    c.weaknesses = [{ type: 'splash-damage', value: 99 }];
    applyTroopConversion(c);

    const splash = c.weaknesses.filter((w) => w.type === 'splash-damage');
    expect(splash).toHaveLength(1);
    // The level bump rescales the authored value (99 → 200) — that's `rescaleCreatureIwr` doing its
    // job. What this pins is that the seeder left it alone rather than stamping the table's 5.
    expect(splash[0].value).toBeGreaterThan(5);
    expect(c.weaknesses).toContainEqual({ type: 'area-damage', value: 5 });
  });
});

describe('default conversion — Wolf-like (melee only)', () => {
  const wolf = (): EditableCreature => fixture({
    name: 'Wolf', level: 1, creatureType: 'animal', traits: ['animal'], speeds: { land: 35 },
    strikes: [{ name: 'Jaws', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 9, damage: '1d6+2', damageType: 'piercing' }],
    specialAbilities: [{ id: 'pack', name: 'Pack Attack', description: '<p>Deals extra damage against flanked foes.</p>', actionType: 'passive' }]
  });

  it('generates the sweep but no volley when there is no ranged strike', () => {
    const c = wolf();
    applyTroopConversion(c);
    expect(c.specialAbilities.find((a) => a.name === 'Jaws Flurry')).toBeDefined();
    expect(c.specialAbilities.some((a) => /Volley/.test(a.name))).toBe(false);
  });

  it('passes existing special abilities through untouched', () => {
    const c = wolf();
    const original: SpecialAbility = structuredClone(c.specialAbilities[0]);
    applyTroopConversion(c);
    expect(c.specialAbilities.find((a) => a.name === 'Pack Attack')).toEqual(original);
  });
});

describe('idempotence', () => {
  const strike: CreatureStrike = {
    name: 'Fist', attackBenchmark: 0.5, damageBenchmark: 0.5, attackBonus: 8, damage: '1d6+3', damageType: 'bludgeoning'
  };

  it('converting an already-converted troop a second time changes nothing', () => {
    const c = fixture({ name: 'Brawler', traits: ['humanoid'], strikes: [strike] });
    applyTroopConversion(c);
    const once = structuredClone(c);
    applyTroopConversion(c);
    expect(c).toEqual(once);
  });
});
