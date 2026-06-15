import { test, expect, openBuilder, BUILDER_ID } from './fixtures/foundry-clients';
import { createCreatureViaUi, readCreature, deleteActors, type SavedCreature } from './fixtures/creature-ui';

test.describe('Edit → rescale', () => {
  const trash: string[] = [];
  let baseline: SavedCreature;

  test.beforeEach(async ({ gmPage }) => {
    baseline = await createCreatureViaUi(gmPage, { name: `__e2e_edit_${Date.now()}`, level: 3 });
    trash.push(baseline.id);
  });

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('bumping an existing creature\'s level rescales HP and AC', async ({ gmPage }) => {
    await openBuilder(gmPage);
    const win = gmPage.locator(`#${BUILDER_ID}`);

    await win.locator('.creatures-table tbody tr', { hasText: baseline.name })
      .locator('[aria-label="Edit creature"]').click();
    await expect(win.locator('.editor-header .header-title')).toHaveText(/Edit/);

    // Basic Info is collapsed in edit mode; its summary header carries the level control.
    await win.locator('[aria-label="Increase level"]').first().click();
    await win.locator('.editor-header .btn-primary').click();
    await expect(win.locator('.creatures-table')).toBeVisible();

    const rescaled = await readCreature(gmPage, baseline.name);
    expect(rescaled?.level).toBe(4);
    expect(rescaled!.hp).toBeGreaterThan(baseline.hp);
    expect(rescaled!.ac).toBeGreaterThanOrEqual(baseline.ac);
  });
});
