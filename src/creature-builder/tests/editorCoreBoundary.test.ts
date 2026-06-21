import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

// The editor core is Foundry-free: it talks to the host only through the kernel + the injected
// save-target/env contracts. This is the structural counterpart to the contracts — it fails the
// moment any in-scope file re-couples to Foundry, which the TS compiler can't catch (the app
// tsconfig pulls in foundry-pf2e's ambient types, so a stray `game.actors` compiles clean).
// Scope mirrors the plan: editor/ + the presentational component tree (sections/widgets/baseComponents).
// The shell (ui/components/*.svelte, dialogs/) and services/ are the host layer and are NOT in scope.

const CB_DIR = fileURLToPath(new URL('..', import.meta.url));
const SERVICES_DIR = join(CB_DIR, 'services');

const ROOTS = [
  join(CB_DIR, 'editor'),
  join(CB_DIR, 'ui', 'components', 'sections'),
  join(CB_DIR, 'ui', 'components', 'widgets'),
  join(CB_DIR, 'ui', 'components', 'baseComponents')
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (entry.name.endsWith('.svelte')) out.push(full);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The scannable code: a .svelte file's <script> block(s); a .ts file in full. */
function scriptOf(file: string, source: string): string {
  if (!file.endsWith('.svelte')) return source;
  const blocks: string[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks.join('\n');
}

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const stripStrings = (src: string): string =>
  src
    .replace(/`(?:\\.|[^`\\])*`/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ');

function importSpecifiers(code: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\b(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) specs.push(m[1]);
  }
  return specs;
}

// Access-form patterns (identifier followed by `.`/`?.`/`(`) — the realistic re-coupling vectors,
// chosen to stay clear of false positives on type names and CSS.
const FOUNDRY_GLOBALS: Array<[RegExp, string]> = [
  [/\bgame\s*[?.]/, 'game'],
  [/\bui\s*[?.]/, 'ui'],
  [/\bHooks\s*[?.]/, 'Hooks'],
  [/\bfoundry\s*[?.]/, 'foundry'],
  [/\bcanvas\s*[?.]/, 'canvas'],
  [/\bCONFIG\s*[?.]/, 'CONFIG'],
  [/\bCONST\s*[?.]/, 'CONST'],
  [/\bfromUuidSync\s*\(/, 'fromUuidSync'],
  [/\bfromUuid\s*\(/, 'fromUuid'],
  [/\bActor\s*[.(]/, 'Actor'],
  [/\bItem\s*[.(]/, 'Item'],
  [/\bFolder\s*[.(]/, 'Folder']
];

function isServicesImport(spec: string, fromFile: string): boolean {
  if (spec === '@/creature-builder/services' || spec.startsWith('@/creature-builder/services/')) return true;
  if (!spec.startsWith('.')) return false;
  const target = resolve(dirname(fromFile), spec);
  return target === SERVICES_DIR || target.startsWith(SERVICES_DIR + sep);
}

function isFoundryPackage(spec: string): boolean {
  return spec === 'foundry-pf2e' || spec.startsWith('foundry-pf2e/');
}

const files = ROOTS.flatMap(collectFiles);

describe('editor-core Foundry boundary', () => {
  it('finds editor-core files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('imports no services/* and no foundry-pf2e', () => {
    const violations: string[] = [];
    for (const file of files) {
      const code = stripComments(scriptOf(file, readFileSync(file, 'utf8')));
      const rel = relative(CB_DIR, file);
      for (const spec of importSpecifiers(code)) {
        if (isFoundryPackage(spec)) violations.push(`${rel}: imports '${spec}' — editor core must not import foundry-pf2e`);
        else if (isServicesImport(spec, file)) violations.push(`${rel}: imports '${spec}' — editor core must not import services/*`);
      }
    }
    expect(violations, `editor-core import violations:\n${violations.join('\n')}`).toEqual([]);
  });

  it('references no Foundry globals', () => {
    const violations: string[] = [];
    for (const file of files) {
      const code = stripStrings(stripComments(scriptOf(file, readFileSync(file, 'utf8'))));
      const rel = relative(CB_DIR, file);
      for (const [re, name] of FOUNDRY_GLOBALS) {
        if (re.test(code)) violations.push(`${rel}: references Foundry global '${name}' — must route through the injected env/save target`);
      }
    }
    expect(violations, `editor-core Foundry-global violations:\n${violations.join('\n')}`).toEqual([]);
  });
});
