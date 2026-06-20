import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { parseAbilityDescription } from '@/creature-builder/logic/abilityScaling';

// The PF2e bestiary JSON sources, reached via the repo's `_pf2e-source` reference symlink (created by
// `npm run setup`). Absent on fresh clones / CI — the suite skips itself there rather than fail.
const CORPUS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../_pf2e-source/packs');
const AVAILABLE = existsSync(CORPUS_ROOT);

const GT_DAMAGE = /@Damage\[(?:[^\[\]]|\[[^\]]*\])*\]/g;
const GT_CHECK = /@Check\[[^\]]+\]/gi;
// Macros containing these are level-derived and rescale themselves in Foundry — not capturing them is correct.
const DMG_SELF_SCALING = /@|floor\(|ceil\(|round\(|max\(|min\(|abs\(|resolve\(/i;

function collectAbilityDescriptions(): string[] {
  const out: string[] = [];
  const files = readdirSync(CORPUS_ROOT, { recursive: true }) as string[];
  for (const rel of files) {
    // Scope to PF2e content; the sf2e (Starfinder) packs use different conventions.
    if (!rel.endsWith('.json') || rel.split(/[\\/]/).includes('sf2e')) continue;
    let doc: any;
    try { doc = JSON.parse(readFileSync(join(CORPUS_ROOT, rel), 'utf8')); } catch { continue; }
    const items: any[] = doc?.type === 'npc' || doc?.type === 'character'
      ? doc.items ?? []
      : doc?.system?.description?.value ? [doc] : [];
    for (const it of items) {
      const isAbility = it.type === 'action' || (it.type === 'feat' && it.system?.category === 'creature');
      const desc = it.system?.description?.value;
      if (isAbility && desc) out.push(desc);
    }
  }
  return out;
}

describe.skipIf(!AVAILABLE)('ability scaling coverage against the real PF2e bestiary corpus', () => {
  it('captures ~all @Damage / @Check macros that carry a scalable value', () => {
    const descriptions = collectAbilityDescriptions();

    let dTotal = 0, dCap = 0, dSelf = 0;
    let cTotal = 0;
    const dGaps: string[] = [];
    const cGaps: string[] = [];

    for (const desc of descriptions) {
      const { template } = parseAbilityDescription(desc, 15);
      for (const m of desc.matchAll(GT_DAMAGE)) {
        dTotal++;
        if (!template.includes(m[0])) dCap++;
        else if (DMG_SELF_SCALING.test(m[0].slice('@Damage['.length, -1))) dSelf++;
        else if (dGaps.length < 30) dGaps.push(m[0]);
      }
      for (const m of desc.matchAll(GT_CHECK)) {
        cTotal++;
        if (!template.includes(m[0])) continue; // captured (DC swapped for a placeholder)
        const segs = m[0].slice('@Check['.length, -1).split('|').map(s => s.trim());
        const scalable = segs[0].toLowerCase() !== 'flat' && segs.some(s => /^dc:\d+$/.test(s) && Number(s.slice(3)) > 0);
        if (scalable && cGaps.length < 30) cGaps.push(m[0]);
      }
    }

    // A macro is a "true gap" only if it carries a scalable value yet wasn't captured — i.e. excluding
    // the self-scaling @actor/expression forms, which we intentionally leave for Foundry to scale.
    const dScalable = dTotal - dSelf;
    const dGapCount = dScalable - dCap;

    // Sanity: we actually scanned a large real corpus.
    expect(dTotal).toBeGreaterThan(3000);
    expect(cTotal).toBeGreaterThan(3000);

    // @Damage: essentially every scalable macro is captured. The only known holdouts are the rare
    // `(N*NdM)` literal-multiplication forms (a handful in the whole corpus).
    expect(dCap / dScalable).toBeGreaterThan(0.999);
    expect(dGapCount, `uncaptured scalable @Damage macros: ${dGaps.join(' , ')}`).toBeLessThanOrEqual(5);

    // @Check: any macro carrying a literal dc:N>0 must be captured — no true gaps.
    expect(cGaps, `@Check macros with a scalable DC that were NOT captured: ${cGaps.join(' , ')}`).toHaveLength(0);
  }, 120000);
});
