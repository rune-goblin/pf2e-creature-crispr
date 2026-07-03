# Strike effective-damage guidance + attack damage-type picker

Handoff from a Reignmaker session. Scope is **CRISPR only** — RM picks up the engine
half later via `npm run sync-crispr`; ignore RM for now.

## Why

PF2e's "Building Creatures" rules publish a **Strike Damage** table and an **Area Damage**
table — there is **no persistent-damage-by-level table**. CRISPR's `PERSISTENT_DAMAGE_TABLE`
/ `getPersistentDamageForLevel` (`logic/creatureStatTables.ts`) is uncited homebrew. The
live strike calc uses it to *generate* persistent dice, and computes
`effectiveDamage = direct + persistent × 2.86` with direct already at the **full** tier — so
adding a persistent rider pushes an attack **above** its tier (persistence is "free").

Reignmaker's dev abilities-editor was already fixed to score persistent as **effective
damage** (`direct + persistent × PERSISTENT_EXPECTED_ROUNDS`) against the real Strike Damage
table — see `dev/abilities-editor/benchmarks.ts` in the pf2e-reignmaker repo as the reference
implementation. This plan brings the same correction to CRISPR's live engine + editor.

## Core philosophy (decided with the user)

**The engine guides, it never overrides.** The explicit dice + type the user enters are the
source of truth. The engine computes where that lands and the UI shows it — no trimming, no
floor, no clamping. If a "moderate" attack with a fat persistent rider computes to an extreme
strike, write it as-is and *display* "→ above Extreme." User's call to leave it.

## Engine changes — `logic/creatureStatTables.ts` (`calculateStrikeStats`)

1. **Stop sourcing persistent from `getPersistentDamageForLevel`.** Under guide-not-enforce we
   never *generate* persistent from a bare benchmark — persistent comes from the user's
   formula. Remove the homebrew-table branch from `calculateStrikeStats`. (Leave the table
   exported only if something else still needs it; otherwise delete `PERSISTENT_DAMAGE_TABLE`
   + `getPersistentDamageForLevel`. Grep first.)
2. **No trimming / no floor.** Write exactly the direct + persistent the user entered.
3. **Keep `effectiveDamageAverage`** = `directAvg + persistentAvg × PERSISTENT_EXPECTED_ROUNDS`
   as a *reported* number for the UI bar.
4. **Tier "snap" presets become suggestions, computed from the real Strike Damage table +
   the effective-damage model** (mirror RM's `benchmarks.ts`: a persistent preset for a tier
   targets `strikeTier.average / PERSISTENT_EXPECTED_ROUNDS`, optionally minus direct). Seeds a
   starting value; user pushes past it freely.

## Damage-type vocabulary — `ui/vocab.ts`

Add a canonical **Remaster damage-type** list as a grouped helper mirroring `getTraitGroups()`
→ `IwrTypeGroup[]`:
- Physical: bludgeoning, piercing, slashing
- Energy/other: acid, cold, electricity, fire, force, sonic, vitality, void
- Mental/spirit/poison: mental, spirit, poison
- `bleed` is conventionally **persistent-only** → offer on the rider, not the primary attack.

Reuse this one list for **both** the primary attack type and the persistent rider type.

## Editor UI — `ui/components/sections/OffenseSection.svelte`

1. **Add a primary-attack damage-type picker** sourced from the new vocab, mirroring the
   persistent rider's existing type selector. (Today `CreatureStrike.damageType` is a free
   string defaulting to `slashing` with no picker — this is the actual missing piece the user
   called out.)
2. **Effective-damage guidance bar:** show the strike's effective position against the Strike
   Damage tiers (incl. an "above Extreme" state) — informational, never enforced.

## Verify

- CRISPR build + tests (`logic/tests`, editor tests).
- Sanity: a moderate L9 strike + 1d6 persistent fire should *report* effective ≈ 30 → "above
  Extreme", with direct + persistent written verbatim (no auto-reduction).

## Out of scope / later

- Reignmaker sync (`npm run sync-crispr`) + RM's `strikeItemBuilder.ts` — unaffected (it just
  writes `computed.damage` / `computed.persistentDamage`).
- Optional cleanup: make explicit formula+type the sole stored authority and treat benchmark
  scalars as derived/display-only. Not required for this change.
