import type { ItemPF2e, NPCPF2e } from 'foundry-pf2e';
import type { TroopSize } from '../logic/models';
import type { TroopConversionOptions } from '../logic/contracts';
import { withTroopTrait, withTroopWeaknesses, applyTroopConversion, upsertTroopThresholdsLine } from '../logic/troop';
import { sizeToPf2e } from '../logic/sizes';
import { buildIwrSystem } from './crud';
import { getWeaknessesFromActor } from './actorQueries';
import { requireActor } from './folderManager';
import { dropPlaceholderStrikes, loadCreatureForEdit } from './editorHost';
import { getAbilityProviders } from './abilityProviderRegistry';
import { getActiveSaveTarget, getSaveTarget } from './saveTargetRegistry';
import { logger } from './logger';

// Canonical generic glossary items — pure @Localize wrappers, no creature-specific values (see the
// troop-build plan, fact 5). Defenses + Movement define troop-ness; Form Up is opt-in. The two
// spellcasting variants are CRISPR's own compendium items (PF2e ships no glossary entry for them).
const TROOP_ABILITY_UUIDS = {
  defenses: 'Compendium.pf2e.bestiary-ability-glossary-srd.Item.EawOw47nHueUPnYc',
  movement: 'Compendium.pf2e.bestiary-ability-glossary-srd.Item.MXI6zwrvbQNIv7ji',
  formUp: 'Compendium.pf2e.bestiary-ability-glossary-srd.Item.OvqohW9YuahnFaiX',
  spellcasting: 'Compendium.pf2e-creature-crispr.abilities.Item.crisprTroopSpell',
  steadySpellcasting: 'Compendium.pf2e-creature-crispr.abilities.Item.crisprSteadySpel'
} as const;

const TROOP_SPELLCASTING_SLUGS = ['troop-spellcasting', 'steady-troop-spellcasting'];

/**
 * Make a world NPC a PF2e troop: add the `troop` trait, seed missing area/splash weaknesses, set the
 * formation size, and embed the standard glossary abilities. The system derives token footprint and
 * the structured HP thresholds/segments from the trait, so this touches none of them — but the
 * published statblock's "Thresholds X (3 segments), Y (2 segments)" prose is ours, stamped into the
 * embedded Troop Defenses copy from the actor's current max HP. Stamps no immunities (there is no
 * troop immunity rule — plan facts 1 and 3). Flag-agnostic and idempotent: re-running, or running on
 * an imported published troop that already has trait/weaknesses/abilities, changes nothing.
 */
