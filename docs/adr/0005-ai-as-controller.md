# Battle AI is a Controller, like a player, and plans with GOAP

Each side of a Battle is driven by a Controller. Each tick it gets that side's fog-filtered view, the same data the side's client receives, and returns orders (`move`, `attack`, `hold`, `retreat`). The sim only carries out orders. In v1 the AI Controller runs both sides and the neutral garrison, and the player's only order is Retreat, which is merged on top of the AI and overrides it. The AI has two layers:

- a **Commander** that scores side-level goals (capture, defend, raid, kill, scout) with a utility formula and assigns one goal to each Squad;
- a **Goal-Oriented Action Planner** per Squad, a depth-capped A* over world-state facts, which chooses actions such as `takeCover`, `takeHighGround`, `regroup` and `attack` to reach its goal.

Goals and actions are Go code. Their costs and weights are content, so a Faction can have its own AI personality.

We chose this because player control is wanted later. If the AI is already just one producer of the orders a player would send, adding player control means adding a Controller, not reworking the sim. Feeding the AI only the filtered view keeps it honest under fog and tests the fog filter at the same time. Splitting the Commander from per-Squad GOAP gives coordination (not every Squad rushing one point) without planning the whole side as one search.

This replaces the "Battle target choice" Plugin seam. A future Plugin would plug in as a Controller, or as goal weights.

## Considered Options

- **A hard-coded behaviour script in the sim:** the simplest option. Rejected, because player control would then mean pulling decisions back out of the sim.
- **A behaviour tree:** workable, but it puts tactics in a fixed tree. GOAP lets Factions differ through weights alone.
- **GOAP per Squad only, without a Commander:** Squads would pick their goals on their own and pile onto the same point.
- **One GOAP plan for the whole side:** a search space too large for the 2 ms budget, and brittle when anything changes.
- **An AI that sees the full state:** cheaper, but it cheats under fog and leaves the filtered view untested.
