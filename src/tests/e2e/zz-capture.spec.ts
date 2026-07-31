import { test, expect, openBuilder, BUILDER_ID, MODULE_ID } from './fixtures/foundry-clients';
import type { Page } from '@playwright/test';

const NAME = 'Bramblewrack Hulk';
const OUT = process.env.CAPTURE_DIR ?? '.';

const SHOWCASE = {
  name: NAME,
  level: 8,
  creatureType: 'creature',
  size: 'large',
  traits: ['plant', 'fey'],
  benchmarks: {
    abilities: { str: 1, dex: 0.3333, con: 0.8333, int: 0, wis: 0.5, cha: 0.1666 },
    perception: 0.5,
    ac: 0.6666,
    hp: 0.8333,
    saves: { fortitude: 0.8333, reflex: 0.3333, will: 0.5 },
    strikeAttack: 0.6666,
    strikeDamage: 0.6666,
    skills: [
      { skill: 'athletics', benchmark: 0.6666 },
      { skill: 'nature', benchmark: 0.5 },
      { skill: 'stealth', benchmark: 0.5 },
      { skill: 'survival', benchmark: 0.5 },
    ],
  },
  strikes: [
    {
      name: 'Thorned Fist',
      attackBenchmark: 0.6666,
      damageBenchmark: 0.5,
      attackBonus: 20,
      damage: '2d8 + 12',
      damageType: 'bludgeoning',
      isRanged: false,
      traits: ['reach-10', 'trip'],
      persistentBenchmark: 0.5,
      customPersistentFormula: '1d6',
      persistentDamageType: 'bleed',
    },
    {
      name: 'Seedpod Volley',
      attackBenchmark: 0.5,
      damageBenchmark: 0.3333,
      attackBonus: 17,
      damage: '2d6 + 8',
      damageType: 'piercing',
      isRanged: true,
      range: 40,
      traits: ['thrown-30'],
    },
  ],
  specialAbilities: [
    {
      name: 'Deep Roots',
      description:
        '<p>While the hulk begins its turn in soil or undergrowth, it gains a +2 circumstance bonus to Fortitude saves and to its DC against attempts to Shove, Trip, or Reposition it.</p>',
      actionType: 'passive',
      traits: [],
    },
    {
      name: 'Spore Burst',
      description:
        '<p>The hulk splits a seed pod across its shoulders, filling a @Template[emanation|distance:15] with choking spores. Each creature in the area must attempt a DC 26 Fortitude save.</p><hr /><p><strong>Failure</strong> The creature takes 3d6 poison damage and is @UUID[Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm]{Sickened 1}.</p><p><strong>Critical Failure</strong> As failure, but the creature is @UUID[Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm]{Sickened 2} and cannot reduce its sickened value while it remains in the area.</p>',
      actionType: 'action',
      actions: 2,
      traits: ['poison', 'plant'],
    },
    {
      name: 'Bramble Lash',
      description:
        '<p><strong>Trigger</strong> A creature within 15 feet leaves a square adjacent to the hulk.</p><hr /><p><strong>Effect</strong> The hulk whips a length of thorned vine at the retreating creature, making a Thorned Fist Strike against it. On a hit, the target is also pulled 5 feet toward the hulk.</p>',
      actionType: 'reaction',
      traits: [],
    },
  ],
  immunities: [{ type: 'sleep' }],
  resistances: [{ type: 'piercing', value: 5 }],
  weaknesses: [{ type: 'fire', value: 10 }, { type: 'slashing', value: 5 }],
  speeds: { land: 25, climb: 15 },
  languages: ['common', 'sylvan'],
  senses: [
    { type: 'darkvision', acuity: 'precise' },
    { type: 'tremorsense', acuity: 'imprecise', range: 30 },
  ],
  portraitImage: 'icons/magic/nature/elemental-plant-humanoid.webp',
  tokenImage: 'icons/magic/nature/elemental-plant-humanoid.webp',
  isTroop: false,
};

