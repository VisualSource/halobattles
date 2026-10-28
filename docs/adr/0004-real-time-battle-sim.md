# Battles: a real-time, server-authoritative sim on a 2D grid, not instant rounds

A Battle used to be two lines of combatants taking turns, resolved instantly and played back in 3 s Rounds, and it wasn't interesting to watch. It is now a simulation on a square-grid Battlefield generated from noise for each Planet. Each Unit Slot fights as one Squad, and the two sides fight over Control Points. The sim steps on the Nakama match tick (5 Hz), in the same `MatchLoop` as everything else, and the server streams each side a per-tick delta filtered by that side's Sight. The client only renders and interpolates. The dice damage model of [ADR 0003](0003-dice-damage.md) is unchanged; Initiative is replaced by `fireInterval`. A Battle stays deterministic, as a pure function of (Battlefield, forces, seed, player orders by tick), and the server keeps that input log so any Battle can be re-simulated.

We chose a real-time sim streamed from the server over the instant resolve-then-play-back model because Battles are meant to be watched as they happen, and because fog of war and player orders (Retreat now, full control later) need a sim that runs alongside the players. Running it on the match tick means no new process, thread or clock.

## Considered Options

- **Resolve instantly, play back in rounds (the old model):** kept determinism and was cheap, but battles had no movement, terrain or objectives. Player orders and fog of war don't fit a battle whose result is known before playback starts.
- **Simultaneous turns (WEGO):** the fallback if real-time proves too costly or too hard to read. Both sides submit orders, then a turn resolves. It would still need the same grid, Squads and Controllers.
- **Lockstep (the client runs the same sim from shared orders):** rejected. It needs Go and TypeScript sims that agree bit for bit, and it sends hidden enemies to the client, so fog could be cheated.
- **A hex grid:** deferred. Squares are cheaper to build and render, and a hex look can be styled on later.
- **One token per unit:** rejected. Slot counts are uncapped, and hundreds of tokens would be unreadable and expensive to pathfind. A Squad tracks each member's layers instead.
- **Battles stepped in worker goroutines:** deferred, behind a 2 ms per-step benchmark. Battles share no state, so it's a contained change if needed.
