# Galaxy Bots play through player commands, in their own goroutines

A Bot is a Seat played by the AI. It reads only its View and sends only the commands a player could; those go through the same handler as a human's, so they take seq numbers, can be rejected, and change the Match exactly as a player would. On the galaxy map it plans like the Battle AI ([ADR 0005](0005-ai-as-controller.md)): a Commander scores goals with content weights, and a Goal-Oriented Action Planner works out the first steps toward the best ones. Difficulty is a profile of weights, think interval, score noise and plan depth; no level cheats.

Each Bot runs in its own goroutine. The Match loop hands it its newest View after each tick and applies its commands at the start of the next, like a human's. A synchronous `Think` runs the same decision for tests.

We chose this so a Bot is just another source of player commands: the game needs no Bot-only rules, the command path and the View's fog filter are exercised by every Bot Match, and a slow think never holds up the tick. The cost is exact replay: a Bot's commands land on whichever tick its goroutine finishes on, as a human's do. Humans' commands aren't recorded either, so nothing replays today; tests that need determinism call `Think`.

## Considered Options

- **Bots calling game functions inside the tick:** deterministic and simplest, but a think on the tick adds its time to every player's latency, and a Bot could do what no player can.
- **A Bot that sees the full state:** cheaper, but it cheats under fog, and difficulty would come from hidden information rather than play.
- **A behaviour tree or a fixed build order:** easy to read, but difficulty and Faction personality would mean separate trees; GOAP varies them through weights, as Battles already do.
- **One GOAP plan for the whole empire:** too large a search for a few milliseconds, and brittle when anything changes; the Commander picks goals and plans each.
