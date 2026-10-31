# The Battle AI's Commander assigns goals to Task Forces, not single Squads

Status: accepted (#65). It amends ADR 0005.

Under ADR 0005, the Commander scores goals and gives each Squad the one it scores highest. That score is divided by `1 + assigned`, the number of Squads already on the goal. That is what stops every Squad rushing one point, but it also spreads a side out on purpose. In playtests, Squads arrive one at a time at the speed of each unit type, fight alone, and lose. No two Squads move, wait or fire together.

We add a layer between the Commander and the Squads: the **Task Force**, a few of a side's Squads that the Commander gives one goal.

- The Commander forms Task Forces and sizes each one against the threat it has seen at the goal: enough strength to beat it, by a margin that is a Faction weight. It doesn't send one Squad per goal. A Task Force has at most 4 Squads, so a big side splits into several, which come in from different bearings. The Squads it needs on its points still guard them.
- A Task Force moves as one. It goes at its slowest member's speed, gathers at a staging cell out of the goal's threat, and goes in when its Squads are there (#62). It names one target, and its Squads attack it with `attack` orders, on top of the sim's focus fire (#60). When one member is shot at, the shooter becomes the target. Members fire on it from where their plan takes them; they don't break off to chase it, which won attackers far too many Battles.
- Within a Task Force, roles come from Unit Class content (`taskForceRole`): vehicles lead, infantry follows a few cells behind, and aircraft go for what they fight better than the rest of the force. Kiting (#63) is a vehicle's way to fight infantry.
- Retreat (#61) becomes a Task Force decision, or the side's when every Task Force is losing.
- Each Squad's GOAP planner stays, and still decides how that Squad gets into position: cover, high ground, regrouping. Scouts and skirmishers stay single Squads.

The Commander's goals are unchanged; how they're staffed changes, and a held point is worth more the more threat is seen at it. Task Forces are still built only from the side's fog-filtered view, so the AI stays honest under fog.

## Considered Options

- **Keep single-Squad goals and tune the scoring:** for example, a bonus for Squads already on a goal. Squads would still move and fire on their own, so they'd arrive together only by chance. Tuning has already shown how sensitive the scoring is: the matchup weights moved attacker wins to 75%.
- **One plan for the whole side:** rejected in ADR 0005 for the time budget, and still too large.
- **Formations held by the sim, like a Stack's slot grid at deployment:** rigid on noise terrain, where cells block and paths narrow. A Task Force only waits and gathers at its stops, so it doesn't need to keep a shape.
- **A behaviour tree per Task Force:** a fixed tree, like the one rejected in ADR 0005. A Task Force's steps (gather, move up, assault, hold, fall back) are few enough for a simple state machine.

## Consequences

- Balance will move. Each change to the Commander so far shifted attacker wins in the Starting Kit balance test by 5–20 points. The work should land in steps, each measured.
- The big three-Stack balance case, skipped under #40, should be measured again. Massed forces may change its result most.
- The glossary gains **Task Force**, and **Commander** now assigns goals to Task Forces as well as single Squads.
- Massing alone tipped Starting Kit Battles to the attacker (71%). A held point's value has to rise with the threat seen at it, so the defender masses too.
