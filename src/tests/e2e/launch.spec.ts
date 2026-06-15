import { test, expect, openBuilder, BUILDER_ID } from './fixtures/foundry-clients';

test.describe('Builder launches', () => {
  test('the public API opens the workspace with the Creatures list', async ({ gmPage }) => {
    await openBuilder(gmPage);

    const win = gmPage.locator(`#${BUILDER_ID}`);
    await expect(win).toBeVisible();
    await expect(win.locator('.list-header h2')).toHaveText(/Creatures/);
    await expect(win.locator('.list-header .btn-create')).toBeVisible();
  });
});
