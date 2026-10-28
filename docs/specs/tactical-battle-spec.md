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
- Each armed or unarmed building is a stationary combatant in one cell. Unarmed buildings are now targets (see [Buildings](#buildings)).
- **Occupancy:** one ground Squad or building per cell. An Aircraft Squad can share a cell with one ground Squad, but not with another Aircraft Squad. Squads can't pass through each other; pathfinding routes around them.

### Deployment

- **Defender:** each of the Planet's three Stacks deploys on one Control Point (Stack 1 at point A, and so on). Buildings stand 3 cells behind the points, away from the attacker's edge, taking Building Slots round the points in turn.
- **Attacker:** deploys in a strip 4 cells deep along one map edge, which the Battle seed picks.
- **Formations:** a Stack deploys in the shape of its 3 × 5 slot grid. The front row faces the enemy, and empty slots leave gaps. An attacking Army's slots are laid out the same way, 15 slots per formation, in slot order. A slot that lands on a blocked cell moves to the nearest free passable cell (breadth-first, ties to the lowest cell index).

## Time and movement

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

- The generator places **3 Control Points** in the main region, in the middle half of the map each way, at least `controlPointSpacing` (10) cells apart. Where they don't fit, the spacing shrinks until they do.
- The **defender holds all three** when the Battle starts.
- **Capture:** a point changes hands after one side has a ground Squad within **2 cells** of it, and the other side has none, for **5 s** in a row. If the lone side leaves or the other side arrives, progress resets.
- **Contested:** when both sides are in range, nothing changes.

### Winning

- **Attacker wins** by:
  - holding **2 of 3 points for 30 s in a row**; the hold timer resets the moment it holds fewer than 2;
  - **elimination**: the defender has no Squads and no armed buildings left.
- **Defender wins** by:
  - the **time cap, 3 min**;
  - **elimination**: the attacker has no Squads left;
  - the attacker **Retreating** ([Retreat](#retreat-in-battle)).
- **Mutual wipe-out**, or both sides finishing a Retreat on the same tick: the defender keeps the Planet, as before.
- An attacker win captures the Planet; a defender win sends the attacker into Retreat. All of this follows the game-design spec's [Ending](game-design-spec.md#ending) rules.

### Buildings

- Buildings are a **secondary objective**. A building destroyed in Battle is **destroyed for real**: its Building Slot is freed, there's no refund, and anything queued in it is cancelled. That stays true even if the defender wins.
- Destroying buildings has no effect on the win conditions.
- A building with no `combat` block gets the Ruleset's `battle.structure` (Unit Class Structure, 0/20/30), so it can be hit. It never fires and doesn't count for elimination.

## Retreat in Battle

- **Either side** can Retreat. A **neutral** garrison never does. The button is disabled for a defender with no other Planet to retreat to.
- Pressing **Retreat** starts a **10 s countdown**, during which the side keeps fighting normally. Pressing it again cancels the countdown.
- When the countdown ends, every Squad on that side gets a `retreat` order. It moves toward its **exit** and doesn't fire, while enemies keep firing at it.
  - The attacker's exit is its deployment edge.
  - The defender's exit is the nearest map edge.
- A Squad that reaches its exit cell **leaves the Battle**. When every one of the side's Squads has left or died, the Battle ends and **the other side wins**.
- Units that escape return to full layers and become a Retreating Army under the game-design spec's [Retreat](game-design-spec.md#retreat) rules.
  - **Attacker Retreats:** the defender keeps the Planet.
  - **Defender Retreats:** the attacker captures the Planet. Its buildings left standing are destroyed as on capture, and the escaped units Retreat to the defender's nearest friendly Planet.
- Armed buildings can't Retreat.
- In v1 the AI never Retreats on its own.

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
- **Goals:**
  - `capturePoint(p)`
  - `defendPoint(p)`
  - `raidBuilding(b)`: only buildings the side has seen
  - `killSquad(s)`: only Squads in view
  - `scout(area)`: the fallback when no enemy has been seen
- It only knows what its side's filtered view shows.

### Squad planner (GOAP)

- Each Squad plans with **Goal-Oriented Action Planning**: an A* search over world-state facts, from its current state to its goal.
- **Facts:**
  - `atCell`
  - `targetVisible`
  - `targetInRange`
  - `inCover`
  - `onHighGround`
  - `nearFriendly`
  - `healthy` (count ≥ 50% of its start)
- **Actions:**
  - `moveTo`
  - `attack`
  - `takeCover`: move to the nearest cover cell within 4
  - `takeHighGround`
  - `regroup`: move toward the nearest friendly Squad
  - `hold`

  Each action has preconditions, effects and a cost.
- **Budget:** plans are at most 4 actions deep.
- **When it replans:**
  - its goal changes;
  - its target dies or leaves view;
  - it loses a member;
  - a Control Point changes hands;
  - otherwise every 1 s.

  The 1 s fallback is staggered by Squad id across the 5 ticks of each second, so no single tick replans every Squad.
- **Code and data:** goals, actions, facts, preconditions and effects are Go code. Their **costs and weights** are content: a Faction's `ai` block, such as `aggression`, `caution`, `cover`, `raid` and `scout`. A Covenant preset can rush; a UNSC one can hold cover. The planner looks up weights **per Squad** even though v1 only has Faction weights, so per-unit weights can be added later (see [Later](#later)).
- **Determinism:** ties between equal plan costs or equal goal scores go to the lowest id, then to action declaration order. Any randomness comes from the Battle RNG.

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

- The Battle window shows the Battlefield by default. A button makes it **full-screen**, and the galaxy keeps running underneath it.
- It's rendered with **three.js and an orthographic top-down camera**, with no new dependency:
  - the terrain is one data texture on a plane, with placeholder Terrain colours and height shading;
  - fog of war is a second mask texture;
  - Squads are instanced sprites showing the side colour, a count badge, a layer bar and a facing tick;
  - Control Points are rings with capture progress;
  - volleys are drawn as tracers and flashes.
- The client **interpolates** Squad positions between ticks.
- The camera **pans and zooms** inside the map bounds and never rotates.
- The window's **Retreat** button stays in place. It's disabled when Retreat isn't allowed, and while the countdown runs it shows the time left and "Cancel".
- Players who aren't sides see only "Battle in progress", as before.

## Performance

- **Budget:** ≤ 2 ms per Battle step on the server for 45 Squads a side plus 12 buildings, enforced by a Go benchmark test.
- **Work done only on change:**
  - fog is recomputed when a Squad changes cell;
  - paths are recomputed when blocked or when the goal changes;
  - GOAP replans only on events or the staggered fallback.
- **Planned upgrade:** v1 steps Battles one after another inside `MatchLoop`. If the benchmark or a real Match shows the tick running long, Battles will step in **parallel goroutines** joined before the tick returns. That's safe because Battles share no state and make no Nakama API calls.

## Pacing

- Two evenly matched forces should fight for about **1–3 minutes**.
- The two Starting Kits should stay roughly even: either one attacking wins about 45–55% of the time, on a range of seeded Battlefields.
- A Go test checks both, as the round-based test did.

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
| `battle.timeCap` | 180 s |
| `battle.captureRadius` | 2 cells |
| `battle.captureSeconds` | 5 |
| `battle.holdPoints` | 2 |
| `battle.holdSeconds` | 30 |
| `battle.highGroundToHit` | +2 |
| `battle.heightSight` | +1 per level |
| `battle.structure` | Unit Class Structure, 0/20/30 |
| `battle.classDefaults` | see [Stats](#stats) |
| `retreatCountdown` | 10 s |

## Content additions

- **`terrains`** kind: `cover`, `colour`, and `movement` (a cost per Unit Class).
- **`terrainPresets`** kind:
  - `noise`: frequency, octaves and persistence;
  - `bands`: each with `upTo`, `height`, and its `terrains` by moisture `upTo`;
  - `clear`: the Terrain and height used to cut a path.

  The base Mod ships `base:temperate`, `base:desert` and `base:ice`.
- **Planet** (in a map): an optional `battlefield {terrainPreset, width, height}`.
- **Faction:** an optional `ai` weight block.
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

## Open questions

Defaults picked while writing this spec, not settled in the design session:

- **Aircraft and Control Points:** the spec counts only ground Squads for capturing and contesting.
- **Building footprint:** every building is one cell.
- **Unarmed building layers:** a single Ruleset default (`battle.structure`), not per building.
- **Placement:** points in the middle half each way; the defender zone is a radius around the points.
