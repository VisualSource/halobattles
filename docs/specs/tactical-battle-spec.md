# Halo Battles: tactical Battle spec

How a Battle plays out on a 2D top-down Battlefield. It replaces the round-based resolver described in earlier versions of the [game-design spec](game-design-spec.md#battles). Terms follow [GLOSSARY.md](../../GLOSSARY.md). Decisions: [ADR 0004](../adr/0004-real-time-battle-sim.md) (real-time sim) and [ADR 0005](../adr/0005-ai-as-controller.md) (AI as a Controller).

Everything about a Battle **before it starts** (who fights, Locking, waiting Armies) and **after it ends** (capture, Retreat, survivors) stays as written in the game-design spec. This spec covers what happens between those two points.

Every number below is Ruleset or content data. The values given are base-Mod defaults and **first-pass numbers meant to be tuned in playtests**.

## Overview

- A Battle is a **real-time, server-authoritative simulation** on a square-grid **Battlefield** generated for its Planet. The two sides watch it live in the Battle window, which can go full-screen.
- Each Unit Slot fights as one **Squad** token. Squads move, take cover, hold high ground and fight over **Control Points**. It is not a fight to the death.
- Both sides are run by **Controllers**. In v1 every Controller is the AI, and the only order a player gives is **Retreat**. The AI issues the same orders a player will later, so player control can be added without changing the sim.
- **Fog of war:** a side sees enemy units only within its Sight.
- The damage model is unchanged: Shield → Armor → HP layers, Weapon Types, the To-hit roll, Damage rolls and tiers ([ADR 0003](../adr/0003-dice-damage.md)). Position and terrain change **who can hit whom and how easily**, never how damage is worked out.

## Battlefield

### Size and seed

- The default size is **64 × 48 cells**. A Planet can set its own `battlefield.width` and `battlefield.height`.
- A Battlefield is generated from **the Match seed + the Planet id**, so the same Planet has the same Battlefield for the whole Match and players can learn it. It's generated once, on the Planet's first Battle, and cached for the Match.
- The client never generates terrain. `BattleStarted` carries the finished grid (see [On the wire](#on-the-wire)).

### Generation

Generation follows [Red Blob Games: terrain from noise](https://www.redblobgames.com/maps/terrain-from-noise/):

1. **Elevation** and **moisture** are two independent noise fields. Each is a sum of octaves, with frequency doubling and amplitude scaled by `persistence` per octave.
2. Each field is **ranked**: a cell's value becomes its rank as a share of the map's cells. A preset's thresholds are therefore shares of the map, so `upTo: 0.12` on the lowest band makes 12% of cells water.
3. Elevation is cut into **bands**, lowest first. The base presets use `water`, `lowland`, `highland` and `peak`, and each band sets its height level.
4. Moisture splits each band into Terrains, driest first. For example, lowland comes out as rough, open or forest.
5. A **Terrain Preset** supplies the noise parameters, the bands, and the Terrains in each. A desert Planet comes out mostly sand and rough; an ice Planet turns its lakes into ice you can walk on. A Planet names its preset in `battlefield.terrainPreset`; otherwise the Ruleset's `battlefield.terrainPreset` applies.
6. **Connectivity:** the largest region the Ruleset's `pathClass` (Infantry) can walk is the main region. Any edge's deployment strip that doesn't touch it gets the fewest blocked cells along a path cleared to the preset's `clear` Terrain. That's a ford through a lake, or a pass through peaks.
7. **Control Points** are placed in the main region (see [Control Points](#control-points)). Deployment and buildings are placed per Battle (see [Deployment](#deployment)).

### Terrain

Terrains are content (`terrains` kind). Each one has:

- `cover`: a To-hit modifier for attacks **against** a unit standing in it (forest −2, rough −1, open 0);
- `movement`: a cost per Unit Class. A Unit Class missing from it can't enter.
- a placeholder `colour` for the client.

Base-Mod Terrains:

| Terrain | Cover | Infantry | Vehicle | Aircraft | Structure |
|---|---|---|---|---|---|
| Water | 0 | impassable | impassable | 1 | – |
| Open | 0 | 1 | 1 | 1 | – |
| Forest | −2 | 1.5 | impassable | 1 | – |
| Rough | −1 | 2 | 1.5 | 1 | – |
| Peak | 0 | impassable | impassable | 1 | – |
| Ice | 0 | 1.5 | 2 | 1 | – |
| Snow | 0 | 1.5 | 1.5 | 1 | – |
| Sand | 0 | 1.5 | 1 | 1 | – |

- **Aircraft** (a Unit Class with `air: true`) move over every Terrain at cost 1. They get neither cover nor the high-ground bonus, and they give neither to an attacker or take either from one.
- Structures never move.

### Height

- A cell's **height level** comes from its elevation band: in the base presets, `water` and `lowland` are 0, `highland` 1 and `peak` 2. Water and peak cells hold no ground units.
- **High ground:** a ground attacker on a higher level than its ground target gets **+2** on the To-hit roll.
- **Sight:** a ground unit gets **+1 Sight per height level** it stands on.

## Squads

- A **Squad** is one Unit Slot in battle: one unit type, a count, and **each member's own Shield, Armor and HP**. It sits in one cell, whatever its count.
- Squads never split or merge mid-Battle.
- Each armed or unarmed building is a stationary combatant in one cell, whatever its size; bigger footprints can come with building sites (see [Later](#later)). Unarmed buildings are now targets (see [Buildings](#buildings)).
- **Occupancy:** one ground Squad or building per cell. An Aircraft Squad can share a cell with one ground Squad, but not with another Aircraft Squad. Squads can't pass through each other; pathfinding routes around them.

### Deployment

- **Defender:** each of the Planet's three Stacks deploys on one Control Point (Stack 1 at point A, and so on). Buildings stand 3 cells behind the points, away from the attacker's edge, taking Building Slots round the points in turn.
- **Attacker:** deploys in a strip 4 cells deep along one map edge, which the Battle seed picks.
- **Formations:** a Stack deploys in the shape of its 3 × 5 slot grid. The front row faces the enemy, and empty slots leave gaps. An attacking Army's slots are laid out the same way, 15 slots per formation, in slot order. A slot that lands on a blocked cell moves to the nearest free passable cell (breadth-first, ties to the lowest cell index).

## Time and movement

- **Start delay:** when an Army arrives, the Planet Locks and both sides deploy at once, but the first sim tick waits `battle.startDelay` (30 s). That gives players time to open the Battle and see the layout. The window counts down meanwhile. A Battle decided on arrival (one side has nothing that can fight) ends at once.
- The sim **steps once per match tick (5 Hz, 200 ms)**. Every duration in seconds is converted to whole ticks, rounded to the nearest one.
- Within a tick, the order is fixed:
  1. apply orders;
  2. move;
  3. fire;
  4. remove the dead;
  5. update Control Points;
  6. check the end conditions.

  Squads act in id order inside each step. Damage dealt in a tick is applied as it happens, so a Squad killed earlier in the fire step doesn't fire.
- **Movement:** a Squad gains `speed` cells' worth of movement points per second. Entering a cell costs the Terrain `cost` for its Unit Class, ×1.5 on a diagonal (8-way movement). It moves when it has enough points saved.
- **Pathfinding:** A* over the cost grid, with an octile-distance heuristic. A diagonal step can't cut past a blocked corner. A squad whose next cell is occupied waits; after 1 s it finds a way round the squads in its way. If it's already within 3 cells of its goal, it stops there instead.
- **Distance** for range and Sight is the straight-line distance between cell centres.

## Combat

### Stats

The `combat` block loses `initiative` and gains:

| Field | Meaning |
|---|---|
| `speed` | cells per second; 0 for Structures |
| `range` | the farthest a unit can fire, in cells |
| `minRange` | optional; the closest it can fire (artillery) |
| `fireInterval` | seconds between volleys |
| `sight` | Sight radius in cells |

The Ruleset's `classDefaults` holds the default value of each field per Unit Class, and a unit or building sets only the fields where it differs from them:

| Unit Class | `speed` | `range` | `fireInterval` | `sight` |
|---|---|---|---|---|
| Infantry | 1.5 | 5 | 1.5 s | 8 |
| Vehicle | 2.5 | 7 | 2 s | 9 |
| Aircraft | 4 | 6 | 1.5 s | 11 |
| Structure | 0 | 8 | 2 s | 10 |

### Firing

- A Squad fires when its `fireInterval` has run down, it has a target, and that target is visible to its side and in range.
- **Target:** the Controller's `attack` target if it has one. Otherwise the Squad picks a visible enemy in range that it can target (tier not `none`): the best tier first, then the nearest, then the lowest id.
- **A volley:** every living member makes its own attack against the target Squad. Each attack is the usual To-hit roll and, on a hit, the Damage roll, with Advantage or Disadvantage from the tier.
- **To-hit modifiers**, added to each d20 roll (after Advantage or Disadvantage picks it) and then compared with `toHit`:
  - +2 for high ground ([Height](#height));
  - the target cell's Terrain `cover`.

  Neither applies when the attacker or the target is an Aircraft.
- **Where damage lands:** each hit goes to the target Squad's **front member**, the living member with the lowest index. It goes through the layers as in ADR 0003, and damage left over after that member dies is wasted. The next hit lands on the new front member. The Squad's count falls as members die.
- A Squad under a `retreat` order never fires.

## Sight and fog of war

- Each unit has a `sight` radius, plus its height bonus. A **side sees the union** of its Squads' and buildings' Sight.
- **Always visible to both sides:** the terrain, every Control Point with its owner and capture progress, and the hold timer.
- **Visible only within Sight:** enemy Squads.
- **Buildings:** the defender always sees its own. An attacker sees an enemy building once it comes into Sight, and the client keeps a **last-seen marker** for it after that.
- **The server filters each side's data** (see [On the wire](#on-the-wire)). Hidden enemies are never sent, so fog can't be cheated.
- Line of sight is not modelled: Sight is a plain radius.

## Objectives

### Control Points

- The generator places **3 Control Points** in the main region, in the middle half of the map each way, at least `controlPointSpacing` (10) cells apart. Where they don't fit, the spacing shrinks until they do. This placement is good enough for v1; revisit it with handmade maps or the capital-world variant.
- The **defender holds all three** when the Battle starts.
- **Capture:** a point changes hands after one side has a ground Squad within **2 cells** of it, and the other side has none, for **5 s** in a row. If the lone side leaves or the other side arrives, progress resets.
- **Aircraft** neither capture nor contest a point, and nor do buildings: only ground Squads hold ground.
- **Contested:** when both sides are in range, nothing changes.

### Winning

- **Attacker wins** by:
  - holding **2 of 3 points for 30 s in a row**; the hold timer resets the moment it holds fewer than 2;
  - **elimination**: the defender has no Squads and no armed buildings left.
- **Defender wins** by:
  - the **time cap, 3 min** of fighting, counted after the start delay;
  - **elimination**: the attacker has no Squads left;
  - the attacker **Retreating** ([Retreat](#retreat-in-battle)).
- The attacker also wins when the defender Retreats.
- **Mutual wipe-out**, or both sides finishing a Retreat on the same tick: the defender keeps the Planet, as before.
- An attacker win captures the Planet; a defender win sends the attacker into Retreat. A beaten defender's surviving units, whether escaped or still on the field, Retreat too, unless they're a neutral garrison, which loses them. All of this follows the game-design spec's [Ending](game-design-spec.md#ending) rules.

### Buildings

- Buildings are a **secondary objective**. A building destroyed in Battle is **destroyed for real**: its Building Slot is freed, there's no refund, and anything queued in it is cancelled. That stays true even if the defender wins.
- Destroying buildings has no effect on the win conditions.
- A building with no `combat` block gets the Ruleset's `battle.structure` (Unit Class Structure, 0/20/30), so it can be hit. It never fires and doesn't count for elimination.

## Build pads

Spots on the Battlefield where a side that holds one can build a turret, as on Empire at War's ground maps.

- **Placement:** the generator places `battlefield.buildPads` (4) pads in the main region, away from the map edges, at least 6 cells from the Control Points and from each other.
- **Owners at the start:** pads within 10 cells of a Control Point start as the defender's; the rest start with no owner. The attacker starts with none.
- **Capture:** like a Control Point, using the same radius and time: one side's ground squads alone near it for `captureSeconds` take it. A pad with a turret on it can't be captured; the enemy has to destroy the turret first. A pad being built on can be captured, which cancels the build without a refund.
- **Building:** the side holding an empty pad can build one turret on it. A turret is a Building with `padTurret: true` and a `combat` block, of the side's own Faction. It costs that Building's `cost`, paid at once from the player's Resources, the same pool as the galaxy. It's built after `battle.padBuildSeconds` (10 s), and it exists only for this Battle. The base Mod's pad turrets are the Turret and the Plasma Turret.
- **Who decides:** a player builds with the Battle window's button; the AI never spends a player's money. A **neutral garrison** has no economy, so it gets `battle.neutralFunds` (400 Credits and 100 Materials, two turrets' worth) for the Battle, and its AI builds turrets on the pads it holds, the cheapest it can afford first.
- **Winning:** a defender's pad turrets count against its elimination, like its armed buildings. An attacker's don't: an attacker with only turrets left has lost.
- **After the Battle:** pad turrets are gone, whoever won. They aren't Planet buildings.
- **On the wire:** each pad in `BattleView`: its cell, owner, capture progress, any turret's squad id, and any build under way with the tick it finishes. The command is `BattleBuildTurret {planet, pad, building}`.

## Retreat in Battle

- **Either side** can Retreat. A **neutral** garrison never does. A defender with no other Planet to Retreat to can't, and its button is disabled.
- Pressing **Retreat** starts a countdown of `battle.retreatCountdown` (10 s) of fighting. Ordered during the start delay, it counts from the first tick. The side keeps fighting meanwhile, and pressing again calls it off.
- When the countdown ends, every squad on that side that can move turns for its **exit**:
  - the attacker's exit is its own edge;
  - each defending squad's exit is the map edge nearest to it.

  A Retreating squad holds fire, doesn't count for Control Points, and takes no more orders. Enemies keep firing at it.
- A squad that reaches its exit's deployment strip (`deployDepth` cells in from the edge) **leaves the field**. When every squad of the side that could move has left or died, the Battle ends and **the other side wins**. Both sides finishing on the same tick goes to the defender.
- Units that escape return to full layers and become a Retreating Army under the game-design spec's [Retreat](game-design-spec.md#retreat) rules.
  - **Attacker Retreats:** the defender keeps the Planet.
  - **Defender Retreats:** the attacker captures the Planet. Its buildings left standing are destroyed as on capture, and the escaped units Retreat to the defender's nearest friendly Planet.
- Buildings can't Retreat; they stay behind.
- In v1 the AI never Retreats on its own.
- The order is logged with its tick in the Battle's input log.

## Controllers

- Each side has one **Controller**. Each tick it receives that side's **filtered view** of the Battle (the same data its client would get) and returns **orders**:
  - `move(squad, cell)`
  - `attack(squad, target)`
  - `hold(squad)`: stay put and fire at anything in range
  - `retreat(side)`
- The sim only carries out orders. It never decides anything for a side beyond automatic target picking when no `attack` order is set.
- **v1 Controllers:**
  - the **AI Controller** runs both sides, and the neutral garrison;
  - a player's input is merged on top of their side's AI. The player's `retreat` overrides every AI order for that side.
- Later, player control means a Controller that forwards the player's orders, with the AI filling in for any Squad the player hasn't ordered.
- Player orders arrive as commands and are validated like any other command: the Battle exists, the player is one of its sides, the Squad is theirs. They apply on the next sim tick.

## AI

The AI Controller has two layers ([ADR 0005](../adr/0005-ai-as-controller.md)).

### Commander (side level)

- It scores **goals** with a utility formula and assigns one goal to each Squad. Each goal's score depends on:
  - the goal's value;
  - distance;
  - the enemy strength the side can see near it;
  - the strength already assigned to it, so all Squads don't pile onto one point.
- **Matchups:** a kill or raid goal's score is scaled by the squad's tier against the target: ×1.15 for Advantage, ×0.9 for Disadvantage. Kept mild: at ×1.5 and ×0.6 the attacker, free to pick its fights while the defender is tied to its points, won 75% of Starting Kit Battles.
- Caution's threat penalty applies to every goal except holding a point: a threatened point is the one to hold.
- Threat counts enemy squads the side has **seen lately**, not only those in view: each is remembered where it was last seen for 10 s, or until that spot is back in Sight without it. Without this, a squad that sighted the enemy, turned away, and lost sight of it turned straight back, over and over.
- A squad's current goal scores a quarter more (**stickiness**), so near-ties don't flip it back and forth.
- **Leash:** a squad guarding a point goes after the enemy it can see and hurt, best matchup first and then nearest, that comes within 6 cells × its aggression weight of the point, moving to a firing position and stopping to fire. It goes back to the point once that enemy dies or leaves the leash. Its goal stays "defend" throughout. At 8 cells, guards left their points open often enough to tip balance toward the attacker.
- While the attacker's hold timer runs, the defender values retaking a point at 5 instead of 3.
- **Goals:**
  - `capturePoint(p)`
  - `defendPoint(p)`
  - `raidBuilding(b)`: only buildings the side has seen
  - `killSquad(s)`: only Squads in view
  - `scout(area)`: the fallback when no enemy has been seen
- It only knows what its side's filtered view shows.

### Roles

On top of the usual goals, the Commander gives some squads a job:

- **Scouts** (the defender only, once it has at least 2 mobile squads): about 20% × its `scout` weight of them, at least 1 and at most 3, roam to the part of the map the side has looked at least lately. Blocks are 8 × 8 cells; the pick leans toward the attacker's edge and away from the side's own points. A scout keeps its waypoint until it gets there. A defender with fewer than 3 mobile squads, such as a small neutral garrison, scouts **once**: after its scout has fallen back, every squad stays for the points. Units tagged `scout` go first, then small squads (1–2 units), then the fastest; units tagged `skirmisher` only if nothing else fits.
- **Skirmishers:** a handful of squads a side can spare beyond one per point for the defender (held or to win back) and two per point for the attacker: 30% × its `aggression` weight of its mobile squads, but never fewer than 1 or more than 5. They find and delay the enemy for the main force; they aren't the main force. If the force shrinks and there are too many, the newest go back to the usual goals. Each patrols a round of the Control Points and the halfway marks between them. Units tagged `skirmisher` go first, then the fastest.
- **Contact:** a scout that meets the enemy falls back. So does a skirmisher, unless the nearest enemy in its Sight is one it doesn't have Disadvantage against and doesn't outnumber it 1.5 to 1; that one it hunts. Falling back goes to the nearest point the side holds, or else the nearest friendly squad. Once there the squad rests for 20 s as an ordinary squad before it can take a role again.
- A unit's `roles` hint is content (see [Content additions](#content-additions)). The base Warthog and Ghost are scouts; the Hornet and Banshee are skirmishers.
- **Measured** with three Stacks a side: scouts spot the attacker sooner (2.6 s instead of 3.3 s) at a cost of 2–3 points of the defender's win rate. That's down from 7 points before scouts fell back, when they fought and died alone. With Starting Kits, a two-squad defender's single scouting run moved attacker wins from 59% / 51% to 54% / 53%; letting it keep scouting made them 63% / 59%, as the points went unguarded.

### Squad planner (GOAP)

- Each Squad plans with **Goal-Oriented Action Planning**: the cheapest steps from its facts now to the facts its goal wants, searched over the few states the facts make.
- **Facts:**
  - `atGoal`: within capture radius of its point, or close to any other goal
  - `inRange`: its target can be hit from where it stands
  - `inCover`: on a Terrain with cover
  - `nearFriendly`: another of its side's squads within 3 cells
- **What a goal wants:**
  - capture and scout: `atGoal`;
  - defend: `atGoal`, and `inCover` too when the Faction's `cover` weight is 1 or more and there's cover by the point;
  - kill and raid: `inRange`, and `nearFriendly` too when the squad is under half strength and the Faction's `caution` weight is 1 or more.
- **Actions**, each with a cost in seconds of walking, or a flat cost scaled by a weight:
  - `goTo` the goal;
  - `approach`: a firing position in range of the target, trading the walk against high ground and cover by the `cover` weight (this covers the spec's `takeHighGround`);
  - `takeCover`: the nearest covered cell within 3;
  - `regroup`: to the nearest friendly squad.
- **Budget:** plans are at most 4 actions deep.
- **When it replans:** a Control Point changes hands, it loses a member, or otherwise once a second, staggered by Squad id. A replan whose next step hasn't changed keeps the destination it already sent, since every new destination costs a path.
- **Code and data:** goals, actions and facts are Go code. Their **weights** are content: a Faction's optional `ai` block of `aggression`, `caution`, `cover`, `raid` and `scout`, each defaulting to 1. The base Covenant lean keener (aggression 1.05, caution 0.9, cover 0.9); the UNSC lean careful (aggression 0.95, caution 1.1, cover 1.25). Keep them close to 1: aggression especially is a strong lever, and at 1.4 the Covenant won 80% of their attacks. The planner looks up weights **per Squad** even though v1 only has Faction weights, so per-unit weights can be added later (see [Later](#later)). A neutral garrison plays the defaults.
- **Determinism:** ties between equal plan costs or equal goal scores go to the earlier goal or the action declared first, and squads are planned in id order. Any randomness comes from the Battle RNG.

### Movement among other squads

- Long routes are A* over the terrain alone. Other squads are handled locally: a blocked squad waits; after 1 s it re-routes, or swaps places with an idle friendly; within 3 cells of its goal it stops.
- **Soft obstacles:** the re-route counts a cell another squad stands on as extra cost on top of its Terrain, not as a wall: +4 for a friendly, +8 for an enemy, which won't make way. So A* weighs going round a crowd against waiting for a gap, and a squad in a one-cell gap doesn't cut the map in two.
- If jams show up in play, the next step is grid steering (sidestep into a free neighbouring cell that's no further from the goal). After that would come flow fields for the few shared destinations (points and exits), or a cooperative reservation table. Continuous-space avoidance (RVO/ORCA) doesn't fit a one-squad-per-cell grid.

## Determinism and the input log

- A Battle is a pure function of **(Battlefield, forces, seed, player orders by tick)**. The AI is part of that function.
- The server keeps each Battle's **input log** (forces, seed, and every player order with its tick) until the Match ends. A test or debug tool can re-simulate any Battle from it exactly.
- There's no replay UI in v1.

## On the wire

- **`BattleView`**, in each side's View: the Battle as that side sees it. That's the sim tick, the attacker's edge, the side's own squads plus the enemies in its Sight, every Control Point and the hold timer. Each squad carries its id, side, unit, cell, count, starting count, and its front member's layers.
  - It's diffed and upserted in `ViewDelta` like any other entity, so it changes every tick while anything moves. Fog is enforced where the server builds it, in the sim's `Snapshot(side)`.
  - **The Battlefield** goes only in `ViewFull` and `BattleStarted`: width, height, the Terrain id table, then one Terrain index and one height level per cell. Deltas leave it out, and the client keeps it.
- **`BattleStarted`**: the two sides, the Planet, the start time and the Battlefield.
- **`BattleTick`**: one tick's volleys, `{actor, target, shots, hits, kills, shieldDmg, armorDmg, hpDmg}`. It's sent to a side only on ticks with fire that side may know about: fire at its own squads, or by or at squads it can see. A shooter it can't see is sent as `actor` 0.
- **Commands:** `BattleRetreat {planet}` and `BattleCancelRetreat {planet}`. A Battle is keyed by its Planet on the wire, as the other Battle messages are.
- A side that reconnects gets the Battle's current filtered state in its `ViewFull`. It doesn't get a replay.
- Other players with Vision see only the Locked flag and `BattleEnded`, as before.

## Watching

- The Battle window shows the Battlefield above each side's squads and the latest fire. A button (or Esc to leave) makes it **full-screen**: the map fills the screen and the rest moves to a side column. The galaxy keeps running underneath.
- It's rendered with **three.js and an orthographic top-down camera**, with no new dependency:
  - the terrain is one data texture on a plane, in placeholder Terrain colours, lighter per height level, with a faint checker so cells read;
  - fog of war is a second mask texture, cleared within your squads' Sight, which the client works out from content the same way the server does;
  - squads are tokens in the side's colour: circles for ground units, triangles for flyers, squares for buildings, each with a count badge;
  - Control Points are rings in the holder's colour, with an arc for capture progress in the taker's;
  - volleys are drawn as tracers from shooters you can see, with a flash where hits land, bigger on a kill.
- The client **interpolates** Squad positions between ticks, unless the player prefers reduced motion.
- The camera **pans by drag and zooms with the wheel** inside the map bounds, from the whole map down to a fifth of it, and never rotates.
- The window's **Retreat** button stays in place. It's disabled when Retreat isn't allowed, and while the countdown runs it shows the time left and "Cancel".
- Players who aren't sides see only "Battle in progress", as before.

## Performance

- **Budget:** ≤ 2 ms per Battle step on the server for 45 Squads a side plus 12 buildings, enforced by a Go benchmark test.
- **Work done only on change:**
  - paths are recomputed when blocked or when the goal changes;
  - a squad's next destination is re-sent only when its plan's next step changes, or once a second while chasing a moving target;
  - GOAP replans only on events or the staggered fallback.
- **Work done every tick** (cheap at this size, the first to revisit): Sight (`see()` checks every pair of squads), target picking (each firing squad scans every squad), and Control Point presence (every point against every squad).
- **Measured:** about 0.5–0.6 ms a step and about 11 KB allocated, for 45 squads a side plus 12 buildings. A* uses a typed binary heap and pooled working memory, so a path call allocates only its result.
- **Planned upgrade:** v1 steps Battles one after another inside `MatchLoop`. If the benchmark or a real Match shows the tick running long, Battles will step in **parallel goroutines** joined before the tick returns. That's safe because Battles share no state and make no Nakama API calls.

### Performance ideas, not needed yet

Each one waits until a profile or real play shows the cost. Rough order: cheapest and likeliest first.

- **Server, per tick:**
  - **A spatial grid for squads** (buckets of, say, 8 × 8 cells), so Sight, target picking and point presence look only at nearby squads instead of all of them. Worth it once Battles grow well past 45 squads a side.
  - **Sight only on change:** recompute a side's visibility only when one of its squads or an enemy changes cell. Most ticks most squads don't move.
  - **Flow fields** for the shared destinations (each Control Point and each exit edge, per Unit Class): one Dijkstra pass per Battle, after which any squad heading there follows it with no A*. Chasing a moving target still uses A*.
  - **Parallel stepping** of Battles (above).
  - **Fewer allocations in the AI planner:** reuse its open list and best-cost table between squads, as A* does.
  - **Native pathfinding** (Rust or C), last: see [Later](#later).
- **Wire:**
  - `BattleView` is upserted whole in `ViewDelta` about 5 times a second, roughly 2 KB in a big fight. If bandwidth matters, send squad-level diffs (moved, hurt, gone) instead.
- **Client:**
  - The fog mask is rebuilt from every own squad's Sight on each update. Rebuild it only when an own squad changes cell.
  - Squad tokens allocate a small vector per frame for the curved movement. Reuse one.
  - Count badges are DOM elements (about 100 at most). If that ever shows in profiles, draw them into the scene instead.
- **Saving Matches:** a running Battle's sim isn't plain data (see the `shortcut:` on `game.Battle`). To save one, store its input log (forces, seed, player orders by tick) and re-simulate.

## Pacing

- Two evenly matched forces should fight for about **1–3 minutes**.
- The two Starting Kits should stay roughly even: either one attacking wins about 45–55% of the time, on a range of seeded Battlefields, each side playing its Faction's AI weights.
- A Go test checks both over 100 seeds per matchup, allowing 40–60% for sampling noise. When last tuned: about 99 s per Battle; UNSC attacking wins 58%, Covenant attacking 51%.
- Mirror matches with neutral weights showed the attacker winning about 60% before two AI fixes: caution no longer makes defenders abandon threatened points, and the defender hurries to retake a point while the hold timer runs.

## Ruleset additions

These are replaced: the Initiative die, the Round duration and the Round cap.

| Field | Default |
|---|---|
| `battlefield.width` × `battlefield.height` | 64 × 48 |
| `battlefield.terrainPreset` | `base:temperate` |
| `battlefield.pathClass` | `base:infantry` |
| `battlefield.controlPoints` | 3 |
| `battlefield.controlPointSpacing` | 10 cells |
| `battlefield.deployDepth` | 4 cells |
| `battle.startDelay` | 30 s |
| `battle.timeCap` | 180 s |
| `battle.captureRadius` | 2 cells |
| `battle.captureSeconds` | 5 |
| `battle.holdPoints` | 2 |
| `battle.holdSeconds` | 30 |
| `battle.highGroundToHit` | +2 |
| `battle.heightSight` | +1 per level |
| `battle.structure` | Unit Class Structure, 0/20/30 |
| `battle.classDefaults` | see [Stats](#stats) |
| `battle.retreatCountdown` | 10 s |
| `battlefield.buildPads` | 4 |
| `battle.padBuildSeconds` | 10 s |
| `battle.neutralFunds` | 400 Credits, 100 Materials |

## Content additions

- **`terrains`** kind: `cover`, `colour`, and `movement` (a cost per Unit Class).
- **`terrainPresets`** kind:
  - `noise`: frequency, octaves and persistence;
  - `bands`: each with `upTo`, `height`, and its `terrains` by moisture `upTo`;
  - `clear`: the Terrain and height used to cut a path.

  The base Mod ships `base:temperate`, `base:desert` and `base:ice`.
- **Planet** (in a map): an optional `battlefield {terrainPreset, width, height}`.
- **Faction:** an optional `ai` weight block.
- **Building:** an optional `padTurret` flag: it can be built on a build pad in Battle (it needs a `combat` block).
- **Unit:** an optional `roles` list, `scout` and/or `skirmisher`: hints for which units the Battle AI picks for those jobs first.
- **`combat` block:** see [Stats](#stats).

## Later

Not in v1, but kept in mind:

- **Player control** of Squads, beyond Retreat; and AI that chooses to Retreat.
- **Per-unit AI behaviour:** a unit's own `ai` weights layered on its Faction's, plus a few extra GOAP facts and actions such as `atStandoff` and `keepDistance`. For example, artillery (long `range`, `minRange`) would weigh `takeHighGround` and `keepDistance` heavily and hang back behind friendly Squads instead of moving to the front, while a Ghost would weigh `raid`.
- **Line-of-sight** blocking.
- **Capital-world variant:** a defender HQ the attacker must reach and hold or destroy.
- **Building sites:** fixed spots on each Planet's Battlefield, with the player choosing what goes where.
- **Richer contest rules** for Control Points.
- A **hex grid**, and hex styling of the square grid in the meantime.
- **Replay UI**, built on the input log.
- **Halo-style Shield regeneration** during Battles.
- **Parallel Battle stepping** (see [Performance](#performance)).
- **Native pathfinding** (Rust or C): only if profiling, after flow fields and parallel stepping, still shows pathing as the cost. Until then the gains come from doing less work, not faster work, and cgo in the Nakama plugin build adds a toolchain to every build.
