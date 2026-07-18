import { test, expect, openBuilder, BUILDER_ID } from './fixtures/foundry-clients';
import { createCreatureViaUi, readCreature, readCreatureMeta, deleteActors } from './fixtures/creature-ui';

test.describe('Duplicate', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('duplicating a creature creates an independent "(Copy)" in the folder', async ({ gmPage }) => {
    const name = `__e2e_dup_${Date.now()}`;
    const original = await createCreatureViaUi(gmPage, { name, level: 3, template: 'brute' });
    trash.push(original.id);

    await openBuilder(gmPage); // back to the list view
    const win = gmPage.locator(`#${BUILDER_ID}`);
    await win.locator('.creatures-table tbody tr', { hasText: name }).locator('.ram-trigger').click();
    const menu = gmPage.locator('.ram-menu'); // portals out of the window, so page-level
    await menu.getByText('Duplicate', { exact: true }).click();

    // duplicateCreature() makes "<name> (Copy)" then opens it in the editor (edit mode).
    await expect(win.locator('.editor-header .header-title')).toHaveText(/Edit/);

    const copyName = `${name} (Copy)`;
    await expect.poll(() => readCreature(gmPage, copyName)).not.toBeNull();
    const copy = await readCreature(gmPage, copyName);
    trash.push(copy!.id);

    expect(copy!.id).not.toBe(original.id); // a distinct actor, not the same one
    expect(copy!.level).toBe(original.level); // a clone, not a rescale
    const meta = await readCreatureMeta(gmPage, copy!.id);
    expect(meta?.type).toBe('npc');
    expect(meta?.hasFlag, 'copy carries the creatureData flag').toBe(true);
  });
});
