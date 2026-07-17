import type { ItemPF2e, NPCPF2e } from 'foundry-pf2e';
import type { TroopSize } from '../logic/models';
import { withTroopTrait, withTroopWeaknesses } from '../logic/troop';
import { sizeToPf2e } from '../logic/sizes';
import { buildIwrSystem } from './crud';
import { getWeaknessesFromActor } from './actorQueries';
import { requireActor } from './folderManager';
import { logger } from './logger';

// Canonical generic glossary items — pure @Localize wrappers, no creature-specific values (see the
// troop-build plan, fact 5). Defenses + Movement define troop-ness; Form Up is opt-in.
const TROOP_ABILITY_UUIDS = {
  defenses: 'Compendium.pf2e.bestiary-ability-glossary-srd.Item.EawOw47nHueUPnYc',
  movement: 'Compendium.pf2e.bestiary-ability-glossary-srd.Item.MXI6zwrvbQNIv7ji',
  formUp: 'Compendium.pf2e.bestiary-ability-glossary-srd.Item.OvqohW9YuahnFaiX'
} as const;

/**
 * Make a world NPC a PF2e troop: add the `troop` trait, seed missing area/splash weaknesses, set the
 * formation size, and embed the standard glossary abilities. The system derives token footprint, HP
 * thresholds and segments from the trait, so this touches none of them; it also stamps no immunities
 * (there is no troop immunity rule — plan facts 1 and 3). Flag-agnostic and idempotent: re-running, or
 * running on an imported published troop that already has trait/weaknesses/abilities, changes nothing.
 */
export async function applyTroopToActor(
  actorId: string,
  opts: { troopSize?: TroopSize; formUp?: boolean } = {}
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

  const existingSlugs = new Set(npc.items.contents.map((i) => i.slug).filter((s): s is string => !!s));
  const toEmbed: object[] = [];
  for (const uuid of uuids) {
    const source = (await fromUuid(uuid)) as ItemPF2e | null;
    if (!source) {
      throw new Error(game.i18n.format('pf2e-creature-crispr.troop.abilityMissing', { uuid }));
    }
    if (source.slug && existingSlugs.has(source.slug)) continue;
    toEmbed.push(source.toObject());
  }
  if (toEmbed.length) await npc.createEmbeddedDocuments('Item', toEmbed as any);

  logger.info(`Applied troop template to: ${npc.name}`);
  return npc.id;
}
