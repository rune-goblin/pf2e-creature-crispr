/**
 * Normalises an `exportActorSource()` capture of a troop into a byte-stable source file — the
 * shape a consumer repo commits (e.g. ReignMaker's `data/troops/<slug>.json`) and rebuilds from.
 * Foundry-free on purpose: consumers run it in Node (dev write-back middleware, pull scripts)
 * and in vitest.
 */

// The kernel cannot import services/constants (Foundry-coupled tree); this is the module's own id.
const CRISPR_FLAG = 'pf2e-creature-crispr';
const CREATURE_DATA_KEY = 'creatureData';
const ITEM_BENCHMARK_KEY = 'itemBenchmarks';

const TROOP_SIZES: Record<string, string> = { lg: 'large', huge: 'huge', grg: 'gargantuan' };

/** The consumer-facing size label for an actor size value, or undefined for a non-troop size. */
export function troopSizeLabel(sizeValue: string | undefined): string | undefined {
  return sizeValue ? TROOP_SIZES[sizeValue] : undefined;
}

// _stats is world state, but its compendiumSource is the machine-readable provenance
// (importedFrom in the CRISPR flag is only a display string) — keep exactly that key.
// A troop imported FROM a consumer's own pack comes back stamped with that pack's UUID, which
// would reclassify an authored troop as an import; that self-reference is dropped by the caller
// keeping its own pack out of compendiumSource — here every compendiumSource survives.
function stripVolatile(doc: Record<string, any>): Record<string, any> {
  const { _id, _stats, folder, sort, ownership, ...kept } = doc;
  return _stats?.compendiumSource ? { ...kept, _stats: { compendiumSource: _stats.compendiumSource } } : kept;
}

// Foundry stamps the running install's schema/version into every document it stores, so a
// troop pulled from a world carries that install's Foundry and system versions.
// Reset to the unmigrated shape the compendium ships.
function resetMigration(system: Record<string, any> | undefined): void {
  if (system?._migration) system._migration = { version: null, previous: null };
}

// Troops pulled from a world carry whatever damage the source actor had taken, so a
// dragged-in copy would arrive pre-injured.
function resetHealth(system: Record<string, any> | undefined): void {
  const hp = system?.attributes?.hp;
  if (!hp) return;
  hp.value = hp.max;
  hp.temp = 0;
}

// The same prose reaches export in two serializations depending on how the item got there:
// text carried verbatim from a repo file keeps the PF2e source's XHTML `<hr />`, while
// anything Foundry re-serialized emits `<hr>`. They render identically, so an unnormalized
// export makes a rebuild's output depend on each item's provenance.
const normalizeMarkup = (text: string): string => text.replace(/<hr\s*\/>/g, '<hr>');

// Foundry does not preserve embedded-item order, and object key order drifts on every
// save. Without a canonical form, a no-op pull produces a diff of pure churn that buries
// the real edit. Arrays stay in source order except items, which are ordered explicitly.
function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'string') return normalizeMarkup(value);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
  return out;
}

// Strike benchmarks must live under every scope that rescales them: CRISPR's editor via its own
// flag, a consumer's creature services via theirs. Whichever side authored the item wins.
function mirrorItemBenchmarks(item: Record<string, any>, scopes: string[]): Record<string, any> {
  if (item.type !== 'melee') return item;
  const flags = item.flags ?? {};
  const bench = [CRISPR_FLAG, ...scopes]
    .map((scope) => flags[scope]?.[ITEM_BENCHMARK_KEY])
    .find((b) => b !== undefined);
  if (!bench) return item;
  const mirrored: Record<string, any> = { ...flags };
  for (const scope of [CRISPR_FLAG, ...scopes]) {
    mirrored[scope] = { ...mirrored[scope], [ITEM_BENCHMARK_KEY]: bench };
  }
  return { ...item, flags: mirrored };
}

export interface NormalizeTroopExportOptions {
  slug: string;
  /**
   * Consumer creature-data payloads, composed by the caller's own policy and written under
   * `flags[scope][creatureData]` after CRISPR's own flag is normalised (so they canonicalise
   * with the rest of the document).
   */
  consumerFlags?: Record<string, Record<string, unknown>>;
  /** Flag scopes strike-item benchmarks are mirrored into, besides CRISPR's own. */
  mirrorBenchmarkScopes?: string[];
}

