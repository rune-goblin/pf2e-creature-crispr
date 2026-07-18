# Shared troop abilities — working list

Extracted 2026-07-18 from all 162 troop-trait NPCs in the PF2e system source (`_pf2e-source`
`packs/pf2e/**`): every action item appearing on **two or more** troop actors, grouped by how
shareable it is. Companion to `docs/plans/troop-conversion-v2.md` (whose fact 10 records the
frequency counts); everything here is **out of scope for that plan** — this is the menu for a
later "common troop abilities" library (e.g. an ability-provider group or a `_library` compendium
pack).

Counts are "number of distinct troop actors carrying the item". "Level-baked" means the published
text embeds a DC/damage for that statblock's level — a shared version needs CRISPR's scalable
values (`@Check`/`@Damage` parsing already handles this).

Sections 1–5 curate what is *demonstrably* shared (appears on 2+ troops). The **appendix** is the
generous cut (Mark's ask): every one of the 490 non-kit, non-sweep/volley action items in the
corpus — singletons included — grouped by mechanical pattern, ⭐-flagged where the mechanic is
portable to any troop with only damage/DC rescaling.

## 1. Generic glossary passives — shareable verbatim (pure `@Localize`, zero parameters)

Embeddable as-is, same licensing position as the Defenses/Movement kit. The first three are
already handled (universal kit / Form Up option).

| Ability | Count | Type | Localize key / note |
|---|---|---|---|
| Troop Defenses | 162 | passive | `PF2E.NPC.Abilities.Glossary.TroopDefenses` — universal kit |
| Troop Movement | 162 | passive | `PF2E.NPC.Abilities.Glossary.TroopMovement` — universal kit |
| Form Up | 33 | 1a | `PF2E.NPC.Abilities.Glossary.FormUp` — kit opt-in (halves splash weakness) |
| Void Healing | 6 | passive | `PF2E.NPC.Abilities.Glossary.NegativeHealing` + Resistance/AEL rules — every undead troop |
| Shield Block | 5 | reaction | `PF2E.NPC.Abilities.Glossary.ShieldBlock` |
| Attack of Opportunity / Reactive Strike | 5+2 | reaction | `…Glossary.AttackOfOpportunity` / `…Glossary.ReactiveStrike` (legacy/remaster names) |
| Constant Spells | 5 | passive | `PF2E.NPC.Abilities.Glossary.ConstantSpells` |
| Telepathy 100 feet | 3 | passive | `PF2E.NPC.Abilities.Glossary.Telepathy` |

## 2. Formulaic, level-parameterized — shareable as scaling templates

Same wording everywhere, only DC/value varies with level. Prime candidates for a shared library
with one scalable value each.

| Ability | Count | Type | Mechanic | Rules used |
|---|---|---|---|---|
| +1 Status to All Saves vs. Magic | 9 | passive | flat status bonus | `FlatModifier` |
| Frightful Presence | 7 | passive | aura 30 ft, Will DC, frightened | `Aura` (structurally identical on all 7; DC level-baked) |
| Stench | 5 | passive | aura 30 ft, Fort DC, sickened | `Aura` |
| Raise Shields / Shields Up! | 5+2 | 1a / reaction | +2 circumstance AC (+ Reflex) until next turn | `FlatModifier`,`RollOption` |
| No Retreat | 6 | passive | forced-move distances −5 ft; fear step-down | — |
| Trample | 4 | 3a | Stride-through, basic Reflex, prone on crit fail | level-baked damage/DC |
| Reactive Attack (troop flavor) | 3 | reaction | sweep-line damage vs move/manipulate trigger | level-baked |
| Mounted Troop | 8 | passive | "animal or humanoid targeting is GM's discretion" | text varies slightly per mount |

## 3. Sweep/volley clones — already covered by the v2 generators

These are the published names for the exact grammar `buildTroopSweep`/`buildTroopVolley` emit.
Useful as a naming/flavor palette, nothing to build:

- **Sweeps (1-to-3):** Clash of Steel (6), Wild Swing (3), Disciplined Strikes (2), Mandible
  Frenzy (2), Coordinated Cutlasses (2), Strike as One (4), Shambling Onslaught (5 — the loose
  1-to-2 shambler variant), Stab from the Saddle (2 — emanation 10 lance), Brandish Bayonets!
  (2), Incinerating Grasp (2), Slashing Blades (2), Get 'em! (2).
- **Volleys (2a burst):** Bolt Salvo (6 — 3a variant), Arrow Volley (3), Javelin Barrage (3),
  Sling Barrage (2), Fire Crossbows! (3), Hurl Javelins (2), Short Salvo (2), Ready… Fire! (2),
  Aim as One (2), Divine Lance Fusillade (2).

## 4. Archetype packages — recurring bundles for later opt-in kits

Families of abilities that always travel together; a future "troop archetype" picker could seed
them as a set:

- **Loose horde** (zombie/demon mobs, 5+2 troops): share-spaces + spaces-are-difficult-terrain
  (Grave Tide / Demonic Tide), permanent Slowed 1 + no reactions (Slow), sweep loosened to
  "their squares or within 5 feet", 1-to-2 actions only.
- **Drilled formation** (Battlecry! soldier troops, 6–7 troops): Drilled in Formations (uses
  glossary `Change Formation` — `Compendium.pf2e.bestiary-ability-glossary-srd.Item.Change
  Formation` — with per-formation `FlatModifier`/`Weakness`/`ItemAlteration` rule stacks),
  No Retreat, First-class Charge (2a Stride ×2 + emanation damage).
- **Mounted** (8 troops): Mounted Troop passive, Trample, Trailblazing Stride (ignore
  difficult terrain), lance sweep at emanation 10.
- **Shield wall** (5 troops): Raise Shields / Shields Up! + Shield Block.
- **Caster troop** (10–11 troops): Troop Spellcasting (all 9 texts differ — area increase via
  `ItemAlteration`, crit riders via `Note`, damage bonuses via `FlatModifier`; pick-one design),
  Constant Spells, real spellcasting entry. (Deliberate non-goal in v2.)
- **Terrain passage one-liners** (2–3 each): Swamp Passage, Forest Passage, Sea Legs,
  Trailblazing Stride, Smoke Vision — trivial passives, near-zero cost to include in a library.
- **Threshold-triggered** (singletons but a recurring *pattern*): reactions/effects keyed to
  "reduced to 2 segments / loses a segment" (Ashen Smoke, Final Grudge, volley-area shrink) —
  the hook the v2 volley already emits.

## 5. Reprint-only (not genuinely shared)

Same statblock republished or a paired variant, not evidence of a shareable design: Sootsoldiers
×2 (Radiant Host reprint), Dwarf Longshot Squad ×2 (guns variant), Black Powder/Naval Crew,
Terra-Cotta Garrison/Planar Squadron, Marcos's Marauders/Special Forces Unit, Mercenary
Squad/Band, Boggard pair, First-Class family. Treat their abilities via §3/§4, not one-by-one.

## Appendix: Troop Ability Catalogue

This appendix inventories every non-kit troop-actor action item harvested from the Pathfinder 2e bestiary — 490 items in all — grouped by mechanical pattern as a menu of abilities that could later be ported onto other troop actors (with damage and DC rescaled to the target's level). The standard auto-generated melee **sweeps** and ranged **volleys** that every troop carries are excluded, because the conversion engine generates those from the troop's Strikes; what remains here are the bespoke, named actions worth cherry-picking. A ⭐ marks abilities that are especially portable — generic mechanics any troop archetype could adopt with only damage/DC rescaling.

### Threshold & Segment-Keyed — abilities that fire when the troop crosses a HP threshold, loses a segment, or scale with segment count (plus each troop's signature ranged barrage)

- ⭐ **Excavation** (L4, passive — Brastlewark Sapper Squad) — burrows in a 20-ft straight line, moving at half Speed
- ⭐ **Fire in the Hole!** (L4, 2a — Brastlewark Sapper Squad) — 10-ft satchel-charge burst within 30 ft, fire + bludgeoning
- ⭐ **Group Scamper** (L4, 1a — Kobold Trap Squad) — Stride +5 ft with +2 AC against reactions
- **Hail of Thorns** (L4, 2a — Fangwood Sentinel Corps) — arcing longbow volley of arrows
- ⭐ **Hasty Traps** (L4, 2a — Kobold Trap Squad) — lays rudimentary traps nearby until next turn
- ⭐ **Kernel Barrage** (L4, 2a — Corn Leshy Throng) — 30-ft cone of corn kernels, bludgeoning
- ⭐ **Rush and Steal** (L4–6, 2a — ×2 troops) — Stride twice their Speed and snatch items from foes
- ⭐ **Throw Detritus** (L4, 2a — Deluded Mob) — 10-ft bludgeoning burst thrown within 30 ft
- ⭐ **Ferocious Fall** (L5, reaction — Orc Raiding Party) — a dying segment lashes out as it falls
- **Fire Crossbows** (L5, 2a — Clockwork Runner Pack) — reload and launch a crossbow volley
- ⭐ **Goblins Burn and Goblins Char!** (L5, 2a — Goblin Get Gang) — 10-ft burst of burning torches, fire
- **Iron Rain** (L5, 2a — Orc Raiding Party) — deadly javelin volley in a burst
- **Shoot Crossbows!** (L5, 2a — City Guard Squadron) — draw/reload and fire a crossbow volley
- **Storm of Blades** (L5, 2a — Golden Erinys Novitiate Circle) — hail of thrown blades, slashing burst
- ⭐ **Coordinated Subdual** (L6, 2a — Hellknight Retrieval Unit) — follow-up grapple after a hit, grabbed + restrained
- **Hurl Javelins** (L6–15, 2a — ×3 troops) — thrown volley of spears/javelins in a burst
- **Ossuary Storm** (L6, 2a — Skeleton Mob) — hurls skulls and bone fragments in a 30-ft burst
- **Rain of Ruin** (L6, 2a — Devastation Cavalry Brigade) — reloaded crossbow volley
- **Reflective Arrows** (L6, 2a — Qadiran Camel Corps) — sun-angled shortbow arcing volley
- ⭐ **You're Coming with Us** (L6, free — Hellknight Retrieval Unit) — drags grabbed/restrained captives along when Striding
- ⭐ **Blaze of Glory** (L7, 3a — Oprak Firestorm Battalion) — at 2 segments, detonates in a final explosion
- ⭐ **Grasping Mandibles** (L7, 1a — Giant Ant Army) — follow-up grab after a failed save, grabbed + restrained
- ⭐ **Hark! The Goblins Chanters Sing!** (L7, 2a — Stumpfield War Chanter Choir) — song stupefies several enemies
- **Launch Slings!** (L7, 2a — Bandit Gang) — volley of sling bullets within 50 ft
- **Muster Animals** (L7, 2a — Umok Beastspeaker Circle) — summons wild animals to attack a burst
- **Poisoned Bolts** (L7, 2a — Ratfolk Shank Squad) — hand-crossbow volley of poisoned bolts
- **Rain of Fire** (L7, 2a — Oprak Firestorm Battalion) — alchemical bombs rain down in a burst
- ⭐ **Surround Prey** (L7, 2a — Deinonychus Pack) — Strides to flank a target with multiple segments
- **Acid Spray** (L8, 2a — Fleshwarp Amalgam) — combined stream of acid spray
- ⭐ **Bad Deal** (L8, 2a — Halfling Lucky Draw) — mocking Harrow readings that curse several foes
- ⭐ **Brutal Retaliation** (L8, reaction — Fleshwarp Amalgam) — lashes out when a segment is lost to a threshold
- **Fire Longbows!** (L8, 2a — Arrester Squadron) — coordinated longbow volley against a burst
- ⭐ **Repel Boarders!** (L8, 1a — ×2 troops) — Athletics shove pushing foes in one direction
- **Snap Shot** (L8, 2a — Twilight Talon Infiltrator Team) — concealed hand-crossbow bolt volley
- **Storm of Daggers** (L8, 2a — Charau-ka Shrieker Crew) — barrage of thrown daggers
- ⭐ **Bind Them in Chains** (L9, reaction — Hellknight Dragoon Squad) — chains a frightened/reduced foe, clumsy + immobilized + restrained
- ⭐ **Break the Weak Link** (L9, passive — Hellknight Dragoon Squad) — 10-ft aura, −2 penalty to enemy troops while at 3+ segments
- ⭐ **Catch and Release** (L9, 2a — Gargoyle Wing) — mass grapple of Large-or-smaller foes, grabbed + restrained
- ⭐ **Final Grudge** (L9, reaction — Wight Battalion) — strikes every nearby enemy as it loses a segment
- ⭐ **Overrun** (L9, 3a — Hobgoblin Veteran Regiment) — Strides double Speed, crushing enemies in its path
- ⭐ **Ravenous Winds** (L9, 2a — Gale Frenzy) — each segment pulls a different target closer
- **Ready... Fire!** (L9, 2a — ×2 troops) — combined bow/crossbow/sling volley
- ⭐ **Stop Where You Are** (L9, 2a — Dottari Excruciator Division) — hindering-bolt volley, immobilized
- ⭐ **Blood Soak** (L10, free — Redcap Brigade) — triggered by first segment loss or spilled blood for a buff
- **Bolts from the Blue** (L10, 2a — Dwarf Longshot Squad) — reloaded crossbow volley
- **Bullets from the Blue** (L10, 2a — Dwarf Longshot Squad (Guns)) — reloaded rifle volley
- ⭐ **Mucus Deluge** (L11, 2a — Zecui Horde) — larva-infested mucus volley, immobilized
- ⭐ **Shard Volley** (L11, 2a — Pelegox Cube) — magnetized metal fragments in a 30-ft burst
- ⭐ **Spinning Stones** (L11, 2a — Avalanche Legion) — spins in place kicking up a barrage of stones
- **Unleash Hell** (L11, 2a — Thrune Champion Army) — reloaded longbow volley
- ⭐ **Windstorm** (L11, 2a — Blustering Gale) — powerful windstorm burst within 100 ft, prone
- ⭐ **Admonishing Hymn** (L12, 2a — Angelic Chorus) — reality-shaking sung note, deafened
- ⭐ **Call Down the Storm** (L12, 2a — Druid Circle) — summons wind and lightning in a burst within 80 ft
- **Rain of Arrows** (L12, 2a — Archer Regiment) — coordinated longbow volley
- ⭐ **Vigor of the Damned** (L12, 1a — Hellbound Honor Guard) — self-buff when reduced to 2 segments
- ⭐ **Walkena's Radiance** (L12, 2a — Sun Warrior Brigade) — white-hot burst, blinded + dazzled
- ⭐ **Drake Breath** (L13, 2a — Drake Flight) — combined breath-weapon burst
- ⭐ **Hell's Call** (L13, passive — Brimstone Corps) — never attempts a rout check
- ⭐ **Pestilent Wheeze** (L14, 2a — Leukodaemon Plague) — 30-ft cone of disease-flies, piercing, sickened
- ⭐ **Qi Blast** (L14, 2a — Monk Cadre) — channeled energy explosion in a burst within 60 ft
- ⭐ **Shield Block** (L14, reaction — Pageant Troupe) — reduces damage at segment thresholds
- **Acid Rain** (L15, 2a — Dezullon Thicket) — ranged cascade of acidic digestive juices
- **Dagger Volley** (L15, 2a — Einherji Host) — cone-shaped volley of thrown daggers
- ⭐ **Mass Improved Grab** (L15, free — Dezullon Thicket) — auto-grabs foes that fail against its vines
- **Offal Rain** (L15, 2a — Ofalth Stampede) — hurls rotting trash raining down in a burst
- ⭐ **Regrowth** (L15, passive — Dezullon Thicket) — regeneration restores a lost segment above a threshold
- **Crossbow Array** (L16, 2a — House Thrune Elite Infantry) — barrage salvo from its crossbows
- ⭐ **Fearless Switch** (L16, 2a — Archon Bastion) — Strides to swap places with a willing ally
- ⭐ **Hell's Will** (L16, passive — House Thrune Elite Infantry) — improves rout-check success by one step at 4 segments
- ⭐ **Divine Devastation** (L18, passive — Divine Warden Army) — divine energy erupts on each segment loss, enfeebled + stupefied
- **Hail of Arrows** (L19, 2a — Raised Cavalry) — reloaded shortbow volley
- ⭐ **Shuffle Forces** (L19, passive — Raised Cavalry) — undead composition grants resistance 20

### Reactions — triggered responses to enemy movement, attacks, or the troop's own falling

- ⭐ **Opportunistic Halt** (L5, reaction — Golden Erinys Novitiate Circle) — strikes a foe that moves within 5 ft
- ⭐ **Duck, Duck, Loose!** (L6, reaction — Stumpfield War Saboteurs) — scrambles to cover against a Strike/Reflex effect, slowed
- ⭐ **Reactive Strike** (L6, reaction — ×2 troops) — glossary reactive strike against a triggering action
- ⭐ **Shield Block** (L6–15, reaction — ×4 troops) — glossary shield block reduces incoming damage
- ⭐ **Shields Up!** (L6, reaction — Dwarf Battalion) — +2 AC and Reflex until next turn
- ⭐ **Stampede** (L7, reaction — Aurochs Herd) — Tramples away when HP drops below a threshold, prone
- ⭐ **Hellish Revenge** (L8, reaction — Hell Hound Pack) — a critical hit recharges its Hellfire Breath
- ⭐ **Attack of Opportunity** (L9–19, reaction — ×5 troops) — glossary attack of opportunity
- ⭐ **Death From Above** (L9, reaction — Gargoyle Wing) — swoops down on a creature moving below while flying
- ⭐ **Long Arm of the Law** (L9, reaction — Dottari Excruciator Division) — strikes a foe leaving an adjacent square
- ⭐ **Reactive Attack** (L9–10, reaction — ×3 troops) — strikes on a nearby manipulate/move/ranged action
- ⭐ **Deadly Swipes** (L10, reaction — Redcap Brigade) — extra attack after dropping a foe to 0 HP
- ⭐ **In the Shade** (L11, reaction — Sylirican Phalanx) — responds to a ranged/area attack it resists
- ⭐ **Reactive Sweep** (L11, reaction — Clockwork Infantry) — sweep against an enemy's triggering action
- ⭐ **Sacrifice** (L12, reaction — Viking Guard) — intercepts a hit aimed at its adjacent charge
- ⭐ **Opportunistic Strikes** (L12, reaction — Hellbound Honor Guard) — strikes on a nearby manipulate/move/ranged action
- ⭐ **Reactive Relocation** (L13, reaction — Vanth Guardian Flock) — dimension-doors away after being hit
- ⭐ **Stygian Guardian** (L13, reaction — Infernal Tide) — intercepts an attack on a nearby ally or object
- ⭐ **Pin It Down** (L15, reaction — Hellknight Hunter Squad) — strikes an adjacent foe's manipulate/move action
- ⭐ **Archon's Aegis** (L16, reaction — Archon Bastion) — grants an ally resistance when damaged nearby
- ⭐ **Absorb Weapon** (L17, reaction — Omox Slime Pool) — disarms a creature that hits it with a melee weapon
- ⭐ **Bolster the Wounded** (L17, reaction — Valkyrie Tempest) — heals itself at end of turn if below max HP
- **Troop Counterspell** (L18, reaction — Lich Legion) — expends a prepared spell to counter a cast spell

### Stride-Attacks (trample / overrun / charge family) — movement that deals damage or knocks foes down along the path

- ⭐ **Sharpened Advance** (L4, 2a — Xulgath Ravening) — ranged piercing burst within 50 ft
- ⭐ **Break Through** (L5, 3a — Orc Raiding Party) — Strides twice, passing through enemy gaps
- ⭐ **Raptor Leap** (L5, 1a — Velociraptor Pack) — Strides ignoring difficult terrain
- ⭐ **War Pounce** (L5, 1a — Clockwork Runner Pack) — Strides ignoring difficult terrain
- ⭐ **Charge the Fallen** (L6, 2a — Dromaar Company) — Strides twice sweeping with axes, slashing, prone
- ⭐ **Clear Cut** (L6, 3a — Twigjack Bramble) — Forms Up and swarms through foes with thorns, prone
- ⭐ **Haul Away** (L7, 1a — Giant Ant Army) — Strides dragging a restrained captive, encumbered + restrained
- ⭐ **Mounted Charge** (L7, 3a — Iriatykian Outrider Band) — Strides twice with +10 ft Speed, charge damage
- ⭐ **Puncturing Charge** (L7, 2a — Aurochs Herd) — Strides to a foe and delivers a Horn Strike
- ⭐ **Thunder of Hooves** (L7, 1a — Heavy Cavalry) — Strides then follows with Athletics or an attack
- ⭐ **Lance Charge** (L8, 3a — Hellknight Cavalry Brigade) — Strides twice with +10 ft Speed, charge damage
- ⭐ **Rock the Boat** (L8, 2a — ×2 troops) — pitches the ship to knock foes prone
- ⭐ **Shrieking Charge** (L8, 2a — Charau-ka Shrieker Crew) — Strides twice, charge damage, deafened
- ⭐ **Bash It Down** (L9, 2a — Dottari Excruciator Division) — coordinated shield shove outward
- ⭐ **Shoving Shield Wall** (L9, 2a — Arboreal Copse) — Strides, damaging every foe in its path
- ⭐ **Bowl Over and Stomp** (L10, 2a — Redcap Brigade) — Strides through Medium foes' spaces, damage, prone
- ⭐ **Burning March** (L10, 2a — Vordine Legion) — Strides leaving lingering burning hoofprints
- ⭐ **Phalanx Charge** (L11, 2a — Skeleton Infantry) — Strides in a straight line with longspears, prone
- ⭐ **Wavecrash** (L11, 3a — Elven Waverider Troop) — rides a conjured wave double Speed over foes
- ⭐ **Stupefying Swipe** (L12, 2a — Protean Tumult) — Strides then lashes out, stupefied
- ⭐ **First-class Charge** (L13, 2a — ×5 troops) — Strides double Speed then attacks each foe reached
- ⭐ **Speed Surge** (L13, 1a — Drake Flight) — Strides or Flies twice
- ⭐ **Run Them Over!** (L15, 3a — Hana's Hundreds) — Forms Up and Strides twice trampling through Medium foes, prone
- ⭐ **Cloven Charge** (L16, 2a — House Thrune Elite Infantry) — Strides double Speed then attacks
- ⭐ **Trampling Charge** (L19, 3a — Raised Cavalry) — Strides twice with +10 ft Speed, trampling, prone

### Auras — passive emanations that debuff, frighten, sicken, or buff allies within range

- ⭐ **Aura of Argumentation** (L4, passive — Bureaucrat Mob) — Will save or confused within 30 ft
- ⭐ **Stench** (L4–15, passive — ×5 troops) — Fortitude save on entry or sickened (and slowed at higher DCs)
- ⭐ **Goblins Chant and Goblins Sing!** (L5, passive — Goblin Get Gang) — disharmony disrupts concentration nearby
- ⭐ **Crushing Despair** (L6, passive — Devastation Cavalry Brigade) — Will save or frightened + slowed on entry
- ⭐ **In Our Wake, Hell Will Break!** (L7, passive — Stumpfield War Chanter Choir) — sung buff to allied creatures in the aura
- ⭐ **Bullying Bluster** (L11, passive — Blustering Gale) — taunts enemies entering the aura, stupefied
- ⭐ **Frightful Presence** (L12–18, passive — ×7 troops) — glossary frightful presence, frightened
- ⭐ **Harmonizing Aura** (L12, passive — Angelic Chorus) — allies gain +2 sonic damage and +1 AC/saves
- ⭐ **Heavy Aura** (L13, passive — Infernal Tide) — creatures in the aura become encumbered
- ⭐ **Saline Crust** (L13, passive — Saltborn Stalkers) — fouls surrounding water while submerged
- ⭐ **Staggering Servitude** (L15, passive — Sacristan Scourge) — overwhelming vision at end of turn, stunned
- ⭐ **Infectious Aura** (L14, passive — Leukodaemon Plague) — −2 save penalty against disease within 30 ft
- ⭐ **Quicken Pestilence** (L14, 1a — Leukodaemon Plague) — forces a disease in its aura to bloom faster
- ⭐ **Spores of Wrath** (L16, passive — Wrath Riot) — poison damage to non-demons starting turn in a 5-ft aura
- ⭐ **Riotous Parade** (L19, passive — Dancing Night Parade) — sweeps nearby creatures into celebration, Will save, slowed
- ⭐ **Aura of Righteousness** (L20, passive — Angelic Host) — allies gain +2 AC/saves against unholy creatures

### Condition-Appliers (non-aura) — active actions whose primary payoff is inflicting a condition on foes

- ⭐ **Hobble Pursuit** (L4, 2a — Goblin Rabble) — 5-ft emanation hamstring, slowed
- ⭐ **Undermine** (L4, 3a — Brastlewark Sapper Squad) — collapses the earth underground, prone
- ⭐ **Pain Points** (L5, 1a — Golden Erinys Novitiate Circle) — targeted strikes cause clumsy
- ⭐ **Bola Barrage** (L6, 2a — Hellknight Retrieval Unit) — 15-ft cone of nonlethal bolas, prone
- ⭐ **Bola Hurl** (L6, 1a — Dromaar Company) — 15-ft cone of bolas, bludgeoning, prone
- ⭐ **Chorus of Croaks** (L6–10, 1a — ×2 troops) — terrifying croak within 30 ft, frightened
- ⭐ **Coordinated Tongue Pull** (L6, 1a — Boggard Scouting Party) — tongues grapple and pull a foe closer, grabbed + immobilized
- ⭐ **Dust Storm** (L6, 1a — Qadiran Camel Corps) — Steps while whipping up a sand cloud, concealed
- ⭐ **Dwarven War Song** (L6, 1a — Dwarf Battalion) — 30-ft emanation battle song, frightened
- ⭐ **Slapstick Traps** (L6, 2a — Stumpfield War Saboteurs) — falling-obstacle traps after Hiding, prone
- ⭐ **Trample** (L6–13, 3a — ×3 troops) — moves over smaller foes, basic Reflex, prone on failure
- ⭐ **Arcane Explosion** (L7, 3a — Gnome Cannon Corps) — cannon blast, dazzled
- ⭐ **Dirty Tricks** (L7, 2a — Ratfolk Shank Squad) — 5-ft emanation feint/trip, clumsy
- ⭐ **Overwhelm** (L7, 2a — Giant Ant Army) — swarms and pins a grabbed Large foe, grabbed + restrained
- ⭐ **Frightful Chorus** (L8, 2a — Ghostly Mob) — anguished wail at living hearers, frightened
- ⭐ **Seize Them!** (L8, 1a — Arrester Squadron) — 5-ft emanation tackle, grabbed + restrained
- ⭐ **Distracting Whispers** (L9, 2a — Gale Frenzy) — cacophony of taunts and lies, stupefied
- ⭐ **Push Back** (L9, 1a — Hryngar Breccia Squad) — shoves adjacent foes with raised shields, prone
- ⭐ **Bullet Smog** (L10, 2a — Dwarf Longshot Squad (Guns)) — rapid rifle fire creates a smoke cloud, concealed
- ⭐ **Denounce Divinity** (L10, 2a — Pure Legion Regiment) — decries a deity's authority, frightened + stupefied
- ⭐ **Incinerating Grasp** (L10, 1a — ×2 troops) — fiery clutches on each foe within 5 ft, grabbed
- ⭐ **Seething Flash** (L10, 1a — ×2 troops) — Forms Up and Strides twice, then a wave of fire, prone
- ⭐ **Tongue Lashing** (L10, 2a — Boggard Dreadknot) — 15-ft emanation tongue grab, grabbed + immobilized
- ⭐ **War Shriek** (L10, 1a — Sedacthy Warband) — 30-ft emanation battle cries, frightened + immobilized
- ⭐ **Entrancing Shapes** (L11, 2a — Pelegox Cube) — impossible geometric patterns in a cone, fascinated + stupefied
- ⭐ **Guard Charge** (L11, 1a — Viking Guard) — designates an ally as a buffed charge, frightened
- ⭐ **Trample into the Earth** (L11, 3a — Avalanche Legion) — runs foes over with stone bodies, prone
- ⭐ **Wrath of Asmodeus** (L11, 1a — Thrune Champion Army) — empowers its next Massacre, frightened + stupefied
- ⭐ **Drown** (L13, 2a — Infernal Tide) — conjures water in a cone to flood lungs, sickened + unconscious
- ⭐ **Guardians' Curse** (L13, 2a — Vanth Guardian Flock) — 5-ft emanation curse on enemies, stupefied
- ⭐ **Lightlure** (L13, 1a — Saltborn Stalkers) — entrancing luminescent light show, dazzled + fascinated
- ⭐ **Salty Clutch** (L13, 1a — Saltborn Stalkers) — grabs foes and drags them underwater, grabbed + restrained
- ⭐ **Blazing Admonition** (L14, 2a — Nightmarchers) — 60-ft cone of scorching heat, fire, prone
- ⭐ **Focus Gaze** (L15, 1a — Sacristan Scourge) — staring gaze forces a Will save, stupefied
- ⭐ **Shadow Scream** (L15, 3a — Sacristan Scourge) — chorus of ghastly void-wailing, confused + deafened
- ⭐ **Smothering Grasp** (L17, 1a — Omox Slime Pool) — smothers a grabbed foe, blinded + grabbed + restrained
- ⭐ **Frightful Battle Cry** (L20, 2a — Last Guard) — 60-ft cone bellow, sonic, frightened
- ⭐ **Spectral Charge** (L20, 3a — Last Guard) — Flies double Speed through foes, void damage, drained

### Remaining Active Actions — the rest of the troop toolkit: breaths, self-buffs, formation shifts, focused strikes, utility

- **Fire Crossbows!** (L2–14, 2a — ×3 troops) — draw/reload and launch a crossbow volley
- ⭐ **Dragonhide** (L3, 1a — Speiroikos) — grows scaly hide for a self AC bonus
- **Hurl Axes** (L4, 2a — Besieged Logging Crew) — thrown hatchet volley
- ⭐ **Leaping Charge** (L4, 1a — Mitflit Vermin Cavalry) — Leaps 30 ft, charge damage if it moves 15+ ft
- ⭐ **Orate** (L4, 1a — Bureaucrat Mob) — sonic damage to any hearer within 30 ft
- ⭐ **Thus Always to Tyrants** (L4, free — Fangwood Sentinel Corps) — bonus when it drops a higher-level foe
- ⭐ **Disarming Twist** (L5, 1a — Shackles Pirate Crew) — follow-up disarm after a damaging Strike
- ⭐ **Down to Our Level** (L5, 2a — Bill-Band) — gets underfoot to trip up opponents
- ⭐ **Acid Breath** (L6, 2a — Scamp Flood) — 15-ft cone, acid
- ⭐ **Drilled in Formations** (L6–13, 1a — ×7 troops) — uses Change Formation for free
- ⭐ **Flame Breath** (L6, 2a — Scamp Inferno) — 15-ft cone, fire
- ⭐ **Harry Prey** (L6, 2a — Wolf Pack) — focuses all bites on one adjacent foe
- ⭐ **Identify Targets** (L6, 1a — Hellknight Retrieval Unit) — Seeks in a 30-ft burst and Points Out up to three
- ⭐ **Mass Bramble Jump** (L6, 3a — Twigjack Bramble) — Forms Up in undergrowth then teleports
- ⭐ **Pacify** (L6, 1a — Hellknight Retrieval Unit) — makes its next attack nonlethal
- ⭐ **Perfect Formation** (L6, 1a — Hobgoblin Battalion) — +2 AC and Reflex against explosions
- ⭐ **Pollen Breath** (L6, 2a — Scamp Tangle) — 15-ft cone, poison
- ⭐ **Rain of Splinters** (L6, 2a — Twigjack Bramble) — splinter-and-bramble volley in a burst
- ⭐ **Rend Flesh** (L6, 2a — Xulgath Army) — concentrates attacks on one adjacent enemy
- ⭐ **Scree Breath** (L6, 2a — Scamp Avalanche) — 15-ft cone, bludgeoning
- ⭐ **Shields Up!** (L6, 1a — Phalanx Formation) — +2 AC and Reflex until next turn
- ⭐ **Shrapnel Breath** (L6, 2a — Scamp Shrapnel) — 15-ft cone, slashing
- ⭐ **Sirocco Breath** (L6, 2a — Scamp Whirlwind) — 15-ft cone, slashing
- ⭐ **Chant of Dominance** (L7, 1a — Orc Skullcrushers) — chant penalizes creatures it damages
- ⭐ **Circle of Horns** (L7, 1a — Aurochs Herd) — protective ring formation for +2 AC
- ⭐ **Close Ranks** (L7, 1a — Oprak Firestorm Battalion) — +2 AC and Reflex against explosions and attacks
- ⭐ **Direct Hit** (L7, 2a — Gnome Cannon Corps) — single-target cannon shot, bludgeoning
- ⭐ **Shatter Shadows** (L7, 2a — Iriatykian Outrider Band) — dispels magical darkness
- ⭐ **Stand and Deliver!** (L7, 1a — Bandit Gang) — Demoralizes up to four creatures
- ⭐ **Among the Trees** (L8, 1a — Woodland Scouts) — disperses among forest trees
- ⭐ **Coordinated Step** (L8, 1a — Arrester Squadron) — Steps twice
- ⭐ **Hellfire Breath** (L8, 1a — Hell Hound Pack) — bathes the battlefield in hellish fire
- ⭐ **Raise Shells** (L8, 1a — Harvest Regiment) — shell shields grant +2 AC
- **Seed Volley** (L8, 2a — Harvest Regiment) — volley of hard seeds
- ⭐ **Sweep the Area** (L8, 1a — Arrester Squadron) — Seeks across a burst or cone
- ⭐ **Boarding Grapple** (L9, 3a — Hellknight Sea Brigade) — grappling-hook volley from a ship
- **Bolt Barrage** (L9, 2a — Hryngar Breccia Squad) — crossbow volley
- ⭐ **Fear the Chain** (L9, 1a — Hellknight Dragoon Squad) — Demoralizes all foes in a 15-ft emanation
- ⭐ **Hobgoblin Phalanx** (L9, 1a — Hobgoblin Veteran Regiment) — raises shields for +2 AC to allies
- ⭐ **Raise Shields** (L9–15, 1a — ×5 troops) — Raise a Shield for +2 AC (and Reflex)
- ⭐ **Spoils of War** (L9, 1a — ×2 troops) — steals from foes after a successful volley
- ⭐ **Bash Heads** (L10, 2a — Watchmage Squadron) — 5-ft emanation fists, bludgeoning
- ⭐ **Change Shape** (L11, 1a — Leshy Mob) — transforms into a spread of small plants
- ⭐ **Collective Swarm** (L11, 2a — Rancorous Druids) — casts Swarm Form to become tiny insects
- ⭐ **Form a Phalanx** (L11, 1a — Skeleton Infantry) — raises shields for +2 AC to allies
- ⭐ **Harden Chitin** (L11, 1a — Zecui Horde) — metallic shells grant resistance 10 self-buff
- **Rain of Seeds** (L11, 2a — Leshy Mob) — volley of stones, spores, and explosive seeds
- ⭐ **Raise Defenses** (L11, 1a — Clockwork Infantry) — extends external plates for +AC
- ⭐ **Subterranean Ambush** (L11, 1a — Zecui Horde) — bursts from a burrowed ambush position
- ⭐ **Chaos Strike** (L12, free — Protean Tumult) — its damage bypasses adamantine/cold iron/silver resistances
- ⭐ **Aim as One** (L13–15, 2a — ×2 troops) — ranged burst within 100 ft, piercing/untyped
- ⭐ **Cosmic Explosion** (L13, 2a — Soul Swarm) — burst of burning sunlight or moonlight
- ⭐ **Light Reflection** (L13, 2a — Gold Defender Garrison) — reshapes skin into a reflective surface
- ⭐ **Trample** (L13, 3a — Xulgath Dinosaur Cavalry) — moves over Large-or-smaller foes, basic Reflex
- ⭐ **Coordinated Maneuvers** (L14, 2a — Monk Cadre) — mass disarm/grapple/reposition
- **Missile Volley** (L14, 2a — Nightmarchers) — hail of spears and stones, untyped
- ⭐ **Striking Koa** (L14, 1a — Nightmarchers) — emanation melee with spears/clubs/leiomano
- ⭐ **Constrict** (L15, 1a — Dezullon Thicket) — glossary constrict, bludgeoning
- ⭐ **Disciplined Barricade** (L15, 1a — Hellknight Hunter Squad) — locked shields grant AC to troop and allies
- ⭐ **Medic!** (L15, 1a — Hellknight Hunter Squad) — heals an adjacent creature
- ⭐ **Pay For Every Inch** (L15, 3a — Einherji Host) — Forms Up, Raises Shields, prepares a counterattack
- ⭐ **Planar Step** (L15, 1a — Planar Terra-cotta Squadron) — teleports within 90 ft via the Material Plane
- **Rain of Knives** (L15, 2a — Hana's Hundreds) — thrown-knife volley in a burst
- ⭐ **Root** (L15, 1a — Dezullon Thicket) — disguises itself as ordinary pitcher plants
- ⭐ **Song of Freedom** (L15, 1a — Einherji Host) — bolsters morale for a Will-save bonus
- ⭐ **Living Shields** (L16, 1a — Archon Bastion) — grants allies in a 5-ft emanation +2 AC
- ⭐ **Tempest of Battle** (L17, 2a — Valkyrie Tempest) — calls down a lightning storm in a 60-ft emanation
- ⭐ **Seiya! Soiya!** (L19, 2a — Dancing Night Parade) — call-and-response burst, sonic + mental

### Remaining Passives — always-on traits: movement quirks, resistances, senses, spellcasting, death effects, morale

- ⭐ **Grave Tide** (L2–9, passive — ×5 troops) — disorganized: moves through and shares creatures' spaces
- ⭐ **Slow** (L2–9, passive — ×5 troops) — permanently slowed 1 and can't use reactions
- ⭐ **Diverted Fury** (L3, passive — Speiroikos) — a nearby creature can redirect its aggression against its own numbers
- **Unseasonable Cold** (L3, passive — Beiran Frosthunt) — temperature drops for a quarter mile around it
- ⭐ **Untrained Rabble** (L3, passive — Conscript Squad) — Will save each turn or confused
- ⭐ **–2 Circumstance to All Saves vs. Fear** (L3, passive — Conscript Squad) — penalty to saves against fear
- ⭐ **Demolition Expertise** (L4, passive — Brastlewark Sapper Squad) — offense ignores the first 5 Hardness of objects
- ⭐ **Encircling Maze** (L4, passive — Corn Leshy Throng) — moves through spaces and blocks foes' vision
- ⭐ **Infected Wounds** (L4, passive — Xulgath Ravening) — +1d6 poison to creatures its stench sickened
- **Irrational** (L4, passive — Deluded Mob) — Diplomacy checks against it take penalties
- ⭐ **Mounted Troop** (L4–13, passive — ×8 troops) — effects targeting only animals/humanoids may fail
- ⭐ **Surrounded** (L4, passive — Deluded Mob) — fights more recklessly while flanked
- ⭐ **Vengeful Wrath** (L4, passive — Mitflit Vermin Cavalry) — +2 damage while not frightened
- ⭐ **Verdant Burst** (L4–11, passive — ×2 troops) — dying/shrinking releases primal healing energy
- ⭐ **Victim Complex** (L4, passive — Deluded Mob) — losing members bolsters its resolve
- ⭐ **Void Healing** (L4–20, passive — ×6 troops) — glossary negative healing (healed by void, harmed by vitality)
- ⭐ **+3 Status vs. Intimidation Checks** (L5, passive — Bill-Band) — bonus against Intimidation
- ⭐ **City Passage** (L5, passive — City Guard Squadron) — ignores crowd/alleyway difficult terrain
- ⭐ **Clique Spellcasting** (L5, passive — Apprentice Magician Clique) — pools members' arcane power, stupefied on crit fail
- ⭐ **Faceless Horde** (L5, passive — Ort Mob) — disorganized: moves through creatures' spaces
- **Goblins Bound and Goblins Swing!** (L5, passive — Goblin Get Gang) — can move only when it took a hostile action
- ⭐ **Keen Eyes** (L5, passive — Bill-Band) — +2 Seek to find hidden/undetected creatures
- ⭐ **Overwhelming Scrum** (L5, passive — Bill-Band) — disorganized: moves through creatures' spaces
- ⭐ **Puff Up** (L5, passive — Velociraptor Pack) — ignores the size penalty to Demoralize
- ⭐ **Seek Quarry** (L5, passive — ×2 troops) — designates a described creature for a tracking bonus
- **Subservience** (L5, passive — Ort Mob) — can be commandeered by nearby devils
- ⭐ **Unholy Quickness** (L5, passive — Golden Erinys Novitiate Circle) — +2 AC against ranged attacks
- ⭐ **Urban Chasers** (L5, passive — Angry Townsfolk) — ignores crowd/alleyway difficult terrain
- **Wind-Up** (L5–11, passive — ×2 troops) — must be wound with a key to act
- ⭐ **Astride a Red Horse** (L6, passive — Devastation Cavalry Brigade) — ignores all difficult terrain on land
- ⭐ **Desert-Adapted Troop** (L6, passive — Qadiran Camel Corps) — treats environmental heat as one step less severe
- ⭐ **Dwarven Doughtiness** (L6, passive — Dwarf Battalion) — reduces its frightened value at end of turn
- ⭐ **Fast Healing (elemental)** (L6, passive — ×6 Scamp troops) — fast healing while in the scamp's element (air/fire/metal/plants/underground/water)
- ⭐ **Fog Vision** (L6, passive — Scamp Whirlwind) — ignores concealment from fog
- ⭐ **No Retreat** (L6–13, passive — ×6 troops) — can't be forced to move or flee, fleeing + slowed
- ⭐ **Smoke Vision** (L6–10, passive — ×3 troops) — ignores concealment from smoke
- ⭐ **Swamp Passage** (L6–10, passive — ×2 troops) — ignores swamp difficult terrain
- ⭐ **Trailblazing Stride** (L6–8, passive — ×2 troops) — ignores nonmagical difficult terrain on land
- ⭐ **Troop Spellcasting** (L6–20, passive — ×10 troops) — pools members into a more powerful spell
- ⭐ **+2 Status Bonus to all saves vs. darkness and shadow** (L7, passive — Iriatykian Outrider Band) — save bonus vs darkness/shadow
- ⭐ **Animal Empathy** (L7, passive — Umok Beastspeaker Circle) — can Diplomacy and converse with animals
- ⭐ **Elusive Target** (L7, passive — Iriatykian Outrider Band) — +1 AC and Reflex against attacks
- ⭐ **Forest Passage** (L7–8, passive — ×2 troops) — ignores plant/fungi difficult terrain
- ⭐ **Giant Ant Venom** (L7, passive — Giant Ant Army) — poison, enfeebled
- ⭐ **Lie in Wait** (L7, passive — Bandit Gang) — 10 minutes of prep grants +2 initiative
- ⭐ **Predator's Advantage** (L7, passive — Deinonychus Pack) — bleeding foes take −2 Reflex against its attacks
- ⭐ **Sudden Ambush** (L7, passive — Bandit Gang) — free Stand and Deliver on a stealth initiative
- ⭐ **Construct Armor** (L8, passive — Animated Army) — Hardness reduces incoming damage
- ⭐ **Faces in the Crowd** (L8, passive — Twilight Talon Infiltrator Team) — blends into and disperses among crowds
- ⭐ **Juice Shower** (L8, passive — Harvest Regiment) — crit hit / crit-failed save splashes sticky juice, concealed
- ⭐ **Many-Limbed Stride** (L8, passive — Fleshwarp Amalgam) — ignores nonmagical difficult terrain on land
- ⭐ **Now!!** (L8, passive — Twilight Talon Infiltrator Team) — ambush trigger while disguised
- ⭐ **Rejuvenation** (L8–20, passive — ×2 troops) — re-forms fully healed days after being destroyed
- ⭐ **Sea Legs** (L8–9, passive — ×3 troops) — ignores uneven ground/penalties from a moving ship
- **Site Bound** (L8, passive — Ghostly Mob) — can't stray far from where it was killed
- ⭐ **Stealthy Formation** (L8, passive — Woodland Scouts) — stays hidden/undetected more easily
- ⭐ **Troop Harrowing** (L8, passive — Halfling Lucky Draw) — Harrow reading rider on single-target spells, frightened
- ⭐ **Undercover** (L8, passive — Twilight Talon Infiltrator Team) — prep time lets it impersonate a group
- ⭐ **+2 Circumstance Bonus to Saves vs Fear Effects** (L9, passive — Hellknight Dragoon Squad) — save bonus vs fear
- ⭐ **Status Bonus to All Saves vs. Magic** (L9–18, passive — ×10 troops) — +1 or +2 status bonus to saves against magic
- ⭐ **Corrupting Spite** (L9, passive — Wight Battalion) — attacks curse foes to grow weak, clumsy + drained
- ⭐ **Fueled by Spite** (L9, passive — Wight Battalion) — gains temp HP from its curse's damage
- ⭐ **Light Blindness** (L9, passive — Hryngar Breccia Squad) — glossary light blindness
- ⭐ **Putrid Plague** (L9, passive — Gale Frenzy) — its sickened/unconscious conditions are worsened
- **Sin Scent** (L9, passive — Sinswarm) — smells creatures reflecting a chosen sin
- ⭐ **Sinful Bite** (L9, passive — Sinswarm) — bite forces a Will save vs sinful thoughts
- ⭐ **Watchful** (L9, passive — Hobgoblin Veteran Regiment) — can't be made flat-footed
- ⭐ **Ashen Smoke** (L10, passive — ×2 troops) — segment loss / death makes a concealing (or dazzling) ash cloud
- ⭐ **Divine Revulsion** (L10, passive — Redcap Brigade) — brandished religious symbols frighten it
- ⭐ **Fast Healing** (L10–12, passive — ×2 troops) — regains HP each turn
- ⭐ **Invisibility Scan** (L10, passive — Watchmage Squadron) — invisibility can't hide creatures from it
- **Nonbelievers** (L10, passive — Pure Legion Regiment) — one degree better on saves vs divine effects
- ⭐ **Sea Speech** (L10, passive — Sedacthy Warband) — understood by aquatic/amphibious animals
- ⭐ **Wavesense (Imprecise) 30 feet** (L10, passive — Sedacthy Warband) — glossary wavesense
- ⭐ **+2 Status to All Saves vs. Fear** (L11, passive — Viking Guard) — save bonus vs fear
- ⭐ **Earth Glide** (L11, passive — Avalanche Legion) — Burrows through earth and rock at full Speed
- ⭐ **Earthbound** (L11, passive — Avalanche Legion) — slowed 1 when not touching solid ground
- ⭐ **Metalsense** (L11, passive — Pelegox Cube) — senses metal creatures/objects imprecisely
- ⭐ **One with the Foliage** (L11, passive — Leshy Mob) — ignores plant difficult terrain, downgrades greater
- ⭐ **Prepared for Hell** (L11, passive — Marcos's Marauders) — attacks deal silver / devil-bane damage
- ⭐ **Shield Wall** (L11, passive — Viking Guard) — raises shields to protect an adjacent charge
- ⭐ **Slow to Turn** (L11, passive — Sylirican Phalanx) — flanking AC penalty persists (poor against surrounding)
- ⭐ **Telepathy** (L11–16, passive — ×4 troops) — glossary telepathy (30–100 ft)
- ⭐ **Tremorsense (Imprecise) 60 feet** (L11, passive — Avalanche Legion) — glossary tremorsense
- ⭐ **Zecui Larvae** (L11, passive — Zecui Horde) — larvae disease, drained
- ⭐ **Chaos Flux** (L12, passive — Protean Tumult) — disorganized: moves through creatures' spaces
- ⭐ **Entropy Sense** (L12, passive — Protean Tumult) — anticipates creatures via chaotic probability
- ⭐ **Final Reward** (L12, passive — Hellbound Honor Guard) — devils erupt from a fissure at 0 HP, frightened
- ⭐ **Harmonized Spellcasting** (L12, passive — Angelic Chorus) — pools members into a stronger spell
- ⭐ **Protean Anatomy 12** (L12, passive — Protean Tumult) — resists shifting organs after acid/electricity/etc., blinded + deafened
- ⭐ **At-Will Spells** (L13, passive — Infernal Tide) — glossary at-will spells
- ⭐ **Cloak of Purity** (L13, passive — Pure Legion Squad) — +2 saves vs divine/holy/unholy effects
- ⭐ **Constant Spells** (L13–20, passive — ×5 troops) — glossary constant spells
- ⭐ **Death Throes** (L13, passive — Gold Defender Garrison) — melts to slag whenever reduced past a threshold
- ⭐ **Demonic Tide** (L13–16, passive — ×2 troops) — disorganized: moves through creatures' spaces
- ⭐ **Gold Defender Poison** (L13, passive — Gold Defender Garrison) — poison, drained
- ⭐ **Golem Antimagic** (L13, passive — Gold Defender Garrison) — harmed by cold, healed by fire, slowed by others
- ⭐ **Sarglagon Venom** (L13, passive — Infernal Tide) — poison, clumsy
- ⭐ **Serenity Vulnerability** (L13–16, passive — ×2 troops) — moments of calm impose fascinated/fatigued/paralyzed/restrained
- ⭐ **Shepherd's Touch** (L13, passive — Vanth Guardian Flock) — physical damage counts as ghost touch
- ⭐ **Daemonic Pestilence** (L14, passive — Leukodaemon Plague) — telepathic disease, drained
- ⭐ **Kinsense** (L14, passive — Nightmarchers) — senses its kin imprecisely
- ⭐ **Performers** (L14, passive — Pageant Troupe) — unarmed: strikes deal bludgeoning with fists
- ⭐ **Plaguesense** (L14, passive — Leukodaemon Plague) — senses diseased creatures and their disease stage
- ⭐ **+1 Circumstance Bonus vs Emotion Effects** (L15, passive — Hellknight Hunter Squad) — save bonus vs emotion
- ⭐ **+4 to Will Vs. Fear** (L15, passive — Einherji Host) — large Will bonus vs fear
- ⭐ **Amnesia Venom** (L15, passive — Dezullon Thicket) — poison, clumsy + confused
- ⭐ **Filth Wallow** (L15, passive — Ofalth Stampede) — fast healing 10 amid heavy debris/refuse
- ⭐ **Hadi Pestilence** (L15, passive — Hadi Mob) — disease that turns victims into hadi, drained + sickened
- ⭐ **Hunters of Monsters** (L15, passive — Hellknight Hunter Squad) — Monster Lore recalls knowledge on any creature type
- ⭐ **Jotun Slayer** (L15, passive — Einherji Host) — +4 damage against giants and Huge-or-larger foes
- ⭐ **Painsight** (L15, passive — Sacristan Scourge) — senses doomed/dying/wounded creatures
- **Ratspeak** (L15, passive — Hadi Mob) — communicates with rodents
- ⭐ **Refuse Pile** (L15, passive — Ofalth Stampede) — settles into a disguised garbage heap
- ⭐ **Regeneration** (L15, passive — ×2 troops) — glossary regeneration (deactivated by holy/silver on one)
- ⭐ **Wretched Weeps** (L15, passive — Ofalth Stampede) — disease with persistent bleed, enfeebled
- ⭐ **Give No Ground** (L16, passive — House Thrune Elite Infantry) — can't be forced to flee, fleeing + slowed
- ⭐ **Clean Vulnerability** (L17, passive — Omox Slime Pool) — harmed by effects that clean it
- ⭐ **Hellstrider** (L18, passive — Vicious Levaloch Squad) — ignores nonmagical difficult terrain and caltrop/terrain damage
- ⭐ **Mass Rejuvenation** (L18, passive — Lich Legion) — the whole legion returns after destruction
- ⭐ **Orchestra of Faith** (L18, passive — Divine Warden Army) — a cleric can channel Heal through it
- ⭐ **Steady Troop Spellcasting** (L18, passive — Lich Legion) — pools members into a stronger spell
- ⭐ **Vicious Cruelty** (L18, passive — Vicious Levaloch Squad) — bonus against impaired foes, immobilized + restrained
- ⭐ **Darkvision** (L19, passive — Raised Cavalry) — glossary darkvision
- ⭐ **Mounted** (L19, passive — Raised Cavalry) — slowed 1 when not mounted
- ⭐ **Battlefield Bound** (L20, passive — Last Guard) — can stray only a short distance from its post
- ⭐ **Lifesense 60 feet** (L20, passive — Last Guard) — glossary lifesense
