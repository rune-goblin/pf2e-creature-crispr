import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// The svelte plugin compiles `.svelte.ts` runes modules (e.g. the editor store) so they
// can be unit-tested headlessly; `conditions: ['browser']` makes svelte resolve to its
// client (runes) runtime even though Vitest runs in Node.
export default defineConfig({
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.ts', import.meta.url)) })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    ...(process.env.VITEST ? { conditions: ['browser'] } : {})
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    coverage: {
      // Only the layers the unit suite owns: the pure kernel and the editor store.
      // services/ and ui/ are Foundry-facing and covered by the Playwright e2e suite —
      // including them here would dilute the number with files vitest can never reach.
      include: ['src/creature-builder/logic/**', 'src/creature-builder/editor/**'],
      reporter: ['text', 'json-summary']
    }
  }
});
