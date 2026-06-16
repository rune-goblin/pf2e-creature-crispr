import { test as base, type Page, type BrowserContext } from '@playwright/test';

declare global {
  // Foundry's runtime globals on `window`. Declared `any` — specs reach into them loosely
  // and the foundry-pf2e typings aren't on the e2e tsconfig's `types`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-var
  var game: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-var
  var ui: any;
}

export const MODULE_ID = 'pf2e-creature-crispr';

/** Drive Foundry's /join screen to log this context in as a specific user. */
export async function joinAs(page: Page, userId: string, password = ''): Promise<void> {
  await page.goto('/join');
  await page.selectOption('select[name="userid"]', userId);
  if (password) await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(/\/game\b/, { timeout: 30_000 }),
    page.click('button[name="join"]'),
  ]);
  await waitForGameReady(page);
}

/** Join as the world's first GM (role ≥ 4). The test worlds use password-less users. */
export async function joinAsFirstGm(page: Page): Promise<void> {
  await page.goto('/join');
  await page.waitForLoadState('networkidle');
  const state = await page.evaluate(() => {
    const g = (window as any).game;
    return {
      view: g?.view ?? null,
      world: g?.world?.id ?? null,
      gmId: (Array.from(g?.users?.values?.() ?? []) as any[]).find((u) => u.role >= 4)?.id ?? null,
    };
  });
  // No active world → Foundry bounced us to /setup. The usual cause is a world that needs
  // migration (older core/system than the running build); --world won't auto-launch those.
  if (state.view !== 'join' || !state.world) {
    throw new Error(
      `No active world at this port (Foundry view: "${state.view}"). The requested world likely needs ` +
        `migration — launch it once in your desktop Foundry to migrate it to the current build, then re-run. ` +
        `Or set TEST_WORLD to a world already on the current core/system version.`,
    );
  }
  if (!state.gmId) throw new Error(`World "${state.world}" has no password-less GM user (role ≥ 4) on /join`);
  await joinAs(page, state.gmId);
}

/** Wait for `game.ready === true`. */
export async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).game?.ready === true, undefined, { timeout: 30_000 });
}

/**
 * Wait for the module's public API to be live: `game.modules.get(MODULE_ID).api.open`, set in
 * the `ready` hook (src/index.ts). Vite-built bundles resolve fast, but give it headroom.
 */
export async function waitForCrisprReady(page: Page): Promise<void> {
  await page.waitForFunction(
    (id) => !!(window as any).game?.modules?.get(id)?.api?.open,
    MODULE_ID,
    { timeout: 60_000 },
  );
}

/** Stable element/instance id of the builder ApplicationV2 (CreatureCrisprApp DEFAULT_OPTIONS.id). */
export const BUILDER_ID = `${MODULE_ID}-builder`;

/**
 * Open the builder via the public API and wait for the workspace to render. Closes any prior
 * instance first — `gmPage` is worker-scoped, so a window left open by an earlier test would
 * otherwise linger (and duplicate the fixed element id).
 */
export async function openBuilder(page: Page): Promise<void> {
  await page.evaluate(async (appId) => {
    const existing = (window as any).foundry?.applications?.instances?.get?.(appId);
    if (existing) await existing.close();
    const id = appId.replace(/-builder$/, '');
    (window as any).game.modules.get(id).api.open();
  }, BUILDER_ID);
  const win = page.locator(`#${BUILDER_ID}`);
  await win.locator('.creature-workspace').waitFor({ state: 'visible' });
  // editorStore is a module-level singleton, and reopening the window doesn't reset it — a prior
  // spec (e.g. duplicate, which opens the copy in the editor) can leave it active. Cancel back to
  // the list so every caller starts from a known state.
  if (await win.locator('.editor-header').count()) {
    await win.locator('.editor-header .btn-secondary', { hasText: 'Cancel' }).click();
    await win.locator('.creature-list-view').waitFor({ state: 'visible' });
  }
}

type WorkerFixtures = {
  gmContext: BrowserContext;
  gmPage: Page;
};

/**
 * `gmPage` — a worker-scoped context logged into the test world as the first GM, with the
 * module's API ready. Worker scope means one login for the whole suite (workers: 1); per-test
 * isolation comes from each spec creating throwaway `__e2e_`-named actors and deleting them in
 * afterEach, not from tearing down the browser.
 */
export const test = base.extend<object, WorkerFixtures>({
  gmContext: [
    async ({ browser }, use) => {
      const ctx = await browser.newContext();
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],
  gmPage: [
    async ({ gmContext }, use) => {
      const page = await gmContext.newPage();
      await joinAsFirstGm(page);
      await waitForCrisprReady(page);
      // Foundry's permanent warning toast overlays the app's top bar and intercepts clicks on
      // Create New / Save. Each `.notification` sets `pointer-events: all`, so neutering the
      // container isn't enough — hide the stack outright. Notifications are informational in tests.
      await page.addStyleTag({ content: '#notifications { display: none !important; }' });
      await use(page);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';
