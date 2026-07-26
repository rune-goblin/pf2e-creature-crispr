/**
 * Creature Service - Skill sync (D7 + amendment)
 *
 * PF2e NPC skills live in two places: native trained (core) skills in `_source.system.skills[coreSlug]`
 * (NOT items) and lore skills as `type: "lore"` items. Both surface in the *prepared* `system.skills`,
 * which is what the editor reads via `extractSkillsFromActor`. CRISPR persists BOTH: lore skills as
 * lore items (`syncSkillItems`) and native core skills to `_source.system.skills[<slug>].base`
 * (`syncNativeSkills`). A key is native iff its sluggified form is one of the 16 CORE_SKILL_SLUGS.
 */

import type { NPCPF2e, ItemSourcePF2e } from 'foundry-pf2e';
import type { StoredCreatureData } from '../logic/contracts';
import type { SkillStatRange } from '../logic/creatureStatTables';
import { getStatRangesForLevel, interpolateSkill, skillToScalar } from '../logic/creatureStatTables';
import { logger } from './logger';

// The 16 core skill slugs, verbatim from _pf2e-source/src/module/actor/values.ts `CORE_SKILL_SLUGS`.
// A desired skill whose sluggified key is one of these is a native trained skill (persisted to
// `_source.system.skills[<slug>]`); everything else is a lore item.
const CORE_SKILL_SLUGS = new Set<string>([
  'acrobatics', 'arcana', 'athletics', 'crafting', 'deception', 'diplomacy', 'intimidation', 'medicine',
  'nature', 'occultism', 'performance', 'religion', 'society', 'stealth', 'survival', 'thievery'
]);

export function isCoreSkill(name: string): boolean {
  return CORE_SKILL_SLUGS.has(sluggify(name));
}

// The lore-item source shape verified against _pf2e-source/src/module/item/lore.ts (LoreSystemSource:
// `mod: { value: number }`) and the NPC sheet's own "add-lore" action in
// _pf2e-source/src/module/actor/npc/skills-editor.ts (`{ type: "lore", name, system: { mod: { value } } }`).
// Foundry fills the rest (proficient, traits, description) from the item template.
interface LoreItemSource {
  type: 'lore';
  name: string;
  system: { mod: { value: number } };
}

interface LoreLike {
  id: string;
  name: string;
  type: string;
  system: { mod?: { value?: number }; slug?: string | null };
}

/** camel=null branch of _pf2e-source/src/util/misc.ts `sluggify` — enough for skill names/slugs. */
function sluggify(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/[-\s]+/g, '-');
}

// Mirrors `LorePF2e.slug` (_pf2e-source/src/module/item/lore.ts): the effective slug a lore item
// surfaces under in prepared `system.skills` — sluggified, with `-lore` appended when absent. Using
// it on both the desired key and the existing item makes a round-tripped key (e.g. `warfare-lore`)
// match its item idempotently, so a no-op save writes nothing.
function loreSlug(input: string): string {
  const raw = sluggify(input);
  return /\blore\b/.test(raw) ? raw : `${raw}-lore`;
}

export function composeLoreItemSources(skills: Record<string, number>): LoreItemSource[] {
  return Object.entries(skills).map(([name, mod]) => ({ type: 'lore', name, system: { mod: { value: mod } } }));
}

/**
 * Split computed skills the way the save path classifies them: core-skill names → `native`, keyed by
 * their core slug (persisted to `_source.system.skills[<slug>].base`); everything else → `lore`, keyed
 * by its original name (persisted as a lore item). `createCreatureActor` partitions through this so its
 * output matches `syncNativeSkills`/`syncSkillItems` — a lore-ified core skill would double-represent
 * and mutate on the immediately-following zero-edit save (cornerstone violation).
 */
export function partitionSkills(skills: Record<string, number>): {
  native: Record<string, number>;
  lore: Record<string, number>;
} {
  const native: Record<string, number> = {};
  const lore: Record<string, number> = {};
  for (const [name, mod] of Object.entries(skills)) {
    if (isCoreSkill(name)) native[sluggify(name)] = mod;
    else lore[name] = mod;
  }
  return { native, lore };
}

export interface LoadedSkillSlugs {
  /** Loaded lore-skill slugs, normalized through `loreSlug` (match against lore items). */
  lore: Set<string>;
  /** Loaded native core-skill slugs, raw core slugs (match against `_source.system.skills` keys). */
  native: Set<string>;
}

