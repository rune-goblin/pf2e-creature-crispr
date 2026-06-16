import { test, expect, openBuilder, BUILDER_ID } from './fixtures/foundry-clients';
import { createCreatureViaUi, deleteActors } from './fixtures/creature-ui';

test.describe('Delete', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('deleting a creature via the UI removes it from the world and the list', async ({ gmPage }) => {
    const name = `__e2e_delete_${Date.now()}`;
    const created = await createCreatureViaUi(gmPage, { name, level: 2 });
    trash.push(created.id); // safety net if the assertions below fail before deletion

    await openBuilder(gmPage); // back to the list view
    const win = gmPage.locator(`#${BUILDER_ID}`);
    const row = win.locator('.creatures-table tbody tr', { hasText: name });
    await expect(row).toBeVisible();

    await row.locator('[aria-label="Delete creature"]').click();
    await win.locator('.dialog-backdrop .dialog-button-primary', { hasText: 'Delete' }).click();

    await expect
      .poll(() => gmPage.evaluate((id) => !!(window as any).game.actors.get(id), created.id))
      .toBe(false);
    await expect(win.locator('.creatures-table tbody tr', { hasText: name })).toHaveCount(0);
  });
});
