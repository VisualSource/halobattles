# Halo Battles

A real-time, multiplayer grand-strategy game set in the Halo universe: players build forces on planets and move them across a galaxy map to capture enemy planets, under Stellaris-style resource management.

## Language

**Match**:
One running game session of 2–4 players on one galaxy map.
_Avoid_: Game, lobby (a lobby is the pre-start phase of a Match)

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
A Planet whose loss eliminates its owner, as configured by the map.
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

**Tactical Battle**:
A possible future player-controlled battle mode, distinct from Battle; not part of the current scope.

**Mod**:
A package of content (units, buildings, planets, maps) loaded by the game; the base game is itself a Mod.
_Avoid_: Plugin (reserved for sandboxed logic extensions), addon, pack

**Plugin**:
Sandboxed custom logic shipped inside a Mod.
_Avoid_: Script, mod
