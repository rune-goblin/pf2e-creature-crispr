import { test, expect } from './fixtures/foundry-clients';
import { createCreatureViaUi, deleteActors } from './fixtures/creature-ui';

const WIN = '#pf2e-creature-crispr-builder';

async function pickFirst(page: import('@playwright/test').Page) {
  const menu = page.locator('.tfm-menu');
  await menu.waitFor({ state: 'visible' });
  await menu.locator('.tfm-opt:not([disabled])').first().click();
  await menu.waitFor({ state: 'hidden' });
}

test('iwr: exception + double coexist on a resistance', async ({ gmPage }) => {
  const name = `__e2e_iwr_${Date.now()}`;
  const saved = await createCreatureViaUi(gmPage, { name, level: 3, template: 'soldier' });

  const win = gmPage.locator(WIN);
  await win.locator('.creatures-table tbody tr', { hasText: name })
    .locator('[aria-label="Edit creature"]').click();
  await win.locator('.editor-header').waitFor({ state: 'visible' });

  const grid = win.locator('.defenses-grid');
  if (!(await grid.isVisible())) await win.getByRole('button', { name: 'Defenses' }).click();
  await grid.waitFor({ state: 'visible' });

  const resCell = win.locator('.grid-cell').filter({ hasText: 'Resistances' });

  // add a resistance
  await resCell.locator('.tfm-trigger.button').click();
  await pickFirst(gmPage);
  await expect(resCell.locator('.iwr-chip')).toHaveCount(1);

  // both add-first buttons present on the top bar
  await expect(resCell.locator('.tfm-trigger.add-first.except')).toBeVisible();
  await expect(resCell.locator('.tfm-trigger.add-first.double')).toBeVisible();

  // the user's exact step: add an EXCEPTION first
  await resCell.locator('.tfm-trigger.add-first.except').click();
  await pickFirst(gmPage);
  await expect(resCell.locator('.chip-qual.except')).toBeVisible();

  // COMPLAINT: does the double button survive on the top bar?
  const doubleStillThere = await resCell.locator('.tfm-trigger.add-first.double').isVisible();
  console.log('>>> double add-first visible after adding exception:', doubleStillThere);

  // now add the double too
  if (doubleStillThere) {
    await resCell.locator('.tfm-trigger.add-first.double').click();
    await pickFirst(gmPage);
  }
  const bothBelow =
    (await resCell.locator('.chip-qual.except').isVisible()) &&
    (await resCell.locator('.chip-qual.double').isVisible());
  console.log('>>> both except + double rows visible:', bothBelow);

  await resCell.screenshot({ path: 'iwr-resistance.png' });
  await deleteActors(gmPage, [saved.id]);
});
