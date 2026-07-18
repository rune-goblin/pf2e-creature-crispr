# Bug: ranged strikes are never detected, so troop volleys are dead code

`isRanged` is always `false` for any creature imported from a PF2e compendium. The volley branch of
`applyTroopConversion` therefore never fires, and every converted troop — including archers — gets a
melee sweep and nothing else.

Found while converting **Wild Hunt Archer** (`Compendium.pf2e.kingmaker-bestiary.Actor.3gtQv6Mkr7CUlG7W`)
into a troop for Reignmaker. The result was an archer whose only attack was a 5-foot melee emanation.

---

## Root cause

`src/creature-builder/services/actorQueries.ts:247`

```ts
isRanged: item.system?.traits?.value?.includes('ranged') || false,
```

This looks for a literal `ranged` trait on the strike item. **PF2e does not use one.**

Measured across the whole PF2e system source (`packs/pf2e/**/*.json`, every `type: "npc"` actor):

| | count |
|---|---|
| NPC strike items total | **12,627** |
| carrying a literal `ranged` trait | **0** |
| with `type: "ranged"` or `weaponType: "ranged"` | **0** |
| actually ranged (trait prefix `volley-` / `thrown-` / `range-`) | **1,090** |

Every NPC strike in PF2e is item type `melee`. Range is expressed by trait — `volley-30`,
`thrown-10`, `range-increment-N` — and sometimes by `system.range`.

Reproduce:

```bash
cd <pf2e-system-source>/packs/pf2e && python3 -c "
import json,glob
lit=tot=rng=0
for f in glob.glob('**/*.json',recursive=True):
    try: d=json.load(open(f))
    except: continue
    if not isinstance(d,dict) or d.get('type')!='npc': continue
    for i in d.get('items',[]):
        if i.get('type') not in ('melee','ranged'): continue
        tr=i.get('system',{}).get('traits',{}).get('value',[])
        tot+=1
        lit+= 'ranged' in tr
        rng+= any(t.startswith(('volley-','thrown-','range-')) for t in tr)
print(tot, lit, rng)"
# -> 12627 0 1090
```

## Consequence

`src/creature-builder/logic/troop.ts:175-184`

```ts
const melee  = bestStrike(creature.strikes.filter((s) => !s.isRanged));  // gets everything
const ranged = bestStrike(creature.strikes.filter((s) =>  s.isRanged));  // always []
if (melee)  { ...buildTroopSweep...  }
if (ranged) { ...buildTroopVolley... }                                   // unreachable
```

`buildTroopVolley` (`logic/troopActions.ts:192-209`) is correct and produces exactly the published
wording — `@Template[type:burst|distance:N] within M feet ... basic Reflex`. It simply never runs.

Worked example — Wild Hunt Archer's two strikes:

| Strike | item type | traits | classified |
|---|---|---|---|
| Horns +30, 3d12+12 (avg 31.5) | `melee` | agile, magical | melee ✓ |
| Living Bow +32, 3d8+12 + 1d6 cold (avg 25.5) | `melee` | deadly-d10, magical, propulsive, **volley-30** | melee ✗ |

`bestStrike` then picks on damage average, so Horns (31.5) beats the bow (25.5) and the troop's only
attack is `Horns Flurry`. An archer that fights with its head.

## Why tests did not catch it

`tests/troopActions.test.ts` and `tests/troop.test.ts` construct strikes inline with
`isRanged: true` (e.g. `strike({ name: 'Longbow', range: 150, isRanged: true })`). They exercise
`buildTroopVolley` directly and never go through `actorQueries`. The extraction layer has no test
against a real compendium actor, so the always-false path is invisible.

## The fix

`services/actorQueries.ts:247`

```ts
isRanged: item.system?.traits?.value?.some((t: string) => /^(volley|thrown|range)-/.test(t))
          || item.system?.range?.max != null,
```

Trait-first is load-bearing: of the 1,090 genuinely ranged strikes, only **137** have `system.range`
populated — range alone catches 13%.

## Target shape

**Archer Regiment** (Battlecry! pg. 174, level 12) is the reference: a real archer troop carries
*both* a ranged volley and a melee sweep.

- `Rain of Arrows` [2-actions] — 15-ft burst within 200 ft, 4d8 piercing; or 10-ft burst within
  100 ft, 6d8 piercing. DC 29 basic Reflex. Areas shrink 5 ft at 2 segments.
- `Dagger Defense` [1–3 actions] — 5-ft emanation, DC 29 basic Reflex, 2d4+2 / 4d4+12 / 4d4+15.

Same dual pattern on Line Infantry (Bolt Salvo + Clash of Steel), Woodland Scouts (Longbow Barrage +
Thicket of Blades), Dezullon Thicket (Acid Rain + Thrashing Vines). After the fix, a converted archer
should emit both actions, not one.

## Verification

1. Unit: add an `actorQueries` test over a real ranged strike shape — item type `melee`, traits
   `['deadly-d10','propulsive','volley-30']` — asserting `isRanged === true`. Add a melee counterpart
   asserting `false`.
2. Integration: import `Compendium.pf2e.kingmaker-bestiary.Actor.3gtQv6Mkr7CUlG7W`, run
   `convertActorToTroop`, assert the actor has **both** a sweep and a volley, and that the volley
   description matches `@Template[type:burst|distance:` with a `within N feet` clause.
3. Regression: a creature with only melee strikes must still emit exactly one sweep and no volley.

## Downstream

- **Reignmaker ships this defect already.** `data/troops/pixi-swarm.json`'s `Longbow Flurry` is a
  5-foot melee emanation; it should be a burst volley (cf. Woodland Scouts' Longbow Barrage).
  Regenerate after the fix.
- Blocked on this: `docs/plans/fey-host-wild-hunt-conversion.md` in `pf2e-reignmaker` — the Wild Hunt
  Archer troop is built and carries its ability layer, but its attack is wrong pending this fix.
- Worth auditing any other converted troop whose source weapon was ranged.