export async function applyTroopToActor(
  actorId: string,
  opts: { troopSize?: TroopSize; formUp?: boolean; steadySpellcasting?: boolean } = {}
): Promise<string> {
  const troopSize = opts.troopSize ?? 'gargantuan';
  const formUp = opts.formUp ?? false;

  const actor = requireActor(actorId);
  if (actor.type !== 'npc') {
    throw new Error(game.i18n.format('pf2e-creature-crispr.troop.notNpc', { type: actor.type }));
  }
  const npc = actor as unknown as NPCPF2e;

  const level = npc.system?.details?.level?.value ?? 1;

  const currentTraits = npc.system?.traits?.value ?? [];
  const nextTraits = withTroopTrait([...currentTraits]);
  const traitChanged = nextTraits.length !== currentTraits.length;

  // Seed-if-missing never drops entries, so a length gain is exactly "a weakness was added".
  const currentWeaknesses = getWeaknessesFromActor(actorId);
  const nextWeaknesses = withTroopWeaknesses(currentWeaknesses, level);
  const weaknessesChanged = nextWeaknesses.length !== currentWeaknesses.length;

  const currentSize = npc.system?.traits?.size?.value;
  const nextSize = sizeToPf2e(troopSize);
  const sizeChanged = currentSize !== nextSize;

  const update: Record<string, any> = {};
  if (traitChanged || sizeChanged) {
    update.system = { traits: {} };
    if (traitChanged) update.system.traits.value = nextTraits;
    if (sizeChanged) update.system.traits.size = { value: nextSize };
  }
  if (weaknessesChanged) {
    update.system = update.system ?? {};
    // Write only the weaknesses key — Object.assign-ing all of buildIwrSystem would wipe authored
    // immunities/resistances (e.g. an undead troop's package), which troop-ness must not touch.
    update.system.attributes = { weaknesses: buildIwrSystem({ weaknesses: nextWeaknesses }).weaknesses };
  }
  if (Object.keys(update).length) await npc.update(update);

  const uuids: string[] = [TROOP_ABILITY_UUIDS.defenses, TROOP_ABILITY_UUIDS.movement];
  if (formUp) uuids.push(TROOP_ABILITY_UUIDS.formUp);

  // Fall back to a sluggified name so a null-slug item still dedups instead of double-embedding.
  const existingSlugs = new Set(npc.items.contents.map((i) => i.slug ?? game.pf2e.system.sluggify(i.name)));

  // Casters get Troop Spellcasting. The two variants occupy one slot: if either is already on the
  // actor (authored or from a prior run), embed neither — don't stack the other variant beside it.
  const casts = npc.items.contents.some((i) => i.type === 'spellcastingEntry');
  if (casts && !TROOP_SPELLCASTING_SLUGS.some((slug) => existingSlugs.has(slug))) {
    uuids.push(opts.steadySpellcasting ? TROOP_ABILITY_UUIDS.steadySpellcasting : TROOP_ABILITY_UUIDS.spellcasting);
  }
  const toEmbed: object[] = [];
  for (const uuid of uuids) {
    const source = (await fromUuid(uuid)) as ItemPF2e | null;
    if (!source) {
      throw new Error(game.i18n.format('pf2e-creature-crispr.troop.abilityMissing', { uuid }));
    }
    if (existingSlugs.has(source.slug ?? game.pf2e.system.sluggify(source.name))) continue;
    const data = source.toObject() as { system: { description: { value: string } } };
    if (uuid === TROOP_ABILITY_UUIDS.defenses) {
      const maxHp = npc.system?.attributes?.hp?.max ?? 0;
      if (maxHp >= 3) data.system.description.value = upsertTroopThresholdsLine(data.system.description.value, maxHp);
    }
    toEmbed.push(data);
  }
  if (toEmbed.length) await npc.createEmbeddedDocuments('Item', toEmbed as any);

  logger.info(`Applied troop template to: ${npc.name}`);
  return npc.id;
}

/**
 * Headless "Convert to Troop": load the actor as an EditableCreature, run CRISPR's default conversion
 * engine (the same `applyTroopConversion` the editor button runs — level bump + formation size + generated
 * sweep/volley + glossary kit), and persist through a save target. Same load/transform/save as the editor's
 * Save, without the UI. `providerId` selects the recipe override layer (default: the first registered
 * provider that has one); `saveTargetId` selects where it writes (default: the active target). The remaining
 * fields are the W2 `TroopConversionOptions` (formation size, level delta, Form Up, keep strikes, ability
 * name overrides), forwarded to the same kernel seam the editor uses. Returns the actor id.
 */
export async function convertActorToTroop(
  actorId: string,
  opts: { providerId?: string; saveTargetId?: string } & TroopConversionOptions = {}
): Promise<string> {
  const { providerId, saveTargetId, ...conversionOpts } = opts;
  const target = (saveTargetId && getSaveTarget(saveTargetId)) || getActiveSaveTarget();
  const creature = loadCreatureForEdit(actorId, target);
  if (!creature) throw new Error(`convertActorToTroop: actor not found (${actorId})`);
  // Without this, re-converting an already-converted troop (strikes cleared on the first pass)
  // regenerates a sweep from the placeholder — breaking the documented idempotence.
  dropPlaceholderStrikes(creature);

  const recipe = getAbilityProviders(providerId ? [providerId] : undefined).find(
    (p) => p.troopConversion
  )?.troopConversion;
  applyTroopConversion(creature, recipe ?? {}, conversionOpts);

  await target.updateActor(actorId, creature);
  await target.onAfterSave?.(actorId, creature, 'update');
  logger.info(`Converted actor to troop: ${creature.name}`);
  return actorId;
}
