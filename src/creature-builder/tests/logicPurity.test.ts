import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

// Kernel purity is enforced by two complementary mechanisms, each catching what the other can't:
//   1. No Foundry (game/Actor/foundry.*/…) — enforced by the COMPILER via tsconfig.logic.json.
//      It type-checks logic/ with types:[] (foundry-pf2e stripped), so any ambient Foundry
//      reference becomes a "Cannot find name" error. Run in `npm run check`. That's the robust
//      home for it — a textual scan for ambient globals would just be a fragile denylist.
//   2. No import escapes logic/ — enforced HERE. The compiler is blind to this: an escaping
//      import into Foundry-typed app code re-injects the globals and compiles clean. But the
//      vendored copy of logic/ (in pf2e-reignmaker) would have nothing to resolve such an import
//      against, so it must be caught structurally.
// See docs/plans/crispr-logic-vendoring.md (pf2e-reignmaker), Phase 2.

const LOGIC_DIR = fileURLToPath(new URL('../logic', import.meta.url));

function collectKernelFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectKernelFiles(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

function importSpecifiers(code: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import/export ... from '...'
    /\bimport\s+['"]([^'"]+)['"]/g,                           // import '...'  (side-effect)
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g                  // import('...') (dynamic)
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) specs.push(m[1]);
  }
  return specs;
}

const kernelFiles = collectKernelFiles(LOGIC_DIR);

describe('creature-builder/logic import boundary', () => {
  it('finds kernel files to scan', () => {
    expect(kernelFiles.length).toBeGreaterThan(0);
  });

  it('imports never leave logic/ (no external packages, app code, or aliases)', () => {
    const violations: string[] = [];
    for (const file of kernelFiles) {
      const code = stripComments(readFileSync(file, 'utf8'));
      const rel = relative(LOGIC_DIR, file);
      for (const spec of importSpecifiers(code)) {
        if (!spec.startsWith('.')) {
          violations.push(`${rel}: bare import '${spec}' — kernel must have no external deps`);
          continue;
        }
        const target = resolve(dirname(file), spec);
        if (target !== LOGIC_DIR && !target.startsWith(LOGIC_DIR + sep)) {
          violations.push(`${rel}: import '${spec}' escapes logic/`);
        }
      }
    }
    expect(violations, `kernel import violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