/**
 * The skill slugs a flagged actor's stored data actually loaded into the editor: the union of the
 * benchmark skill keys and any verbatim `baseStats.skills` keys, partitioned into native (core) and
 * lore. Each is normalized in its own space — native as raw core slugs, lore through `loreSlug` — so
 * native deletion candidates aren't corrupted by the `-lore` suffix. The editor loads a flagged
 * actor's skills from this flag — NOT a fresh scan — so a skill added on the PF2e sheet after the flag
 * was written is absent here and must never be a delete candidate (cornerstone: whatever wasn't loaded
 * is never modified/deleted).
 */
export function loadedSkillSlugsFromFlag(data: StoredCreatureData): LoadedSkillSlugs {
  const lore = new Set<string>();
  const native = new Set<string>();
  const add = (key: string): void => {
    if (isCoreSkill(key)) native.add(sluggify(key));
    else lore.add(loreSlug(key));
  };
  for (const { skill } of data.benchmarks?.skills ?? []) add(skill);
  for (const key of Object.keys(data.baseStats?.skills ?? {})) add(key);
  return { lore, native };
}

function loreItems(actor: NPCPF2e): LoreLike[] {
  return (actor.items.contents as unknown as LoreLike[]).filter((i) => i.type === 'lore');
}

function itemSlug(item: LoreLike): string {
  return loreSlug(item.system?.slug || item.name || '');
}

/**
 * Reconcile the actor's lore items to the editor's LORE skills (core skills are skipped here — they go
 * through `syncNativeSkills`). Create a lore item for a desired lore skill with no matching item;
 * update `mod` only when it differs; delete a lore item only when its slug was in the editor's
 * load-time lore set (`loadedSlugs`) and is now absent. A true no-op save issues zero lore writes.
 *
 * `loadedSlugs` is the flagged actor's load-time LORE set (`LoadedSkillSlugs.lore`). When omitted
 * (unflagged/foreign actor — the editor loaded its skills from a fresh extraction), fall back to the
 * non-zero-mod lore items as the loaded set, which `extractSkillsFromActor` surfaces one-for-one.
 */
export async function syncSkillItems(
  actorId: string,
  skills: Record<string, number>,
  loadedSlugs?: Set<string>
): Promise<void> {
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  if (!actor) throw new Error(`Actor not found: ${actorId}`);

  const existing = loreItems(actor);
  const bySlug = new Map(existing.map((i) => [itemSlug(i), i]));

  const desiredSlugs = new Set<string>();
  const toCreate: LoreItemSource[] = [];
  const toUpdate: EmbeddedDocumentUpdateData[] = [];

  for (const [name, mod] of Object.entries(skills)) {
    // A core skill (e.g. the dropdown's capitalized "Athletics") is native — `syncNativeSkills`
    // persists it to `_source.system.skills`; never lore-ify it, even when the actor lacks it.
    if (isCoreSkill(name)) continue;
    const slug = loreSlug(name);
    desiredSlugs.add(slug);
    const match = bySlug.get(slug);
    if (match) {
      if ((match.system?.mod?.value ?? 0) !== mod) {
        toUpdate.push({ _id: match.id, 'system.mod.value': mod });
      }
    } else {
      toCreate.push({ type: 'lore', name, system: { mod: { value: mod } } });
    }
  }

  const wasLoaded = (i: LoreLike): boolean =>
    loadedSlugs ? loadedSlugs.has(itemSlug(i)) : (i.system?.mod?.value ?? 0) !== 0;
  const toDelete = existing
    .filter((i) => wasLoaded(i) && !desiredSlugs.has(itemSlug(i)))
    .map((i) => i.id);

  if (toDelete.length > 0) await actor.deleteEmbeddedDocuments('Item', toDelete);
  if (toCreate.length > 0) await actor.createEmbeddedDocuments('Item', toCreate as unknown as ItemSourcePF2e[]);
  if (toUpdate.length > 0) await actor.updateEmbeddedDocuments('Item', toUpdate);

  if (toDelete.length + toCreate.length + toUpdate.length > 0) {
    logger.info(`[CreatureService] Synced skill lore items: ${toDelete.length} deleted, ${toCreate.length} created, ${toUpdate.length} updated`);
  }
}

// The native-skill sub-shape, verified against _pf2e-source/src/module/actor/npc/data.ts
// (`NPCSkillSource`): the editable mod is `base` (a number); `note`/`special` are siblings we must
// preserve. `prepareSkills` (.../npc/document.ts) reads `_source.system.skills[slug].base` into the
// prepared statistic and marks a skill proficient iff its slug keys `_source.system.skills` — so a
// per-`base` partial write shows on the sheet, and key-deletion (`-=<slug>`) untrains the skill.
interface NativeSkillSource {
  base?: number;
  note?: string;
  special?: unknown[];
}

