import { test, expect, MODULE_ID, openBuilder } from './fixtures/foundry-clients';

// Direction: dragging an action/passive off an actor sheet into the CRISPR editor's Special
// Abilities section. The native HTML5 drag is simulated by dispatching the drop event with a
// DataTransfer carrying Foundry's standard `{type:'Item', uuid}` payload.
test('dropping an action onto the Special Abilities section adds it', async ({ gmPage: page }) => {
  const itemUuid = await page.evaluate(async () => {
    const actor = await (window as any).Actor.create({
      name: '__e2e_src_npc',
      type: 'npc',
      system: { details: { level: { value: 3 } } },
      items: [
        {
          name: 'Venom Bite',
          type: 'action',
          system: {
            actionType: { value: 'action' },
            actions: { value: 1 },
            description: { value: 'The creature bites for 2d6 poison damage.' }
          }
        }
      ]
    });
    return actor.items.contents[0].uuid as string;
  });

  try {
    await openBuilder(page);
    const win = page.locator(`#${MODULE_ID}-builder`);

    await win.locator('.list-header .btn-create').click();
    await expect(win.locator('.editor-header .header-title')).toHaveText(/New Creature/);

    await win.getByRole('button', { name: /Special Abilities/ }).click();
    const dropZone = win.locator('[aria-label="Drop an action or passive ability here to add it"]');
    await expect(dropZone).toBeVisible();

    await dropZone.evaluate((el, uuid) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid }));
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, itemUuid);

    await expect(win.locator('.ability-name', { hasText: 'Venom Bite' })).toBeVisible();
    await expect(win.getByRole('button', { name: /Special Abilities \(1\)/ })).toBeVisible();
  } finally {
    await page.evaluate(async () => {
      const a = (window as any).game.actors.getName('__e2e_src_npc');
      if (a) await a.delete();
    });
  }
});
