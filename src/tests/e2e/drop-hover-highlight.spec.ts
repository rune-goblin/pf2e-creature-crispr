import { test, expect, MODULE_ID, openBuilder } from './fixtures/foundry-clients';

// Hover feedback: a document-level dragstart sniffer classifies the dragged item so that while
// the drag hovers the editor, the frame highlights and the destination section highlights too.
test('dragging over the editor highlights the frame and the destination section', async ({ gmPage: page }) => {
  const uuids = await page.evaluate(async () => {
    const actor = await (window as any).Actor.create({
      name: '__e2e_hover_npc',
      type: 'npc',
      system: { details: { level: { value: 3 } } },
      items: [
        {
          name: 'Stony Hide',
          type: 'action',
          system: { actionType: { value: 'passive' }, description: { value: 'Stone-hard skin.' } }
        },
        {
          name: 'Tail Lash',
          type: 'melee',
          system: { bonus: { value: 10 }, damageRolls: { r0: { damage: '2d6+3', damageType: 'fire' } } }
        }
      ]
    });
    const byName: Record<string, string> = {};
    for (const item of actor.items.contents) byName[item.name] = item.uuid;
    return byName;
  });

  try {
    await openBuilder(page);
    const win = page.locator(`#${MODULE_ID}-builder`);

    await win.locator('.list-header .btn-create').click();
    const frame = win.locator('.creature-editor');
    await expect(frame).toBeVisible();

    const startDrag = (payload: object) =>
      page.evaluate((p) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', JSON.stringify(p));
        document.body.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, payload);
    const hoverFrame = () =>
      frame.evaluate((el) => {
        el.dispatchEvent(new DragEvent('dragover', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true }));
      });
    const endDrag = () =>
      frame.evaluate((el) => {
        el.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true }));
        document.body.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
      });

    // Passive ability → the Passives section is the announced destination.
    await startDrag({ type: 'Item', uuid: uuids['Stony Hide'] });
    await hoverFrame();
    await expect(frame).toHaveClass(/drag-over-frame/);
    await expect(win.locator('.editor-section.drag-over')).toHaveCount(1);
    await expect(win.locator('.editor-section.drag-over')).toContainText('Passives');
    await endDrag();
    await expect(frame).not.toHaveClass(/drag-over-frame/);
    await expect(win.locator('.editor-section.drag-over')).toHaveCount(0);

    // Melee attack → Offense.
    await startDrag({ type: 'Item', uuid: uuids['Tail Lash'] });
    await hoverFrame();
    await expect(win.locator('.editor-section.drag-over')).toContainText('Offense');
    await endDrag();

    // CRISPR's own ability dragged back in: frame highlights, but no destination is announced.
    await startDrag({ type: 'Item', crisprAbilityDrag: true, data: {} });
    await hoverFrame();
    await expect(frame).toHaveClass(/drag-over-frame/);
    await expect(win.locator('.editor-section.drag-over')).toHaveCount(0);
    await endDrag();
  } finally {
    await page.evaluate(async () => {
      const a = (window as any).game.actors.getName('__e2e_hover_npc');
      if (a) await a.delete();
    });
  }
});
