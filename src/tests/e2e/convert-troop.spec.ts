import { test, expect, openBuilder, BUILDER_ID, MODULE_ID } from './fixtures/foundry-clients';
import { deleteActors } from './fixtures/creature-ui';

// import → Convert to Troop → assert the persisted actor gained the sweep action and lost its strike.
// Exercises the W2/W3 default engine end to end in a real Foundry: strike → "{Strike} Flurry" action,
// melee item removed on save, level +5, troop trait stamped.
test.describe('Convert to Troop', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('converting an imported creature generates the Flurry action and clears strikes', async ({ gmPage }) => {
    const srcName = `__e2e_convert_${Date.now()}`;
    const srcId = await gmPage.evaluate(async (n) => {
      const actor = await (window as any).Actor.create({
        name: n,
        type: 'npc',
        system: { details: { level: { value: 2 } }, attributes: { ac: { value: 16 }, hp: { value: 30, max: 30 } } },
        items: [
          { name: 'Bite', type: 'melee', system: { bonus: { value: 9 }, damageRolls: { a: { damage: '1d6', damageType: 'piercing' } } } }
        ]
      });
      return actor.id as string;
    }, srcName);
    trash.push(srcId); // import moves (not clones), so this is the only actor to clean up

    // Import the world NPC into the CRISPR folder (same World Actors picker flow as import.spec).
    await openBuilder(gmPage);
    const win = gmPage.locator(`#${BUILDER_ID}`);
    await win.locator('.list-header .btn-import').click();

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

    // Open the imported creature in the editor, then run the Convert to Troop button with its defaults.
    await gmPage.evaluate((actorId) => {
      (window as any).game.modules.get('pf2e-creature-crispr').api.editCreature({ actorId });
    }, srcId);
    await expect(win.locator('.editor-header')).toBeVisible();

    await win.locator('.editor-header .btn-secondary', { hasText: 'Convert to Troop' }).click();
    const convertDialog = win.locator('.dialog', { hasText: 'Convert to Troop' });
    await expect(convertDialog).toBeVisible();
    await convertDialog.locator('.dialog-button-primary').click();
    await expect(convertDialog).toBeHidden();

    await win.locator('.editor-header .btn-primary', { hasText: /Save/ }).click();

    // Assert against the persisted actor: strike gone, Flurry action present, level bumped, trait stamped.
    await expect
      .poll(() => gmPage.evaluate(({ actorId, mod }) => {
        const actor = (window as any).game.actors.get(actorId);
        if (!actor) return null;
        const items = actor.items.contents as any[];
        const weaknesses = (actor.system?.attributes?.weaknesses ?? []) as any[];
        return {
          level: actor.system?.details?.level?.value,
          traits: actor.system?.traits?.value ?? [],
          meleeCount: items.filter((i) => i.type === 'melee').length,
          hasFlurry: items.some((i) => i.type === 'action' && /Flurry/.test(i.name)),
          volleyCount: items.filter((i) => i.type === 'action' && /Volley/.test(i.name)).length,
          hasKit: items.some((i) => i.name === 'Troop Defenses'),
          flagged: !!actor.getFlag(mod, 'creatureData'),
          // Guideline values for the post-conversion level (7), and nothing else seeded.
          weaknesses: weaknesses.map((w) => ({ type: w.type, value: w.value })).sort((a, b) => a.type.localeCompare(b.type)),
          immunityCount: (actor.system?.attributes?.immunities ?? []).length
        };
      }, { actorId: srcId, mod: MODULE_ID }), { timeout: 15000 })
      .toEqual({
        level: 7,
        traits: expect.arrayContaining(['troop']),
        meleeCount: 0,
        hasFlurry: true,
        volleyCount: 0,
        hasKit: true,
        flagged: true,
        weaknesses: [
          { type: 'area-damage', value: 8 },
          { type: 'splash-damage', value: 8 }
        ],
        immunityCount: 0
      });
  });

  // The archer's bow is a PF2e ranged strike in its real shape: item type `melee`, no `ranged`
  // trait, volley-30 + max-only system.range. Guards the extraction layer that once classified
  // every compendium strike as melee, leaving the volley branch dead.
  const WILD_HUNT_ARCHER = 'Compendium.pf2e.kingmaker-bestiary.Actor.3gtQv6Mkr7CUlG7W';

  test('a compendium archer converts with both a melee sweep and a ranged volley', async ({ gmPage }) => {
    const result = await gmPage.evaluate(
      async ({ uuid, mod }) => {
        const api = (window as any).game.modules.get(mod).api;
        const id = await api.importCreatureFromCompendium(uuid);
        await api.convertActorToTroop(id, {});
        const items = (window as any).game.actors.get(id).items.contents as any[];
        const volley = items.find((i) => i.type === 'action' && /Volley/.test(i.name));
        return {
          id,
          actionNames: items.filter((i) => i.type === 'action').map((i) => i.name),
          meleeCount: items.filter((i) => i.type === 'melee').length,
          volleyDescription: volley?.system?.description?.value ?? null
        };
      },
      { uuid: WILD_HUNT_ARCHER, mod: MODULE_ID }
    );
    trash.push(result.id);

    expect(result.actionNames).toContain('Horns Flurry');
    expect(result.actionNames).toContain('Living Bow Volley');
    expect(result.meleeCount).toBe(0);
    expect(result.volleyDescription).toContain('@Template[type:burst|distance:10]');
    expect(result.volleyDescription).toContain('within 100 feet');
  });
});
