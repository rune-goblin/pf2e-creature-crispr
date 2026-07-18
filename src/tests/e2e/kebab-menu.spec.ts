import { test, expect, MODULE_ID, openBuilder } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

// Regression: the row actions menu is rendered inside an `overflow:auto` table. Rendering it in
// place let the container clip it and the focus()-on-open scrolled the container, firing the
// scroll-close handler the same frame it opened. It must portal out and stay visible.
test('row kebab menu opens with all actions and closes on outside click', async ({ gmPage: page }) => {
  const id = await page.evaluate(async (mod) => {
    const actor = await (window as any).Actor.create({
      name: '__e2e_kebab',
      type: 'npc',
      system: { details: { level: { value: 1 } }, attributes: { ac: { value: 15 }, hp: { value: 8, max: 8 } } },
      flags: { [mod]: { creatureData: { benchmarks: {}, baseLevel: 1, baseStats: {}, createdAt: 0, updatedAt: 0 } } },
    });
    return actor.id as string;
  }, MODULE_ID);

  try {
    await openBuilder(page);
    const win = page.locator(`#${MODULE_ID}-builder`);
    const trigger = win.locator('.ram-trigger').first();
    await expect(trigger).toBeVisible();

    await trigger.click();

    const menu = page.locator('.ram-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.ram-item')).toHaveText([
      'Duplicate',
      'Open actor sheet',
      'Reveal in sidebar',
      'Move to CRISPR folder',
      'Remove from CRISPR',
      'Delete actor',
    ]);
    await expect(menu.getByText('Remove from CRISPR')).toBeVisible();
    await expect(menu.getByText('Move to CRISPR folder')).toBeVisible();
    await expect(menu.getByText('Reveal in sidebar')).toBeVisible();

    await win.locator('.list-header h2').click();
    await expect(menu).toHaveCount(0);
  } finally {
    await deleteActors(page, [id]);
  }
});
