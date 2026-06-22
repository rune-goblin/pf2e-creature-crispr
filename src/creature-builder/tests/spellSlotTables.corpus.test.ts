import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { deduceSpellProgression, getSpellSlots } from '@/creature-builder/logic/spellSlotTables';

// The PF2e bestiary JSON sources, reached via the repo's `_pf2e-source` reference symlink (created by
// `npm run setup`). Absent on fresh clones / CI — the suite skips itself there rather than fail.
const CORPUS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../_pf2e-source/packs');
const AVAILABLE = existsSync(CORPUS_ROOT);

interface CasterEntry {
  name: string;
  level: number;
  castingType: string;
  slotsByRank: Record<number, number>;
  highestRank: number;
  rankCount: number;
}

function collectSpellcasters(): CasterEntry[] {
  const out: CasterEntry[] = [];
  const files = readdirSync(CORPUS_ROOT, { recursive: true }) as string[];
  for (const rel of files) {
    // sf2e (Starfinder) packs use different spellcasting conventions.
    if (!rel.endsWith('.json') || rel.split(/[\\/]/).includes('sf2e')) continue;
    let doc: any;
    try { doc = JSON.parse(readFileSync(join(CORPUS_ROOT, rel), 'utf8')); } catch { continue; }
    if (doc?.type !== 'npc') continue;
    const level = doc.system?.details?.level?.value ?? 1;
    for (const item of doc.items ?? []) {
      if (item.type !== 'spellcastingEntry') continue;
      const prepared = item.system?.prepared?.value;
      if (prepared === 'innate' || prepared === 'focus') continue;
      const slotsByRank: Record<number, number> = {};
      let highestRank = 0;
      for (let rank = 1; rank <= 10; rank++) {
        const max = item.system?.slots?.[`slot${rank}`]?.max ?? 0;
        if (max > 0) { slotsByRank[rank] = max; highestRank = rank; }
      }
      if (highestRank === 0) continue;
      out.push({ name: doc.name, level, castingType: prepared || 'prepared', slotsByRank, highestRank, rankCount: Object.keys(slotsByRank).length });
    }
  }
  return out;
}

describe.skipIf(!AVAILABLE)('spell progression deduction against the real PF2e bestiary corpus', () => {
  it('never misclassifies a clearly-full caster, and rescaling rarely strips an existing rank', () => {
    const casters = collectSpellcasters();

    // Sanity: we actually scanned a large real corpus.
    expect(casters.length).toBeGreaterThan(500);

    const misclassified: string[] = [];
    const underProvisioned: string[] = [];

    for (const c of casters) {
      const prog = deduceSpellProgression(c.castingType, c.slotsByRank, c.level);

      // A caster with ≥3 active slot ranks is unambiguously a full caster; it must deduce to the
      // full progression matching its casting type — never bounded, never the wrong polarity.
      if (c.rankCount >= 3) {
        const want = c.castingType === 'spontaneous' ? 'fullSpontaneous' : 'fullPrepared';
        if (prog !== want && misclassified.length < 20) {
          misclassified.push(`${c.name} L${c.level} ${c.castingType} ${JSON.stringify(c.slotsByRank)} -> ${prog}`);
        }
      }

      // Regenerating the deduced progression at the creature's own level should not drop a rank the
      // creature already has. NPCs occasionally carry a rank above the PC table (bosses, sub-L1
      // outliers), so this is a near-invariant, not absolute — see the ratio bound below.
      const regen = getSpellSlots(prog, c.level);
      if (regen) {
        const regenHighest = Math.max(0, ...Object.keys(regen).map(Number).filter(r => r > 0 && regen[r] > 0));
        if (regenHighest < c.highestRank && underProvisioned.length < 20) {
          underProvisioned.push(`${c.name} L${c.level} ${c.castingType} real=${c.highestRank} regen=${regenHighest} ${prog}`);
        }
      }
    }

    // Hard invariant: zero full-caster misclassifications across the whole corpus.
    expect(misclassified, `misclassified full casters: ${misclassified.join(' | ')}`).toHaveLength(0);

    // Near-invariant: under-provisioning stays in the low single-digit percent (measured ~1.7%).
    const underCount = casters.filter(c => {
      const regen = getSpellSlots(deduceSpellProgression(c.castingType, c.slotsByRank, c.level), c.level);
      if (!regen) return false;
      const regenHighest = Math.max(0, ...Object.keys(regen).map(Number).filter(r => r > 0 && regen[r] > 0));
      return regenHighest < c.highestRank;
    }).length;
    expect(underCount / casters.length, `under-provisioned (sample): ${underProvisioned.join(' | ')}`).toBeLessThan(0.05);
  }, 120000);
});
