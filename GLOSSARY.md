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
A recurring cost a building charges its owner at each Payday; units have none.
_Avoid_: Maintenance

**Payday**:
The periodic moment when every player receives their net income in one lump sum.
_Avoid_: Income tick, week, turn

**Retreat**:
The forced move of a defeated attacking Army to its owner's nearest Planet, passing through other Planets without stopping or fighting.
_Avoid_: Rout, recall

**Rally Stack**:
The Stack on a Planet that newly trained units join.
_Avoid_: Spawn stack

**Capital**:
The start Planet a player is assigned when the Match starts; losing it eliminates them. An unused start is no one's Capital.
_Avoid_: Homeworld, HQ

**Battle**:
The automatic, round-based fight that starts when hostile forces meet at a Planet; players watch but do not act.
_Avoid_: Combat, engagement, tactical battle

**Round**:
One step of a Battle in which every living combatant gets one turn, in Initiative order.
_Avoid_: Turn (a turn is one combatant's action within a Round)

**Initiative**:
A combatant's roll at the start of each Round that sets the order in which combatants act.
_Avoid_: Speed, turn order

**Unit Class**:
A combat category of units and armed buildings (e.g. Infantry, Vehicle, Aircraft, Structure) that attackers are more or less effective against.
_Avoid_: Unit type (a unit type is a specific unit, e.g. Marine), class

**Weapon Type**:
The kind of damage a combatant deals (e.g. Kinetic, Plasma), which is more or less effective against Shield, Armor and HP.
_Avoid_: Damage type

**Locked**:
The state of a Planet while a Battle is in progress on it.
_Avoid_: Contested, in-battle

**View**:
One player's picture of a Match, limited to what their vision reveals; the only state a player is ever sent.
_Avoid_: Snapshot, game state (the full state only the server holds)

**Match Time**:
Time elapsed since a Match started; everything scheduled in a Match is placed on it.
_Avoid_: Server time, game clock

**Tactical Battle**:
A possible future player-controlled battle mode, distinct from Battle; not part of the current scope.

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
The single set of game-wide tuning values (Payday interval, refunds, Unit Slots per Stack, Battle settings) that every Match runs under.
_Avoid_: Settings, config, game rules

**Resource**:
A stockpiled currency that players earn at Payday and spend, e.g. Credits or Materials; Command Points is not a Resource.
_Avoid_: Currency, Command Points (a cap, not a stockpile)

**Starting Kit**:
The buildings and units a Faction places on its Capital when a Match starts.
_Avoid_: Starting army, loadout

**Planet Type**:
A template of Planet values (base income, Building Slots, Command Point bonus) that a map's Planets are based on.
_Avoid_: Biome, planet class
