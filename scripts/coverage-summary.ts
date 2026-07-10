// Renders coverage/coverage-summary.json (vitest `json-summary` reporter) as a markdown
// table. CI appends the output to $GITHUB_STEP_SUMMARY; run `npm run test:coverage` first.
import { readFileSync } from 'node:fs';

interface Metric {
  total: number;
  covered: number;
  pct: number;
}
interface FileSummary {
  lines: Metric;
  branches: Metric;
  functions: Metric;
}

const summaryPath = new URL('../coverage/coverage-summary.json', import.meta.url);
let summary: Record<string, FileSummary>;
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} catch {
  console.error('coverage/coverage-summary.json not found — run `npm run test:coverage` first.');
  process.exit(1);
}

const cell = (m: Metric): string => `${m.pct}% (${m.covered}/${m.total})`;

const { total, ...files } = summary;
const rows = Object.entries(files)
  .filter(([, m]) => m.lines.total > 0)
  .map(([file, m]) => ({ file: file.replace(/^.*\/src\//, 'src/'), ...m }))
  .sort((a, b) => a.lines.pct - b.lines.pct);

console.log('### Unit test coverage (logic + editor)\n');
console.log('| File | Lines | Branches | Functions |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) {
  console.log(`| \`${r.file}\` | ${cell(r.lines)} | ${cell(r.branches)} | ${cell(r.functions)} |`);
}
console.log(`| **Total** | **${cell(total.lines)}** | **${cell(total.branches)}** | **${cell(total.functions)}** |`);
