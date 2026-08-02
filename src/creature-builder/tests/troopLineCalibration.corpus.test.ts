import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { getStatRangesForLevel } from '@/creature-builder/logic/creatureStatTables';
import { troopLineFactor, type TroopAttackLine } from '@/creature-builder/logic/troopBenchmarks';
import { parseAbilityDescriptionWithReport, parseDiceFormulaAverage } from '@/creature-builder/logic/abilityScaling';
import type { ScalableValue } from '@/creature-builder/logic/models';

// The PF2e bestiary sources, via the repo's `_pf2e-source` reference symlink (`npm run setup`).
// Absent on fresh clones / CI — the suite skips itself there rather than fail.
const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../_pf2e-source/packs');
const AVAILABLE = existsSync(CORPUS);

interface Sample {
  line: TroopAttackLine;
  /** The line as this kernel reads it: every plain-damage term of the element, summed. */
  sum: number;
  /** The line as the leading term alone — the reading this calibration rejects. */
  first: number;
  high: number;
  split: boolean;
}

function corpusSamples(): Sample[] {
  const out: Sample[] = [];
  for (const rel of readdirSync(CORPUS, { recursive: true }) as string[]) {
    if (!rel.endsWith('.json') || rel.split(/[\\/]/).includes('sf2e')) continue;
    let doc: any;
    try { doc = JSON.parse(readFileSync(join(CORPUS, rel), 'utf8')); } catch { continue; }
    if (doc?.type !== 'npc' || !(doc.system?.traits?.value ?? []).includes('troop')) continue;
    const level = doc.system?.details?.level?.value;
    if (typeof level !== 'number') continue;
    const high = getStatRangesForLevel(level).strikeDamage.high.average;

    for (const item of doc.items ?? []) {
      if (item.type !== 'action') continue;
      const desc: string = item.system?.description?.value ?? '';

      // Both readings come from one walk so they line up term for term: `sum` is the whole element
      // (what the kernel now calls the line), `first` is its leading term (what it used to).
      const { scalableValues, inlines } = parseAbilityDescriptionWithReport(desc, level);
      for (const inline of inlines) {
        if (inline.kind !== 'damage' || inline.disposition !== 'scaled') continue;
        const plain = inline.values.map((i) => scalableValues[i]).filter((v: ScalableValue) => v?.type === 'damage');
        const line = plain.find((v) => v.troopLine !== undefined)?.troopLine;
        if (line === undefined) continue;
        const averages = plain.map((v) => parseDiceFormulaAverage(v.originalValue));
        const sum = averages.reduce((a, b) => a + b, 0);
        if (sum <= 0 || averages[0] <= 0) continue;
        out.push({ line, sum, first: averages[0], high, split: plain.length > 1 });
      }
    }
  }
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const LINES: TroopAttackLine[] = [1, 2, 3, 'salvo'];

describe.skipIf(!AVAILABLE)('troop line factors against the published corpus', () => {
  const samples = corpusSamples();

  it('has enough published lines to calibrate against', () => {
    expect(samples.length).toBeGreaterThan(400);
    expect(samples.filter((s) => s.split).length).toBeGreaterThan(40);
  });

  it.each(LINES)('line %s sits where troopLineFactor puts it', (line) => {
    const group = samples.filter((s) => s.line === line);
    expect(group.length).toBeGreaterThan(20);
    expect(median(group.map((s) => s.sum / s.high))).toBeCloseTo(troopLineFactor(line), 1);
  });

  // The discriminating measurement: on a line split across damage types, reading only the leading
  // term understates it by 30-45%. Summing the terms is what lands on the published curve.
  it.each(LINES)('line %s reads truer summed than from its leading term', (line) => {
    const split = samples.filter((s) => s.line === line && s.split);
    if (split.length < 3) return;
    const factor = troopLineFactor(line);
    const summed = Math.abs(median(split.map((s) => s.sum / s.high)) - factor);
    const leading = Math.abs(median(split.map((s) => s.first / s.high)) - factor);
    expect(summed).toBeLessThan(leading);
  });

  it('puts split sweep lines on the same targets as unsplit ones', () => {
    for (const line of [2, 3] as const) {
      const split = samples.filter((s) => s.line === line && s.split);
      expect(median(split.map((s) => s.sum / s.high)), `line ${line}`).toBeCloseTo(troopLineFactor(line), 1);
    }
  });
});
