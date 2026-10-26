# Halo Battles MVP: game-design spec

What the MVP plays like. Terms follow [GLOSSARY.md](../../GLOSSARY.md). The architecture that runs all this is in the [technical-architecture spec](technical-architecture-spec.md).

Every number below is Mod or map data. The values given are base-Mod defaults, and the roster values are **first-pass numbers meant to be tuned in playtests**.

## Overview

- Real-time, online PvP grand strategy for 2–4 players. Galaxy-map play in the style of Empire at War, with Stellaris-style resource management, in the Halo setting.
- Two Factions: **UNSC** and **Covenant**.
- Players build on Planets and send Armies along Lanes to capture enemy Planets. A **Battle** is ground only, automatic and round-based, and its Planet is **Locked** while it runs. Players only watch.
- **Vision**: a player sees the Planets they own plus their neighbours one Lane away.
- **Winning**: hold more than a map-set share of Planets for a set time, or be the last player not eliminated. Losing your Capital eliminates you.
- There is no tech tree, no research, no bots, no Pops and no space Battles. See [Out of scope](#out-of-scope).

## Economy

- **Resources** are stockpiles: **Credits** and **Materials**.
- **Payday** comes every 90 s. For each Resource, each player receives their Planets' base income plus their buildings' yields, minus their buildings' Upkeep, paid as one lump sum.
- Buildings have **Upkeep**. Units have none.
- **Debt is allowed.** While any Resource is below zero, the player can't queue anything and all of their queues pause. They get out by selling buildings or waiting for income.
- **Command Points** are a cap, not a Resource:
  - A unit occupies its Command Points from the moment it is queued until it dies.
  - Queuing is blocked if it would go over the cap.
  - Planets (by Planet Type) and buildings (`commandPointBonus`) raise the cap. In the base Mod every building's bonus is 0, so Command Points come from Planets only.
- A unit may have an optional `maxCount`, a per-player limit counted like Command Points, from queue to death. No base-Mod unit sets one.
- **Starting resources** are a lobby setting: the Host enters one amount per Resource, and every player gets the same. The defaults are 1000 Credits and 300 Materials. See [Lobby](#lobby).

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
- A Stack has **10 Unit Slots**. Each holds one unit type with an uncapped count (for example, Marine × 50), like the EaW grid. Within a Stack, a unit type always merges into its existing Unit Slot.
- Moving units between Stacks on the same Planet is instant, in any count. Unit Slots can be reordered.
- Trained units join the Planet's **Rally Stack**. By default it is the first Stack, and the player can change it.
- **Overflow:** units that find no free Unit Slot spill into the Planet's other Stacks. If nothing fits:
  - a trained unit stays finished at the head of its queue, which blocks that building's queue;
  - an arriving Army waits in orbit until the player makes room or re-orders it;
  - a winning attacker taking over a captured Planet follows the same rule.
- A move order forms an **Army** from any units on the Planet, taken from any of its Stacks. The order names the destination Stack, which defaults to the first.

## Travel

- A Lane's travel time is its length × its Lane-type multiplier: `fast` 1.0, `slow` 2.0. One length unit is 1 s. Map data may set an explicit `time` on a Lane, which overrides that.
- Routes are found automatically with Dijkstra, by shortest time, and pass **only through Planets the player owns**. Entering any other Planet ends the move there as an attack.
- An Army in transit can be re-ordered at any time. It finishes its current Lane hop, then follows the new route. It never turns back mid-Lane.
- Hostile Armies on the same Lane pass each other without a fight. Battles happen only at Planets.

## Arrival

- An Army arriving at its owner's Planet merges into the named Stack (subject to overflow).
- An Army arriving at **any other** Planet attacks it, including a Planet that changed hands while the Army was travelling.
- An Army arriving at a **Locked** Planet waits in orbit until the Battle ends, then resolves its arrival against whoever owns the Planet at that point. Waiting Armies can be re-ordered.
- If two hostile Armies arrive in the same tick, the player with the lower Seat index attacks and the other waits in orbit.
- **Neutral Planets** start with a garrison set in map data, which may be empty.
  - An empty neutral Planet is captured on arrival, with no Battle.
  - A garrisoned one starts a Battle against the neutral side, which has no AI.

## Battles

### Sides

- A Battle always has exactly two sides. The Planet's owner, or its neutral garrison, defends; one player attacks. Further hostile arrivals wait in orbit.
- **Defenders** are every unit in all three of the Planet's Stacks, plus **armed** buildings (those with a `combat` block). Unarmed buildings aren't targets; they are destroyed only on capture.

### Damage model

- Every combatant has **Shield → Armor → HP** layers, a **Unit Class**, a **Weapon Type**, base damage and an **Initiative** stat.
- A **Weapon Type** has a multiplier per layer.
- Against each **Unit Class**, an attacker has an effectiveness tier: `none` 0, `weak` 0.6, `average` 1.0, `strong` 1.4. A Unit Class missing from a combatant's `tiers` counts as `average`.
- **One hit** = base damage × Unit Class tier × the multiplier of the layer being hit now. Damage left over after a layer breaks carries into the next layer at that layer's multiplier. Damage left over after the target dies is wasted.
- A Battle tracks **every unit individually**, each with its own layers and its own turn.

### Rounds

- At the start of each **Round**, every combatant re-rolls Initiative: its Initiative stat + 1d20.
  - Combatants act from the highest Initiative down. Ties go to the defender, then to the lowest unit id.
- On its turn, a combatant picks a target uniformly at random among living enemies it can hit (tier > 0) and attacks.
  - A combatant killed before its turn doesn't act.
  - A combatant with no valid target skips its turn.
- Shields don't regenerate during a Battle.
- The RNG is seeded per Battle from the Match seed plus the Battle id. The resolver is a pure function of (forces, seed), so Battles can be replayed.

### Ending

The Battle runs Round after Round until one of these happens:

- **Attacker wins:** no defending combatants are left, and the Planet is captured (see [Ownership](#ownership-elimination-and-winning)).
- **Defender wins:** the surviving attackers Retreat, in any of these cases:
  - no attackers are left;
  - the Round cap (40) is reached;
  - no living combatant has a valid target, which ends the Battle early.
- **Mutual wipe-out:** the defender keeps the Planet. A neutral Planet stays neutral with an empty garrison.
- Neither side can retreat voluntarily.
- **Survivors** return to full Shield, Armor and HP. Only unit counts carry back to the galaxy map.

### While Locked

- The Planet still pays its income and charges its Upkeep at Payday, to its current owner.
- Units can't leave it, and moving units between its Stacks is frozen.
- Its queues pause.

### Retreat

- **Target:** the attacker's friendly Planet that is the fewest Lane jumps from the Battle. Ties go to the shorter travel time, then the lowest Planet id. Every "lowest id" tie-break compares ids byte-wise; ids are ASCII only.
- **Movement:** the Army moves there directly and doesn't stop or fight at any Planet in between. The trip takes as long as the Lane route would.
- A Retreating Army can't be re-ordered.
- If the target is captured before the Army arrives, it picks a new target the same way. If its owner has no Planets left, the Army is destroyed.

### Pacing and watching

- The server resolves each Round instantly. The client plays it back over a 3 s Round, so the defaults give a Lock of about 2 minutes at most. Mods or maps should keep it within 1–3 minutes.
- **The two sides** see every Round's actions, grouped by Unit Slot: counts go down, and the acting unit and its target are highlighted. Units are never shown one by one.
- **Other players with vision** see only that a Battle is in progress, and its outcome.
- The roster's pacing target: two forces of similar size should fight for about 8–15 Rounds.

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
  - be the last player not eliminated.
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

The rosters mirror each other's roles and costs. Covenant units put part of their durability into Shields and have higher Initiative; UNSC units carry more Armor and HP.

| Unit | Faction | Class | Weapon | Sh/Ar/HP | Dmg | Init | Tiers Inf/Veh/Air/Str | Cost | Time | CP | Trained at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Marine | UNSC | Inf | Kinetic | 0/0/100 | 10 | 10 | strong/weak/weak/weak | 50C | 15s | 1 | Barracks |
| ODST | UNSC | Inf | Explosive | 0/20/120 | 30 | 8 | weak/strong/average/strong | 100C 25M | 25s | 2 | Barracks |
| Warthog | UNSC | Veh | Kinetic | 0/100/200 | 20 | 14 | strong/weak/average/weak | 150C 50M | 30s | 3 | Vehicle Depot |
| Scorpion | UNSC | Veh | Explosive | 0/300/300 | 60 | 4 | average/strong/none/strong | 250C 100M | 45s | 4 | Vehicle Depot |
| Hornet | UNSC | Air | Kinetic | 0/100/200 | 25 | 16 | average/strong/strong/average | 300C 150M | 50s | 5 | Air Pad |
| Grunt | Covenant | Inf | Plasma | 20/0/70 | 9 | 12 | strong/weak/weak/weak | 50C | 15s | 1 | Hall |
| Elite | Covenant | Inf | Explosive | 80/0/80 | 30 | 10 | weak/strong/average/strong | 100C 25M | 25s | 2 | Hall |
| Ghost | Covenant | Veh | Plasma | 80/40/120 | 18 | 16 | strong/weak/average/weak | 150C 50M | 30s | 3 | Summoning Foundry |
| Wraith | Covenant | Veh | Explosive | 150/150/250 | 60 | 4 | average/strong/none/strong | 250C 100M | 45s | 4 | Summoning Foundry |
| Banshee | Covenant | Air | Plasma | 100/40/150 | 25 | 18 | average/strong/strong/average | 300C 150M | 50s | 5 | Summit |

### Buildings

Six mirrored buildings per Faction. Every `commandPointBonus` is 0.

| UNSC / Covenant | Cost | Time | Upkeep | Yield | Role |
|---|---|---|---|---|---|
| Barracks / Hall | 150C | 30s | 10C | none | trains the two infantry units |
| Vehicle Depot / Summoning Foundry | 300C 100M | 45s | 25C | none | trains the light vehicle and the tank |
| Air Pad / Summit | 300C 150M | 60s | 30C | none | trains the aircraft |
| Supply Pad / Warehouse | 200C | 30s | 0 | +100C | economy |
| Reactor / Generator | 200C | 30s | 0 | +50M | economy |
| Turret / Plasma Turret | 200C 50M | 30s | 10C | none | armed Structure |

Both Turrets have damage 20 and Initiative 10, and are strong against Infantry and average against Vehicles and Aircraft.

- **Turret (UNSC):** Kinetic, Sh/Ar/HP 0/200/300.
- **Plasma Turret (Covenant):** Plasma, Sh/Ar/HP 150/50/300.

### Planet Types

| Planet Type | Income per Payday | Building Slots | CP bonus |
|---|---|---|---|
| Standard | 200C 50M | 3 | +10 |
| Rich | 300C 100M | 2 | +5 |
| Fortress | 100C 25M | 4 | +15 |
| Capital | 300C 100M | 4 | +20 |

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
| Capital | the near Planet on each of its two edges | Fast | 30 | 30 s |
| Edge Planet | the other Planet on the same edge | Fast | 40 | 40 s |
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
- Settings stay editable until Start. Any setting change clears every Seat's ready flag.

### Starting

- The Host can Start only when every Seat is ready and the Seat count is at least the map's `minPlayers`.
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
| Unit Slots per Stack | 10 |
| Tiers | `none` 0, `weak` 0.6, `average` 1.0, `strong` 1.4 |
| Lane types | `fast` 1.0, `slow` 2.0 |
| Initiative die | 20 |
| Round duration | 3 s |
| Round cap | 40 |
| `startingResources` | 1000 Credits, 300 Materials |
| `gracePeriodSeconds` | 180 (3 min) |
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
- **Halo-style Shield regeneration during Battles** (after a Round without damage). MVP Shields refill only after a Battle.
- **Touch and mobile layouts.** The MVP is desktop mouse and keyboard at 1280×720 or larger.

Further off, not designed yet:

- **Tactical Battles** (player-controlled): wanted eventually, far beyond the MVP.
- **Space Battles** or an orbital layer. MVP Battles are ground only.
- **Pops**, a population simulation.
- **A Tauri desktop client:** blocked on Linux webkitgtk; browser-first keeps it possible.
- **Steam auth.** Device auth is enough for the MVP.
- **Real art**, and Halo IP licensing for a public release.
