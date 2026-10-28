# Battle damage: dice rolls with advantage, not multipliers

A combatant's `damage` is a dice string, `NdM` or `NdM+K` (a Marine is `1d4`, a Scorpion `4d6+1`), checked by a JSON Schema pattern and parsed by the resolver. Every attack first rolls 1d20 against the Ruleset's `toHit` and misses below it; a hit then rolls the damage dice. Effectiveness against a Unit Class is a tier with a D&D name: `advantage` rolls both the to-hit and the damage twice and keeps the higher, `disadvantage` keeps the lower, `normal` rolls once, and `none` can't target it. The rolled damage still goes through the Weapon Type's Shield, Armor and HP multipliers, rounded down per layer, and a hit always does at least 1. Shield, Armor and HP were scaled down to dice size (about ÷8), and the roster was re-tuned so similar forces still fight for 8–15 Rounds and the two Starting Kits are roughly even.

We chose this over the earlier fixed damage × tier multiplier (`strong` 1.4, `weak` 0.6) because players can read a roll ("rolled 3") where a multiplied float means nothing, and the swing of a dice roll gives Battles some drama. Advantage on both rolls keeps the gap between good and bad matchups close to the old 1.4 / 0.6, so each Faction's defences still resist the other's main gun.

## Considered Options

- Advantage as extra bonus dice (e.g. +2d6): rejected, because a flat bonus swamps small dice like a Marine's 1d4.
- Disadvantage as half damage (D&D resistance): rejected for symmetry with advantage's roll-twice.
- A per-unit Armor Class for the to-hit roll: not yet; one Ruleset `toHit` is enough to balance for now.
- Critical hits: not yet; they can come later as a Ruleset option.
