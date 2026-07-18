import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/foundry-clients';
import { createCreatureViaUi, deleteActors } from './fixtures/creature-ui';

const WIN = '#pf2e-creature-crispr-builder';

/** Pick one option out of the open TypeFilterMenu, filtering by name so the choice is exact. */
async function pick(page: Page, option: string): Promise<void> {
  const menu = page.locator('.tfm-menu');
  await menu.waitFor({ state: 'visible' });
  await menu.locator('.tfm-search').fill(option);
  await menu.getByText(option, { exact: true }).click();
  await menu.waitFor({ state: 'hidden' });
}

test('iwr: a resistance carries an exception and a double-vs at once', async ({ gmPage }) => {
  const name = `__e2e_iwr_${Date.now()}`;
  const saved = await createCreatureViaUi(gmPage, { name, level: 3, template: 'soldier' });

  try {
    const win = gmPage.locator(WIN);
    await win.locator('.creatures-table tbody tr', { hasText: name })
      .locator('[aria-label="Edit creature"]').click();
    await win.locator('.editor-header').waitFor({ state: 'visible' });

    const grid = win.locator('.defenses-grid');
    if (!(await grid.isVisible())) await win.getByRole('button', { name: 'Defenses' }).click();
    await grid.waitFor({ state: 'visible' });

    const resCell = win.locator('.grid-cell').filter({ hasText: 'Resistances' });

    await resCell.locator('.tfm-trigger.button').click();
    await pick(gmPage, 'Fire');

    const chip = resCell.locator('.iwr-chip');
    await expect(chip).toHaveCount(1);
    await expect(chip.locator('.iwr-name')).toHaveText('Fire');
    await expect(resCell.locator('.tfm-trigger.add-first.except')).toBeVisible();
    await expect(resCell.locator('.tfm-trigger.add-first.double')).toBeVisible();

    await resCell.locator('.tfm-trigger.add-first.except').click();
    await pick(gmPage, 'Cold Iron');

    const except = chip.locator('.chip-qual.except');
    await expect(except.locator('.subchip')).toHaveCount(1);
    await expect(except).toContainText('Cold Iron');

    // The except trigger folds into the row it just created; the double trigger must outlive it,
    // or a resistance can never carry both qualities.
    await expect(resCell.locator('.tfm-trigger.add-first.except')).toHaveCount(0);
    await expect(resCell.locator('.tfm-trigger.add-first.double')).toBeVisible();

    await resCell.locator('.tfm-trigger.add-first.double').click();
    await pick(gmPage, 'Adamantine');

    const double = chip.locator('.chip-qual.double');
    await expect(double.locator('.subchip')).toHaveCount(1);
    await expect(double).toContainText('Adamantine');

    await expect(except).toBeVisible();
    await expect(double).toBeVisible();

    // Save rather than abandon the edit: it round-trips both qualities, and it leaves the builder
    // on the list view, which openBuilder's recovery path expects of the previous spec.
    await win.locator('.editor-header .btn-primary').click();
    await expect(win.locator('.creatures-table')).toBeVisible();
  } finally {
    await deleteActors(gmPage, [saved.id]);
  }
});