/** Grow the app window (and viewport) until nothing inside it scrolls, so one shot holds the whole UI. */
async function fitWindow(page: Page, width: number): Promise<void> {
  let height = 900;
  for (let i = 0; i < 8; i++) {
    await page.setViewportSize({ width: width + 80, height: Math.min(height + 80, 14_000) });
    await page.evaluate(
      ({ id, w, h }) => {
        (window as any).foundry.applications.instances.get(id)?.setPosition({ left: 24, top: 24, width: w, height: h });
      },
      { id: BUILDER_ID, w: width, h: height },
    );
    await page.waitForTimeout(250);
    const overflow = await page.evaluate((id) => {
      const win = document.getElementById(id);
      if (!win) return 0;
      const nodes = [win, ...Array.from(win.querySelectorAll<HTMLElement>('*'))];
      return Math.max(
        0,
        ...nodes.map((el) => {
          const oy = getComputedStyle(el).overflowY;
          return oy === 'auto' || oy === 'scroll' ? el.scrollHeight - el.clientHeight : 0;
        }),
      );
    }, BUILDER_ID);
    if (overflow <= 2 || height > 12_000) break;
    height += overflow + 8;
  }
}

async function shoot(page: Page, file: string): Promise<void> {
  await page.locator(`#${BUILDER_ID}`).screenshot({ path: `${OUT}/${file}`, scale: 'device' });
}

test('build the showcase creature if missing', async ({ gmPage }) => {
  const rebuild = process.env.CAPTURE_REBUILD === '1';
  const existing = await gmPage.evaluate(
    async ({ n, drop }) => {
      const g = (window as any).game;
      const actor = g.actors.find((a: any) => a.name === n);
      if (actor && drop) {
        await actor.delete();
        return null;
      }
      return actor?.id ?? null;
    },
    { n: NAME, drop: rebuild },
  );
  if (existing) return;
  await gmPage.evaluate(
    async ({ mod, data }) => {
      await (window as any).game.modules.get(mod).api.saveEditableCreature(data);
    },
    { mod: MODULE_ID, data: SHOWCASE },
  );
});

test('capture the three views', async ({ gmPage }) => {
  await openBuilder(gmPage);
  const win = gmPage.locator(`#${BUILDER_ID}`);

  // 1 — list view, cropped to the table instead of the window's default dead space below it
  await fitWindow(gmPage, 1200);
  await expect(win.locator('.creatures-table')).toBeVisible();
  const listHeight = await gmPage.evaluate((id) => {
    const w = document.getElementById(id)!;
    const table = w.querySelector('.creatures-table')!;
    return Math.ceil(table.getBoundingClientRect().bottom - w.getBoundingClientRect().top + 24);
  }, BUILDER_ID);
  await gmPage.evaluate(
    ({ id, h }) => (window as any).foundry.applications.instances.get(id)?.setPosition({ height: h }),
    { id: BUILDER_ID, h: listHeight },
  );
  await gmPage.waitForTimeout(300);
  await shoot(gmPage, 'crispr-list.png');

  // 2 — editor as it opens
  await win.locator(`tr[data-actor-id] >> nth=0`).waitFor();
  const row = win.locator('tr[data-actor-id]', { hasText: NAME }).first();
  await row.locator('[aria-label="Edit creature"]').click();
  await expect(win.locator('.editor-header .header-title')).toBeVisible();
  await gmPage.waitForTimeout(500);
  await fitWindow(gmPage, 1200);
  await shoot(gmPage, 'crispr-editor-default.png');

  // 3 — editor with every section expanded
  for (let i = 0; i < 12; i++) {
    // Basic Info marks expansion on its <section>; the CollapsibleSection widget marks it on the header.
    const collapsed = win.locator('.editor-section:not(.expanded) .section-header:not(.expanded) .section-toggle');
    if (!(await collapsed.count())) break;
    await collapsed.first().click();
    await gmPage.waitForTimeout(150);
  }
  const expandAll = win.locator('[aria-label="Expand all"]');
  for (let i = 0; i < (await expandAll.count()); i++) await expandAll.nth(i).click();
  await gmPage.waitForTimeout(500);
  await fitWindow(gmPage, 1200);
  await shoot(gmPage, 'crispr-editor-expanded.png');
});
