# Halo Battles

A real-time, multiplayer grand-strategy game set in the Halo universe: players build forces on planets and move them across a galaxy map to capture enemy planets, under Stellaris-style resource management.

## Language

**Match**:
One running game session of 2–4 players on one galaxy map.
_Avoid_: Game, lobby (a lobby is the pre-start phase of a Match)

**Seat**:
A player's place in a Match, held from joining the lobby until they leave it or Forfeit; a Match has at most as many Seats as its map has starts.
_Avoid_: Slot (a Slot belongs to a Planet or Stack), player position

**Host**:
The Seat that controls a Match's lobby settings and starts it; the creator, passing to the longest-held Seat if they leave the lobby.
_Avoid_: Owner, admin

**Invite**:
A Match's URL, shared to bring a player into its lobby; there are no separate codes.
_Avoid_: Invite code, join code, Match id (the id is part of the URL, not something players share)

**Grace Period**:
How long a disconnected player keeps their Seat in a running Match before they Forfeit.
_Avoid_: Timeout, reconnect window

**Forfeit**:
Leaving a running Match for good, by surrendering, leaving, or letting the Grace Period run out; it eliminates the player.
_Avoid_: Quit, abandon (an abandoned Match is one every player Forfeited)

**Faction**:
A playable side with its own units and buildings, e.g. UNSC or Covenant.
_Avoid_: Race, civ, empire

**Planet**:
A location on the galaxy map that can be owned, built on, and garrisoned.
_Avoid_: Node, world, system

**Lane**:
A connection between two Planets along which forces travel.
_Avoid_: Link, edge, hyperlane

**Stack**:
One of a Planet's three fixed garrison groups; holds units in a fixed number of Unit Slots, never buildings.
_Avoid_: Group, squad, fleet

**Unit Slot**:
A place in a Stack that holds any number of units of one unit type; a unit type fills at most one Unit Slot per Stack.
_Avoid_: Cell, stack slot

**Army**:
A group of units travelling along Lanes, formed from a Planet's Stacks and merged into a Stack on arrival.
_Avoid_: Fleet, transfer, stack (when in transit)

**Building Slot**:
A place on a Planet that holds one building; a Planet has a fixed number of them.
_Avoid_: District, tile

**Command Points**:
A player's cap on the total size of their living and queued units; not spent, only occupied.
_Avoid_: Supply, population, pop cap

**Upkeep**:
A recurring cost a building or a living unit charges its owner at each Payday.
_Avoid_: Maintenance

**Payday**:
The periodic moment when every player receives their net income in one lump sum.
_Avoid_: Income tick, week, turn

**Retreat**:
The move of an Army to its owner's nearest Planet, passing through other Planets without stopping or fighting; forced on a defeated attacker, or ordered by either side mid-Battle.
_Avoid_: Rout, recall

**Rally Stack**:
The Stack on a Planet that newly trained units join.
_Avoid_: Spawn stack

**Capital**:
The start Planet a player is assigned when the Match starts; losing it eliminates them. An unused start is no one's Capital.
_Avoid_: Homeworld, HQ

**Battle**:
The real-time fight on a Battlefield that starts when hostile forces meet at a Planet; Controllers run it, and players can only order a Retreat.
_Avoid_: Combat, engagement, tactical battle, round (Battles no longer have Rounds)

**Battlefield**:
The square-grid map a Planet's Battles are fought on, generated from noise with the Match seed and the Planet id.
_Avoid_: Battle map, arena, level

**Terrain**:
The kind of ground in a Battlefield cell (e.g. Open, Forest, Rough, Water), which sets cover and per-Unit-Class movement.
_Avoid_: Tile, biome

**Terrain Preset**:
The noise settings and thresholds a Battlefield is generated from, e.g. temperate, desert or ice.
_Avoid_: Biome (reserved, see Planet Type), map type

**Squad**:
A Unit Slot as it fights in a Battle: one token on one cell, tracking each member's own layers.
_Avoid_: Stack (a Stack holds up to 15 Unit Slots), unit, token

**Control Point**:
A Battlefield location the two sides fight over; holding enough of them long enough wins the Battle for the attacker.
_Avoid_: Objective, flag, capture point

