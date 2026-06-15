import { test, expect } from './fixtures/foundry-clients';
import { createCreatureViaUi, readCreatureMeta, deleteActors } from './fixtures/creature-ui';

test.describe('Create → Save', () => {
  const trash: string[] = [];

  test.afterEach(async ({ gmPage }) => {
    await deleteActors(gmPage, trash.splice(0));
  });

  test('building a creature in the UI persists an NPC with stats + flag', async ({ gmPage }) => {
    const name = `__e2e_create_${Date.now()}`;

    const saved = await createCreatureViaUi(gmPage, { name, level: 3, template: 'soldier' });
    trash.push(saved.id);

    expect(saved.level).toBe(3);
    expect(saved.ac).toBeGreaterThan(10);
    expect(saved.hp).toBeGreaterThan(0);

    const meta = await readCreatureMeta(gmPage, saved.id);
    expect(meta?.type).toBe('npc');
    expect(meta?.hasFlag, 'creatureData flag should be set').toBe(true);
  });
});