/**
 * Turn `exportActorSource(actorId)` output into a committed troop-source document:
 * volatile world state stripped, timestamps zeroed for byte-stable rebuilds, the actor's own art
 * preserved as-is, and the CRISPR creature flag kept canonical (benchmarks and provenance).
 * Publication is deliberately left as exported so upstream `license`/`title` survive — except
 * `remaster`, forced true so remaster-filtered compendium pickers don't hide the troop.
 * Throws with an actionable message on anything unexpected.
 */
export function normalizeTroopExport(
  raw: Record<string, any>,
  opts: NormalizeTroopExportOptions
): Record<string, any> {
  const { slug, consumerFlags = {}, mirrorBenchmarkScopes = [] } = opts;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error(`invalid slug: "${slug}"`);
  if (raw?.type !== 'npc') throw new Error('body must be a full NPC actor source (exportActorSource output)');
  const level = raw.system?.details?.level?.value;
  if (typeof level !== 'number') throw new Error('actor source has no system.details.level');
  if (!Array.isArray(raw.items)) throw new Error('actor source has no items array');
  const traits: string[] = raw.system?.traits?.value ?? [];
  if (!traits.includes('troop')) {
    throw new Error('actor has no troop trait — run applyTroopToActor before exporting');
  }
  const crispr = raw.flags?.[CRISPR_FLAG]?.[CREATURE_DATA_KEY];
  if (!crispr) throw new Error(`actor has no ${CRISPR_FLAG} creature data — build it through CRISPR`);
  if (!troopSizeLabel(raw.system?.traits?.size?.value)) {
    throw new Error(`troop size must be lg/huge/grg (got "${raw.system?.traits?.size?.value}")`);
  }

  const doc = stripVolatile(structuredClone(raw));
  // Art (img, token src) is preserved as-is: it is the consumer's shipped default or a
  // user's own override. Deriving it would clobber overrides and, on any reclassification,
  // move the files out from under every already-imported copy.
  doc.prototypeToken = {
    ...(doc.prototypeToken ?? {}),
    // Committed troops are linked actors with hover names, whatever the source world had.
    displayName: 30,
    actorLink: true,
    // Source worlds scale troop art per asset; on a one-hex strategy map any
    // scale but 1 makes the token overflow its hex. autoscale has to go with it: left on,
    // PF2e derives the scale from creature size (troops are Gargantuan) and the pin below
    // never takes effect.
    texture: { ...(doc.prototypeToken?.texture ?? {}), scaleX: 1, scaleY: 1 },
    flags: {
      ...(doc.prototypeToken?.flags ?? {}),
      pf2e: { ...(doc.prototypeToken?.flags?.pf2e ?? {}), autoscale: false }
    },
    // Actors pulled from a world carry rings whose subject art lives in token modules the
    // consumer does not depend on (pf2e-tokens-*), so the reference dangles for anyone
    // without them installed.
    ring: {
      ...(doc.prototypeToken?.ring ?? {}),
      enabled: false,
      subject: { ...(doc.prototypeToken?.ring?.subject ?? {}), scale: 1, texture: null }
    }
  };
  doc.effects = doc.effects ?? [];
  resetMigration(doc.system);
  resetHealth(doc.system);
  doc.items = doc.items
    .map((item: Record<string, any>) => {
      const next = mirrorItemBenchmarks(stripVolatile(item), mirrorBenchmarkScopes);
      resetMigration(next.system);
      return next;
    })
    .sort((a: Record<string, any>, b: Record<string, any>) =>
      a.type === b.type ? String(a.name).localeCompare(String(b.name)) : String(a.type).localeCompare(String(b.type))
    );

  if (doc.system.details.publication) doc.system.details.publication.remaster = true;

  doc.flags[CRISPR_FLAG] = {
    ...doc.flags[CRISPR_FLAG],
    [CREATURE_DATA_KEY]: { ...crispr, createdAt: 0, updatedAt: 0 }
  };
  for (const [scope, data] of Object.entries(consumerFlags)) {
    doc.flags[scope] = { ...(doc.flags[scope] ?? {}), [CREATURE_DATA_KEY]: data };
  }
  return canonicalize(doc);
}
