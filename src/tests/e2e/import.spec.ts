import { test, expect, openBuilder, BUILDER_ID } from './fixtures/foundry-clients';
import { createSourceNpc, isImportedCreature, deleteActors } from './fixtures/creature-ui';

test.describe('Import', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('importing a world NPC moves it into the folder as a creature', async ({ gmPage }) => {
    const srcName = `__e2e_import_${Date.now()}`;
    const srcId = await createSourceNpc(gmPage, srcName, { level: 2 });
    trash.push(srcId); // import moves (not clones) this actor, so it's the only one to clean up

    await openBuilder(gmPage); // back to the list view
    const win = gmPage.locator(`#${BUILDER_ID}`);
    await win.locator('.list-header .btn-import').click();

    // ImportCreatureDialog → PickerDialog. It defaults to the Bestiary source (async); the World
    // Actors source is synchronous and self-contained, so drive that. The dialog re-runs its init
    // effect once when bestiary availability resolves, which can revert an early tab switch — so
    // retry the switch until the World Actors source sticks (placeholder flips to "Search actors...").
    const dialog = win.locator('.picker-dialog');
    await expect(dialog).toBeVisible();
    const worldTab = dialog.locator('.source-tab', { hasText: 'World Actors' });
    await expect(async () => {
      await worldTab.click();
      await expect(worldTab).toHaveClass(/active/, { timeout: 1000 });
      await expect(dialog.locator('.search-input')).toHaveAttribute('placeholder', 'Search actors...', { timeout: 1000 });
    }).toPass({ timeout: 15000 });

    await dialog.locator('.search-input').fill(srcName);
    await dialog.locator('.picker-item', { hasText: srcName }).click();
    await dialog.locator('.btn-primary', { hasText: 'Import' }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => isImportedCreature(gmPage, srcId)).toBe(true);
    await expect(win.locator('.creatures-table tbody tr', { hasText: srcName })).toBeVisible();
  });
});