**Sight**:
How far a unit sees on a Battlefield, in cells; a side sees the union of its units' Sight, and everything else is fog.
_Avoid_: Vision (Vision is galaxy-level), range (that's how far it fires)

**Controller**:
What drives one side of a Battle: it reads that side's fog-filtered view and issues orders. The AI is a Controller, and a player will be one later.
_Avoid_: AI player, brain, bot (bots fill Seats, which is out of scope)

**Commander**:
The AI Controller's side-level layer, which assigns each Squad a goal.
_Avoid_: General, strategist

**Unit Class**:
A combat category of units and armed buildings (e.g. Infantry, Vehicle, Aircraft, Structure) that attackers are more or less effective against.
_Avoid_: Unit type (a unit type is a specific unit, e.g. Marine), class

**Weapon Type**:
The kind of damage a combatant deals (e.g. Kinetic, Plasma), which is more or less effective against Shield, Armor and HP.
_Avoid_: Damage type

**To-hit roll**:
The 1d20 each attack rolls first; below the Ruleset's `toHit` it misses and deals nothing.
_Avoid_: Accuracy, attack roll

**Damage roll**:
The dice a combatant rolls when its attack hits, written as `NdM` or `NdM+K` (a Marine's is 1d4); the roll then goes through the Weapon Type's layer multipliers.
_Avoid_: Damage value, base damage

**Advantage**:
An attacker's edge against a Unit Class: it rolls the To-hit roll and the Damage roll twice each and keeps the higher.
_Avoid_: Strong, bonus

**Disadvantage**:
An attacker's weakness against a Unit Class: it rolls the To-hit roll and the Damage roll twice each and keeps the lower.
_Avoid_: Weak, penalty

**Locked**:
The state of a Planet while a Battle is in progress on it.
_Avoid_: Contested, in-battle

**Vision**:
The Planets a player can see right now: those they own and their neighbours one Lane away, plus any Planet one of their Armies is at, and for a short time after it leaves or is destroyed. Retreating Armies give none.
_Avoid_: Fog of war (fog is a Battlefield term), line of sight, Sight (Battlefield only)

**View**:
One player's picture of a Match, limited to what their vision reveals; the only state a player is ever sent.
_Avoid_: Snapshot, game state (the full state only the server holds)

**Match Time**:
Time elapsed since a Match started; everything scheduled in a Match is placed on it.
_Avoid_: Server time, game clock

**Mod**:
A package of content (units, buildings, planets, maps) loaded by the game; the base game is itself a Mod.
_Avoid_: Plugin (reserved for sandboxed logic extensions), addon, pack

**Plugin**:
Sandboxed custom logic shipped inside a Mod.
_Avoid_: Script, mod

**Patch**:
A Mod's change to content another Mod defined, altering only the fields it names.
_Avoid_: Override (an override replaces the whole definition), diff

**Ruleset**:
The single set of game-wide tuning values (Payday interval, refunds, Unit Slots per Stack, Battle and Battlefield settings) that every Match runs under.
_Avoid_: Settings, config, game rules

**Resource**:
A stockpiled currency that players earn at Payday and spend: Credits, Materials or Alloys; Command Points is not a Resource.
_Avoid_: Currency, Command Points (a cap, not a stockpile)

**Alloys**:
The refined Resource, made from Materials by a Foundry or Forge at each Payday, that heavy units and Turrets cost.
_Avoid_: Refined materials

**Richness**:
How much of a Resource a Planet's extractor buildings can draw from it: none, poor, normal or rich, multiplying their yield.
_Avoid_: Deposit size, planet bonus

**Stockpile cap**:
The most of a Resource a player can hold; anything over it is lost at Payday, and storage buildings raise it.
_Avoid_: Limit, storage

**Sprawl**:
The surcharge on new unit and building costs for each Planet a player owns beyond a free number.
_Avoid_: Expansion penalty, admin cap

**Exchange**:
The trade of a Resource for Credits, or Credits for a Resource, at fixed poor rates.
_Avoid_: Market, trade

**Starting Kit**:
The buildings and units a Faction places on its Capital when a Match starts.
_Avoid_: Starting army, loadout

**Planet Type**:
A template of Planet values (base income, Building Slots, Command Point bonus) that a map's Planets are based on.
_Avoid_: Biome, planet class

**Tech**:
Something a player gains by researching it: units or buildings it lets them make, or an effect; theirs on every Planet, but only while the building holding it stands. A Faction has its own Techs besides the shared ones.
_Avoid_: Technology, upgrade, unlock (an unlock is one thing a Tech can do)

**Research**:
The rate at which a player's Projects progress; never stockpiled, so it is not a Resource.
_Avoid_: Research points, science

**Lab**:
A building that holds Techs in its Tech Slots; losing it loses every Tech it holds. A Planet has at most three.
_Avoid_: Archive, research building (a Lab holds Techs, it doesn't make Research)

**Tech Slot**:
A place in a Lab that holds one Tech, reserved from the moment a Project for it starts there.
_Avoid_: Research slot (see Project limit)

**Project**:
The research of one Tech, running in a chosen Lab; a lost or cancelled Project keeps its progress for later.
_Avoid_: Research slot, research job

**Project limit**:
The most Projects a player can run at once; 3 to start, raised by Techs.
_Avoid_: Research slots, queue size

**Rarity**:
How likely a Tech is to be offered (Common, Uncommon, Rare or Legendary); each rarity above Common is offered only once the player's Research rate is high enough.
_Avoid_: Tier, level
