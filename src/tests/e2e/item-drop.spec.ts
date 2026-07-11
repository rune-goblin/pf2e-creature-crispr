import { test, expect, MODULE_ID, openBuilder } from './fixtures/foundry-clients';

// Type-detecting drop routing: anything dropped on the editor frame lands where its item type
// says — costed actions in Actions, passive actions in Passives, melee attacks in Offense. The
// native HTML5 drag is simulated by dispatching drop events carrying Foundry's standard
// `{type:'Item', uuid}` payload on the frame.
test('dropped items route to the section their type dictates', async ({ gmPage: page }) => {
  const uuids = await page.evaluate(async () => {
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
        },
        {
          name: 'Stony Hide',
          type: 'action',
          system: {
            actionType: { value: 'passive' },
            description: { value: 'The creature has stone-hard skin.' }
          }
        },
        {
          name: 'Tail Lash',
          type: 'melee',
          system: {
            bonus: { value: 10 },
            damageRolls: { r0: { damage: '2d6+3', damageType: 'fire' } }
          }
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
    await expect(win.locator('.editor-header .header-title')).toHaveText(/New Creature/);

    const frame = win.locator('.creature-editor');
    const dropOnFrame = (uuid: string) =>
      frame.evaluate((el, u) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', JSON.stringify({ type: 'Item', uuid: u }));
        el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      }, uuid);

    await dropOnFrame(uuids['Venom Bite']);
    await expect(win.getByRole('button', { name: /Actions \(1\)/ })).toBeVisible();
    await expect(win.locator('.ability-name', { hasText: 'Venom Bite' })).toBeVisible();

    await dropOnFrame(uuids['Stony Hide']);
    await expect(win.getByRole('button', { name: /Passives \(1\)/ })).toBeVisible();
    await expect(win.locator('.ability-name', { hasText: 'Stony Hide' })).toBeVisible();
    // The passive did not land in Actions.
    await expect(win.getByRole('button', { name: /Actions \(1\)/ })).toBeVisible();

    // Re-dropping the same item is rejected as a duplicate (matched by source item id).
    await dropOnFrame(uuids['Venom Bite']);
    await expect(win.getByRole('button', { name: /Actions \(1\)/ })).toBeVisible();
    await expect(win.locator('.ability-name', { hasText: 'Venom Bite' })).toHaveCount(1);

    await dropOnFrame(uuids['Tail Lash']);
    // Appended after the default blank strike.
    await expect(win.locator('input.attack-name').last()).toHaveValue('Tail Lash');
  } finally {
    await page.evaluate(async () => {
      const a = (window as any).game.actors.getName('__e2e_src_npc');
      if (a) await a.delete();
    });
  }
});
