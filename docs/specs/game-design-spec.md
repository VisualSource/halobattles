# Halo Battles MVP: game-design spec

What the MVP plays like. Terms follow [GLOSSARY.md](../../GLOSSARY.md). The architecture that runs all this is in the [technical-architecture spec](technical-architecture-spec.md).

Every number below is Mod or map data. The values given are base-Mod defaults, and the roster values are **first-pass numbers meant to be tuned in playtests**.

## Overview

- Real-time, online PvP grand strategy for 2–4 players. Galaxy-map play in the style of Empire at War, with Stellaris-style resource management, in the Halo setting.
- Two Factions: **UNSC** and **Covenant**.
- Players build on Planets and send Armies along Lanes to capture enemy Planets. A **Battle** is ground only, a real-time AI-run fight over Control Points on a 2D Battlefield ([tactical Battle spec](tactical-battle-spec.md)), and its Planet is **Locked** while it runs. Players watch, and can only order a Retreat.
- **Vision**: a player sees the Planets they own plus their neighbours one Lane away. They also see a Planet one of their Armies is at (passing through, waiting in orbit, landed, or attacking it), and for `armyVisionSeconds` after it leaves or is destroyed; only that Planet, not its neighbours, and never from a Retreating Army. When vision of a Planet ends, its client keeps it as last seen.
- **Winning**: hold more than a map-set share of Planets for a set time, or be the last player not eliminated. Losing your Capital eliminates you.
- There is no tech tree, no research, no bots, no Pops and no space Battles. See [Out of scope](#out-of-scope).

## Economy

The full rules and numbers are in the [economy spec](economy-spec.md) (Economy v2, issue #22). In short:

- **Resources** are stockpiles: **Credits**, **Materials** and **Alloys**, refined from Materials. Each has a **Stockpile cap**.
- **Payday** comes every 90 s and pays, as one lump sum, each owned Planet's base income plus its extractor buildings' yields (scaled by the Planet's **Richness**), minus building and unit **Upkeep**.
- **Sprawl:** each Planet beyond a player's first 4 makes new units and buildings cost more.
- An **exchange** trades Resources for Credits and back at poor fixed rates.
- **Debt is allowed.** While any Resource is below zero, the player can't queue anything and all of their queues pause. They get out by selling buildings, trading, or waiting for income.
- **Command Points** are a cap, not a Resource:
  - A unit occupies its Command Points from the moment it is queued until it dies.
  - Queuing is blocked if it would go over the cap.
  - Planets (by Planet Type) and buildings (`commandPointBonus`) raise the cap. In the base Mod every building's bonus is 0, so Command Points come from Planets only.
- A unit may have an optional `maxCount`, a per-player limit counted like Command Points, from queue to death. No base-Mod unit sets one.
- **Starting resources** are a lobby setting: the Host enters one amount per Resource, and every player gets the same. See [Lobby](#lobby).

## Building and production

- Each Planet has a number of **Building Slots** set by its Planet Type (2–4 in the base Mod).
- Each Planet has **one construction queue** for buildings.
- **Each production building** (one with `trains`) **has its own unit queue**, so more Barracks train more units in parallel.
- The full cost is paid when an item is queued.
- **Cancelling** refunds 100% if the item hasn't started, or 50% if it has.
- **Selling** a finished building refunds 50%, and its Upkeep stops at once.
- There are no build limits or prerequisites.
- Queues pause while the player is in debt or the Planet is Locked, and resume afterwards.

## Stacks, Unit Slots and Armies

- Each Planet has **three Stacks**. A Stack holds units only. Buildings sit in Building Slots but still fight in Battles.
- A Stack has **15 Unit Slots**, three rows of five, like the EaW grid. Each holds one unit type, and a Stack can hold a unit type in several slots. A slot's count is uncapped (for example, Marine × 50) unless the unit sets an optional `slotLimit`, the most one slot holds. No base-Mod unit sets one.
- Arriving units (trained, an Army landing, a Battle's survivors) top up the Stack's slots of their type, up to the limit, then take new slots in the first free cells. Survivors go back to the slot they fought from.
- Moving units between Stacks on the same Planet is instant, in any count. A Stack's Unit Slots sit in a grid, and a slot can be moved to any cell of any of the Planet's Stacks. Moved onto a slot of the same unit, it merges, up to the limit. Moved onto another unit's slot, a whole slot swaps places with it. Splitting a slot puts half its units in a new slot in the same Stack.
- Trained units join the Planet's **Rally Stack**. By default it is the first Stack, and the player can change it.
- **Overflow:** units that find no room spill into the Planet's other Stacks. If nothing fits:
  - a trained unit stays finished at the head of its queue, which blocks that building's queue;
  - an arriving Army waits in orbit until the player makes room or re-orders it;
  - a winning attacker taking over a captured Planet follows the same rule.
- A move order forms an **Army** from any units on the Planet, taken from any of its Stacks. The order names the destination Stack, which defaults to the first.

## Travel

- A Lane's travel time is its length × its Lane-type multiplier: `fast` 0.6, `slow` 2.0. One length unit is 1 s. Map data may set an explicit `time` on a Lane, which overrides that.
- An Army can be ordered to any Planet. Its route is found automatically with Dijkstra and goes **straight through the player's own Planets and neutral ones**, with no Battle and no capture. Entering an **enemy** Planet ends the move there with a Battle; if the Army wins, it stays on the Planet it took.
- The route enters as few enemy Planets as it can, whatever the time; then it's the fastest; then, on equal times, it passes the fewest neutral Planets. Remaining ties go to the lowest Planet-id sequence.
- A route is fixed once ordered. Each Planet on it is judged as the Army reaches it: one that has turned enemy ends the move there with a Battle, and a **Locked** one makes the Army wait in orbit until its Battle ends, then go on or, if the Planet is now an enemy's, fight there.
- An Army in transit can be re-ordered at any time. It finishes its current Lane hop, then follows the new route, which is then fixed in turn. It never turns back mid-Lane.
- Later, a building may stop Armies passing through a Planet. Nothing does in the MVP.
- Hostile Armies on the same Lane pass each other without a fight. Battles happen only at Planets.

## Arrival

- An Army arriving at its owner's Planet merges into the named Stack (subject to overflow).
- An Army arriving at **any other** Planet as its destination attacks it, including a Planet that changed hands while the Army was travelling.
- An Army arriving at a **Locked** destination waits in orbit until the Battle ends, then resolves its arrival against whoever owns the Planet at that point. Waiting Armies can be re-ordered.
- If two hostile Armies arrive in the same tick, the player with the lower Seat index attacks and the other waits in orbit.
- **Neutral Planets** start with a garrison set in map data, which may be empty.
  - An empty neutral Planet is captured on arrival, with no Battle.
  - A garrisoned one starts a Battle against the neutral side, which has no AI.

## Battles

How a Battle plays out (the Battlefield, Squads, movement, fog of war, Control Points, the AI) is in the [tactical Battle spec](tactical-battle-spec.md). This section keeps who fights, the damage model, and what happens around a Battle.

### Sides

- A Battle always has exactly two sides. The Planet's owner, or its neutral garrison, defends; one player attacks. Further hostile arrivals wait in orbit.
- **Defenders** are every unit in all three of the Planet's Stacks, plus every building. Armed buildings (those with a `combat` block) fire; unarmed ones are only targets. A building destroyed in a Battle is gone for good.

### Damage model

- Every combatant has **Shield → Armor → HP** layers, a **Unit Class**, a **Weapon Type**, a **Damage roll** in dice notation (`1d4`, `4d6+1`), and movement, range, fire-rate and Sight stats ([Stats](tactical-battle-spec.md#stats)). See [ADR 0003](../adr/0003-dice-damage.md).
- A **Weapon Type** has a multiplier per layer.
- Against each **Unit Class**, an attacker has a tier: `advantage`, `normal`, `disadvantage` or `none`. A Unit Class missing from a combatant's `tiers` counts as `normal`.
- **An attack** rolls the **To-hit roll** first, 1d20: below the Ruleset's `toHit` it misses and deals nothing. A hit then rolls the Damage roll.
  - With **Advantage**, the attacker rolls the To-hit roll and the Damage roll twice each and keeps the higher. With **Disadvantage** it keeps the lower. `normal` rolls once, and `none` can't target that Unit Class.
- **One hit's damage** = the Damage roll × the multiplier of the layer being hit now, rounded down. Damage left over after a layer breaks carries into the next layer at that layer's multiplier. Damage left over after the target dies is wasted. A hit always does at least 1, unless the layer it reaches has a ×0 multiplier.
- There are no critical hits.
- A Battle tracks **every unit individually**, each with its own layers, inside its Unit Slot's Squad.
- Terrain and height add To-hit modifiers ([Firing](tactical-battle-spec.md#firing)).
- Shields don't regenerate during a Battle.
- The RNG is seeded per Battle from the Match seed plus the Battle id. A Battle is a pure function of (Battlefield, forces, seed, player orders by tick), so Battles can be re-simulated.

### Ending

The win conditions (Control Points, elimination, the time cap and Retreat) are in [Winning](tactical-battle-spec.md#winning). Then:

- **Attacker wins:** the Planet is captured (see [Ownership](#ownership-elimination-and-winning)). The defender's surviving units Retreat, unless they're a neutral garrison, which loses them.
- **Defender wins:** the surviving attackers Retreat.
- **Mutual wipe-out:** the defender keeps the Planet. A neutral Planet stays neutral with an empty garrison.
- Either side can order a Retreat mid-Battle; a neutral garrison can't ([Retreat in Battle](tactical-battle-spec.md#retreat-in-battle)).
- **Survivors** return to full Shield, Armor and HP. Only unit counts carry back to the galaxy map.

### While Locked

- The Planet still pays its income and charges its Upkeep at Payday, to its current owner.
- Units can't leave it, and moving units between its Stacks is frozen.
- Its queues pause.

### Retreat

- Applies to a defeated attacker and to either side that Retreats mid-Battle ("the attacker" below means whichever side is Retreating).
- **Target:** the attacker's friendly Planet that is the fewest Lane jumps from the Battle. Ties go to the shorter travel time, then the lowest Planet id. Every "lowest id" tie-break compares ids byte-wise; ids are ASCII only.
- **Movement:** the Army moves there directly and doesn't stop or fight at any Planet in between. The trip takes as long as the Lane route would.
- A Retreating Army can't be re-ordered.
- If the target is captured before the Army arrives, it picks a new target the same way. If its owner has no Planets left, the Army is destroyed.

### Pacing and watching

- The server runs the Battle live on the match tick, after a 30 s start delay that lets players open it. The delay plus the time cap (3 min) bound the Lock to 3.5 minutes. The fighting itself should take 1–3 minutes.
- **The two sides** watch it live in the Battle window, which can go full-screen ([Watching](tactical-battle-spec.md#watching)).
- **Other players with vision** see only that a Battle is in progress, and its outcome.
- The roster's pacing target: two forces of similar size should fight for about 1–3 minutes.

## Ownership, elimination and winning

- **On capture:**
  - the loser's queues there are cancelled with no refund;
  - their buildings there are destroyed;
  - the Command Points those queued items reserved are freed.
- Each player starts with **one Capital**: the start position they were assigned.
- Whether a Planet is a Capital follows the same vision rules as its other details: you see it only while the Planet is in your vision, and otherwise only as last seen. You always see your own.
- A player is **eliminated** by losing their Capital, or by a **Forfeit** (see [Disconnects and Forfeits](#disconnects-and-forfeits)). On elimination:
  - their Planets turn neutral and keep their garrisons and buildings;
  - their Armies, whether travelling, waiting or Retreating, are destroyed.
- **Win conditions:**
  - hold more than the map's `planetShare` of Planets for `holdSeconds` (the share must be over 0.5; the default hold is one Payday); or
  - be the last player not eliminated. A Match started alone (a one-player map) has no last-standing win: only the hold or a Forfeit ends it.
- Every player's Planet count and any running win-hold countdown are public.

## The MVP roster

The base Mod ships **no icons or sprites**; the client draws placeholders.

### Combat tables

- **Unit Classes:** Infantry, Vehicle, Aircraft, Structure.
- **Weapon Types**:

  | Weapon Type | Shield | Armor | HP | Used by |
  |---|---|---|---|---|
  | Kinetic | 0.75 | 1.0 | 1.25 | UNSC small arms |
  | Plasma | 1.5 | 0.75 | 1.0 | Covenant small arms |
  | Explosive | 0.75 | 1.5 | 0.75 | anti-armour units of both sides |

- **Design intent:** each Faction's defences resist the other's main gun. UNSC leans on Armor and HP, so Plasma does only ×0.75 against UNSC Armor. Covenant leans on Shields, so Kinetic does only ×0.75 against Covenant Shields. Explosive units are how either side breaks through.

### Units

The rosters mirror each other's roles and costs. Covenant units put part of their durability into Shields; UNSC units carry more Armor and HP. Each living unit pays its Upkeep at every Payday, from training until death; queued units and neutral garrisons pay none ([economy spec](economy-spec.md#unit-upkeep)). Movement, range, fire-rate and Sight come from the [Unit Class defaults](tactical-battle-spec.md#stats) until playtests give units their own.

Tiers below are written A (`advantage`), N (`normal`), D (`disadvantage`) and – (`none`). The numbers were balanced so the two Starting Kits are roughly even (either one attacking wins about 45–55% of the time) and fight for 1–3 minutes; a Go test keeps both (see [Pacing](tactical-battle-spec.md#pacing)).

| Unit | Faction | Class | Weapon | Sh/Ar/HP | Damage roll | Tiers Inf/Veh/Air/Str | Cost | Upkeep | Time | CP | Trained at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Marine | UNSC | Inf | Kinetic | 0/0/12 | 1d4 | A/D/D/D | 50C | 5C | 15s | 1 | Barracks |
| ODST | UNSC | Inf | Explosive | 0/2/19 | 2d6 | D/A/N/A | 100C 25M | 10C | 25s | 2 | Barracks |
| Warthog | UNSC | Veh | Kinetic | 0/12/25 | 2d4 | A/D/N/D | 150C 50M 15A | 15C 1A | 30s | 3 | Vehicle Depot |
| Scorpion | UNSC | Veh | Explosive | 0/38/38 | 4d6+1 | N/A/–/A | 250C 100M 30A | 25C 2A | 45s | 4 | Vehicle Depot |
| Hornet | UNSC | Air | Kinetic | 0/12/25 | 1d12 | N/A/A/N | 300C 150M 40A | 30C 2A | 50s | 5 | Air Pad |
| Grunt | Covenant | Inf | Plasma | 2/0/10 | 1d4 | A/D/D/D | 50C | 5C | 15s | 1 | Hall |
| Elite | Covenant | Inf | Explosive | 10/0/10 | 2d6 | D/A/N/A | 100C 25M | 10C | 25s | 2 | Hall |
| Ghost | Covenant | Veh | Plasma | 14/5/18 | 2d4 | A/D/N/D | 150C 50M 15A | 15C 1A | 30s | 3 | Summoning Foundry |
| Wraith | Covenant | Veh | Explosive | 17/17/30 | 4d6+1 | N/A/–/A | 250C 100M 30A | 25C 2A | 45s | 4 | Summoning Foundry |
| Banshee | Covenant | Air | Plasma | 13/5/20 | 1d12 | N/A/A/N | 300C 150M 40A | 30C 2A | 50s | 5 | Summit |

### Buildings

Eight mirrored buildings per Faction. Every `commandPointBonus` is 0. The Foundry / Forge and Depot / Reliquary are from Economy v2; the rest of its changes land with the [economy spec](economy-spec.md)'s other sub-issues.

| UNSC / Covenant | Cost | Time | Upkeep | Yield | Role |
|---|---|---|---|---|---|
| Barracks / Hall | 150C | 30s | 10C | none | trains the two infantry units |
| Vehicle Depot / Summoning Foundry | 300C 100M | 45s | 25C | none | trains the light vehicle and the tank |
| Air Pad / Summit | 300C 150M | 60s | 30C | none | trains the aircraft |
| Supply Pad / Warehouse | 200C | 30s | 0 | extracts 100C × Credits Richness | economy |
| Mine / Excavator | 200C | 30s | 0 | extracts 60M × Materials Richness | economy |
| Foundry / Forge | 250C 100M | 45s | 10C | refines 40M into 20A | Alloys |
| Depot / Reliquary | 150C | 30s | 0 | +1500C +750M +250A of Stockpile caps | storage |
| Turret / Plasma Turret | 200C 50M 20A | 30s | 10C | none | armed Structure |

Both Turrets have a Damage roll of 2d4, have `advantage` against Infantry, and are `normal` against Vehicles and Aircraft.

- **Turret (UNSC):** Kinetic, Sh/Ar/HP 0/25/38.
- **Plasma Turret (Covenant):** Plasma, Sh/Ar/HP 19/6/38.

### Planet Types

A Planet pays its base income itself; Richness (none ×0, poor ×0.5, normal ×1, rich ×1.5) multiplies what extractor buildings draw from it. See the [economy spec](economy-spec.md#deposits).

| Planet Type | Base income per Payday | Credits Richness | Materials Richness | Building Slots | CP bonus |
|---|---|---|---|---|---|
| Standard | 80C 20M | normal | poor | 3 | +10 |
| Rich | 150C 40M | rich | rich | 2 | +5 |
| Fortress | 40C 10M | poor | rich | 4 | +15 |
| Capital | 150C 40M | normal | normal | 4 | +20 |

### Starting Kits

Each kit puts two buildings on the Capital, leaving 2 of its 4 Building Slots free. Its first Stack holds 10 basic infantry and 2 light vehicles, which use 16 of the Capital's 20 Command Points.

- **UNSC:** Barracks, Supply Pad, 10 Marines, 2 Warthogs.
- **Covenant:** Hall, Warehouse, 10 Grunts, 2 Ghosts.

## The first map

Planet names and the map's id are left to implementation.

- 13 Planets with 4-fold rotational symmetry. 4 `starts`, `minPlayers` 2.
- **Capitals:** one at each corner. These are the 4 starts, and each uses the Capital Planet Type.
- **Edge Planets:** 2 on each edge of the square, 8 in all. The edge Planet clockwise of each Capital is **Standard** and links to the hub; the other 4 are **Fortress**.
- **Hub:** one **Rich** Planet in the centre.

| From | To | Type | Length | Time |
|---|---|---|---|---|
| Capital | the near Planet on each of its two edges | Fast | 30 | 18 s |
| Edge Planet | the other Planet on the same edge | Fast | 40 | 24 s |
| Hub | each of the 4 Standard edge Planets | Slow | 30 | 60 s |

- **Win:** `planetShare` 0.6, `holdSeconds` 90, which means holding 8 Planets for 90 s.
- **Garrisons** may mix both Factions' units. A garrison listed for a start Planet applies only when that start is unused; a start a player uses gets their Faction's Starting Kit instead.

  | Planet | Neutral garrison |
  |---|---|
  | Fortress edge Planet | 6 Marines |
  | Standard edge Planet | 6 Grunts |
  | Rich hub | 20 Grunts, 6 Elites, 2 Wraiths (a mid-game objective) |
  | Unused start | 15 Marines, 4 ODSTs, 2 Scorpions; it keeps the Capital Planet Type but is no one's Capital |

## Lobby and Match lifecycle

A Match moves through the phases `lobby` → `play` → `results`.

### Finding a Match

- Anyone can create a Match from the main menu, with no form. The creator lands in its lobby.
- Players find Matches in an open list that shows only Matches in the `lobby` phase with a free Seat, or join by Match id: the URL is the invite.
- There is no matchmaker and there are no invite codes.

### Lobby

- The creator is the **Host**. If the Host leaves the lobby, the role passes to the longest-held Seat. The Match closes when the lobby empties.
- Only the Host can change the map and the starting resources, and only the Host can start. There is no kicking.
- The Seat cap is the selected map's number of starts. Switching to a map with fewer starts than seated players is rejected.
- Leaving or disconnecting during the lobby frees the Seat at once, with no penalty.
- **Defaults:** the first map by id, the Ruleset's `startingResources`, and each joiner on the first Faction by id, not ready. Maps carry no starting resources of their own.
- Each player picks their own Faction. Mirror matches are allowed. Player colour comes from Seat order.
- Starting resources must name every Resource, each a whole number from 0 to 1,000,000.
- Settings stay editable until Start. Changing your Faction clears only your own ready flag; map and starting-resource changes clear none.
- The Host has no ready toggle: they ready up by pressing Start.

### Starting

- The Host can Start only when every other Seat is ready and the Seat count is at least the map's `minPlayers`.
- The phase goes straight to `play` at Match Time 0, with no countdown.
- The map's starts are shuffled and assigned to Seats at random. Unused starts become garrisoned neutrals.
- After Start, only returning Seats can join. There are no new players and no spectators.

### Disconnects and Forfeits

- The Match never pauses. A player who drops during `play` keeps their Seat for a **Grace Period of 3 minutes**, and their queues, Payday and ordered Armies carry on.
- A returning player is put back in their Seat with their full View.
- There is no AFK detection.
- Each of these is a **Forfeit**, which eliminates the player:
  - the Grace Period running out;
  - surrendering;
  - leaving a `play` Match explicitly, which is final.
- Every player sees which players are disconnected, with a forfeit countdown.
- If every remaining player is disconnected, the Match runs on until the Grace Periods expire, then ends with no winner (reason: abandoned).

### Results

- After the Match ends, it stays in `results` for 60 s, or until everyone leaves, showing the winner, the reason and "Back to menu".
- There is no rematch; players create a new Match.

## Ruleset defaults

The single `base:rules` definition.

| Field | Default |
|---|---|
| Payday interval | 90 s |
| Cancel-after-start refund | 50% |
| Sell refund | 50% |
| Unit Slots per Stack | 15 |
| `toHit` | 3 (a d20 roll of 1–2 misses: 90% of attacks hit before Advantage or Disadvantage) |
| Lane types | `fast` 0.6, `slow` 2.0 |
| Tactical Battle fields | see [Ruleset additions](tactical-battle-spec.md#ruleset-additions) |
| `startingResources` | 1000 Credits, 300 Materials, 50 Alloys |
| `stockpileCaps` | 3000 Credits, 1500 Materials, 500 Alloys |
| `sprawl` | 4 free Planets, +5% per Planet beyond them |
| `gracePeriodSeconds` | 180 (3 min) |
| `armyVisionSeconds` | 15 |
| `resultsSeconds` | 60 |

## Out of scope

Post-MVP, decided when the MVP was specified:

- **WASM Plugins:** the API a Plugin sees at the six seams, sandboxing and metering. The MVP only names the seams.
- **Choosing the Mod set per Match.** The server's enabled Mods apply to every Match.
- **Localised display text.** The MVP uses inline English `name` strings.
- **Saving and resuming long-running Matches.** Match state is in memory only, kept serialisable.
- **Bots** filling empty Seats. The MVP is PvP only.
- **Spies and richer vision rules.** MVP vision is owned Planets plus their neighbours one Lane away.
- **A tech tree or unlocks.**
- **Halo-style Shield regeneration during Battles** (after a few seconds without damage). MVP Shields refill only after a Battle.
- **Player control in Battles** beyond Retreat, and the rest of the tactical spec's [Later](tactical-battle-spec.md#later) list.
- **Touch and mobile layouts.** The MVP is desktop mouse and keyboard at 1280×720 or larger.

Further off, not designed yet:

- **Space Battles** or an orbital layer. MVP Battles are ground only.
- **Pops**, a population simulation.
- **A Tauri desktop client:** blocked on Linux webkitgtk; browser-first keeps it possible.
- **Steam auth.** Device auth is enough for the MVP.
- **Real art**, and Halo IP licensing for a public release.
