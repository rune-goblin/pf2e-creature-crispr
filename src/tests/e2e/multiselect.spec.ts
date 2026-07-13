import { test, expect, MODULE_ID, BUILDER_ID, openBuilder } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

const WIN = `#${BUILDER_ID}`;

/** Seed `count` CRISPR-flagged NPCs sharing a unique prefix so a search filter isolates them. */
async function seedCreatures(page: import('@playwright/test').Page, prefix: string, count: number): Promise<string[]> {
  return page.evaluate(
    async ({ mod, p, n }) => {
      const specs = Array.from({ length: n }, (_, i) => ({
        name: `${p}_${i + 1}`,
        type: 'npc',
        system: { details: { level: { value: 3 } }, attributes: { ac: { value: 18 }, hp: { value: 40, max: 40 } } },
        flags: { [mod]: { creatureData: { benchmarks: {}, baseLevel: 3, baseStats: {}, createdAt: 0, updatedAt: 0 } } },
      }));
      const created = await (window as any).Actor.createDocuments(specs);
      return created.map((a: any) => a.id as string);
    },
    { mod: MODULE_ID, p: prefix, n: count },
  );
}

test.describe('Multiselect bulk actions', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('shift+click selects a range and the bulk dropdown deletes them', async ({ gmPage: page }) => {
    const prefix = `__e2e_ms_${Date.now()}`;
    const ids = await seedCreatures(page, prefix, 4);
    trash.push(...ids); // safety net if assertions fail before the bulk delete

    await openBuilder(page);
    const win = page.locator(WIN);

    // Isolate our seeded rows so shift-range selection is deterministic.
    await win.locator('.search-input').fill(prefix);
    const rows = win.locator('.creatures-table tbody tr');
    await expect(rows).toHaveCount(4);

    const bulkCount = win.locator('.bulk-bar .bulk-count');
    const bulkTrigger = win.locator('.bulk-bar .ram-trigger');
    await expect(win.locator('.bulk-bar')).toHaveCount(0); // no bar until something is selected

    // A single checkbox click selects one row.
    await rows.nth(0).locator('.row-check').click();
    await expect(bulkCount).toHaveText(/1 selected/);
    await expect(win.locator('.creatures-table tbody tr.selected')).toHaveCount(1);

    // Shift+click the third row extends the selection across rows 1–3.
    await rows.nth(2).locator('.row-check').click({ modifiers: ['Shift'] });
    await expect(bulkCount).toHaveText(/3 selected/);
    await expect(win.locator('.creatures-table tbody tr.selected')).toHaveCount(3);

    // Select-all covers every visible row; Clear resets.
    await win.locator('thead .row-check').click();
    await expect(bulkCount).toHaveText(/4 selected/);
    await win.locator('.bulk-bar .bulk-clear').click();
    await expect(win.locator('.bulk-bar')).toHaveCount(0);

    // Re-select all and delete via the dropdown's Delete action.
    await win.locator('thead .row-check').click();
    await bulkTrigger.click();
    const menu = page.locator('.ram-menu');
    await expect(menu.getByText('Move to CRISPR folder')).toBeVisible();
    await expect(menu.getByText('Remove from CRISPR')).toBeVisible();
    await menu.getByText('Delete actors').click();

    await win.locator('.dialog-backdrop .dialog-button-primary', { hasText: 'Delete' }).click();

    await expect
      .poll(() => page.evaluate((list) => list.filter((id) => (window as any).game.actors.get(id)).length, ids))
      .toBe(0);
    await expect(rows).toHaveCount(0);
  });
});