// A thematic skill variant ("+20 in forests"): its `base` is a skill bonus in its own right, so a
// level rescale must move it exactly as the skill's own base moves. Everything else (label,
// predicate, anything PF2e adds later) rides along verbatim.
interface NativeSkillSpecial {
  base?: number;
  [key: string]: unknown;
}

export interface NativeSkillSyncLevels {
  previousLevel?: number;
  level?: number;
}

/**
 * Rescale each `special[].base` through the same positional round-trip the skill bases use, so a
 * variant that was the "high" benchmark at the old level is the "high" benchmark at the new one.
 * Returns undefined when nothing moves — Foundry can't partially update an array, so the whole array
 * is written or none of it is (an unconditional write would break the zero-write no-op cornerstone).
 */
function rescaleSpecials(
  special: unknown[] | undefined,
  from: SkillStatRange,
  to: SkillStatRange
): NativeSkillSpecial[] | undefined {
  if (!Array.isArray(special) || special.length === 0) return undefined;

  let changed = false;
  const scaled = special.map((entry) => {
    const variant = entry as NativeSkillSpecial;
    if (typeof variant?.base !== 'number') return variant;
    const base = Math.round(interpolateSkill(skillToScalar(variant.base, from), to));
    if (base !== variant.base) changed = true;
    return { ...variant, base };
  });

  return changed ? scaled : undefined;
}

/**
 * Persist native (core) skills to `_source.system.skills[<slug>].base` (D7 amendment). Only core
 * skills (sluggified key in {@link CORE_SKILL_SLUGS}) are handled; lore keys are ignored (they go
 * through `syncSkillItems`). Partial-updates the `base` sub-key only — never the whole skill object —
 * so `special`/`note` survive; writes a field only when its mod differs (no-op save → zero
 * `system.skills` writes); deletes a core skill (`system.skills.-=<slug>`) only when it was in the
 * editor's load-time native set (`loadedNativeSlugs`) and is now absent. A core skill the editor never
 * loaded is never touched.
 *
 * On a real level change (`levels.previousLevel !== levels.level`) a managed skill's `special`
 * variants are rescaled alongside its base — otherwise a frozen "+20 in forests" ends up worse than
 * a base rescaled to 23.
 */
export async function syncNativeSkills(
  actorId: string,
  skills: Record<string, number>,
  loadedNativeSlugs?: Set<string>,
  levels: NativeSkillSyncLevels = {}
): Promise<void> {
  const actor = game.actors?.get(actorId) as NPCPF2e | undefined;
  if (!actor) throw new Error(`Actor not found: ${actorId}`);

  const source =
    (actor as unknown as { _source?: { system?: { skills?: Record<string, NativeSkillSource> } } })._source?.system
      ?.skills ?? {};

  const update: Record<string, unknown> = {};
  const desired = new Set<string>();

  const { previousLevel, level } = levels;
  const rescale =
    previousLevel !== undefined && level !== undefined && previousLevel !== level
      ? { from: getStatRangesForLevel(previousLevel).skills, to: getStatRangesForLevel(level).skills }
      : undefined;

  for (const [name, mod] of Object.entries(skills)) {
    const slug = sluggify(name);
    if (!CORE_SKILL_SLUGS.has(slug)) continue;
    desired.add(slug);
    if (source[slug]?.base !== mod) update[`system.skills.${slug}.base`] = mod;
    if (rescale) {
      const special = rescaleSpecials(source[slug]?.special, rescale.from, rescale.to);
      if (special) update[`system.skills.${slug}.special`] = special;
    }
  }

  // Deletion set: for a flagged actor it's the editor's load-time native set; for an unflagged
  // (foreign) actor no such set exists, so fall back to the actor's currently-trained core skills
  // (`base !== 0`) — the one-for-one set `extractSkillsFromActor` surfaced into the editor — so a core
  // skill removed there is untrained rather than silently kept. On a no-op save every such slug is
  // still in `desired`, so nothing deletes (cornerstone).
  const loadedNative =
    loadedNativeSlugs ?? new Set(Object.keys(source).filter((slug) => (source[slug]?.base ?? 0) !== 0));
  for (const slug of loadedNative) {
    if (!desired.has(slug) && slug in source) update[`system.skills.-=${slug}`] = null;
  }

  const changes = Object.keys(update).length;
  if (changes > 0) {
    await actor.update(update);
    logger.info(`[CreatureService] Synced native skills: ${changes} field write(s)`);
  }
}
