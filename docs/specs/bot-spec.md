# Halo Battles: bot spec (Bots v1)

How a **Bot** plays a Seat on the galaxy map: the same commands a player sends, decided from the same View, by a Commander that scores goals and a Goal-Oriented Action Planner that works out how to reach them. It mirrors the Battle AI ([ADR 0005](../adr/0005-ai-as-controller.md)); why it runs as it does is [ADR 0006](../adr/0006-galaxy-bots.md). Terms follow [GLOSSARY.md](../../GLOSSARY.md). Tracked in issue #32, built in its sub-issues.

Every number here is Ruleset or Mod data, and all of them are **first-pass values meant to be tuned in playtests**.

## What a Bot is

- A Bot is a **Seat** played by the AI. It reads only its **View** and sends only the commands a player could: queue, sell, move Stacks, order and re-order Armies, Exchange, research, Retreat.
- It never cheats, at any difficulty: no hidden information, no Resource bonus. Difficulty is how well it plays.
- The Battle AI still fights every Battle, a Bot's included. A Bot's only Battle order is Retreat.

## In the lobby

- The Host adds a Bot to an empty Seat, choosing its **Faction** and **difficulty** (Easy, Normal or Hard), and can remove it.
- A Bot is always Ready, and counts toward the map's `minPlayers`. A joining player can't take its Seat.
- Its name comes from a list per Faction (UNSC: "Cmdr. Keyes", "Lord Hood", …; Covenant: "Thel 'Vadam", "Rtas 'Vadum", …), shown with a tag, "Bot · Hard".
- A Match with no human Seat left ends as abandoned, as when everyone Forfeits.

## Running

- Each Bot runs in its own goroutine. After each tick the Match loop hands it its newest View; a View it hasn't read yet is replaced, never queued.
- It thinks every **think interval** of its difficulty, staggered so Bots don't all think on one tick, each think within a few milliseconds.
- Its commands go back on a channel and are applied at the start of the next tick through the same path as a human's: they take seq numbers and can be rejected. Rejections are fed back to it.
- A Bot draws its own random choices from a stream of the Match seed. Its commands' timing depends on its goroutine, like a human's, so a Match doesn't replay exactly.
- For tests, `Think(view)` runs one think synchronously and returns its commands.

## What a Bot knows

- **Memory:** what its Views have shown, Planets out of Vision as last seen, each with its Match Time. An older sighting counts for less.
- **Strength:** a unit or armed building scores (Shield + Armor + HP) × its Damage roll's average, the threat score Planets already show, summed over a force. A Planet never seen is guessed from the map's neutral garrison for it.
- **Economy:** its Resources, caps and projected Payday, as its View has them.

## Deciding

Each think, a **Commander** scores goals, and a planner works out the first steps of the best ones.

### Goals

| Goal | Value |
|---|---|
| **Expand** | take a neutral Planet: its income, Richness and Building Slots, less its garrison's strength and its distance |
| **Attack** | take an enemy Planet: as Expand, plus the harm to that player |
| **Defend** | reinforce a threatened Planet of its own: the enemy strength seen near it against its garrison |
| **Economy** | extractors, refining, storage and research buildings, more while its income is low for its Planets |
| **Army** | production buildings and units, more while its strength is low against enemies seen |
| **Research** | an idle Research field with a card worth having, more once no Lab has a free Tech Slot |

- Each goal's score is multiplied by its **weight**: the difficulty profile's, times the Faction's `bot` weight for it. Easy and Normal add **score noise**, a random ± spread.
- A current goal scores a quarter more, so near-ties don't flip it.

### Playing to the win conditions

The Match's win conditions add to goal scores. Each condition has its own rules, in code beside it; a new mode brings its own.

- **Hold the share** (`win.planetShare` for `win.holdSeconds`):
  - Nearing the share, Expand and Attack score more on Planets that would take it over.
  - Holding it, Defend dominates until the countdown runs out.
  - When an enemy runs a hold countdown, breaking it comes first: Attack on that player's most reachable Planet.
- **Last standing:** enemy **Capitals** score extra, since taking one eliminates its player. Its own Capital always keeps a stronger home guard.

### Planning

- The top-scoring goals are funded in score order until the budget is spent. Each gets a **GOAP plan**: a depth-capped search over abstract facts, to the difficulty's **plan depth**.
- A goal it can't afford now but can after the next Payday is **saved for**: nothing scoring less is funded that think. One that even the next Payday can't afford is passed over.
- Facts are things like *has an Army of strength N at Planet X*, *has a production building for unit U*, *can afford C*, *holds Tech T*. Actions turn into commands: build, train, research, move units, order an Army, Exchange.
- Only a plan's first actions are sent. The next think plans again from the new View, so nothing is tracked step by step.

## Armies

- Each Planet keeps a **home guard**, sized by the enemy strength seen near it and the Defend weight; the Capital's is larger.
- Expand and Attack gather spare units at a **staging Planet**, the Bot's own Planet nearest the target, and order the Army once its strength reaches the target's estimate × the difficulty's **attack margin**, each side's counted with its Advantage tiers against the other's Unit Classes. Units still on their way count toward it, and the Army waits for them. A staging Planet keeps what it has: units gather there only from Planets that aren't staging.
- One attack at a time on a Planet: no Army goes while one is headed there or fighting there, since it would wait in orbit and fight alone once that Battle ended.
- **Failed attacks:** each attack that ends without taking the Planet (lost, or Retreated from) asks half as much again of the next Army there. Taking the Planet clears them.
- **Out of reach:** at its Command Point cap, Expand or Attack on a Planet its whole force couldn't take, counted as an attack would be, scores a tenth. It can't grow toward it, and chasing it would keep units staged that other goals could use.
- Trained units join the Rally Stack (Stack 1). A Bot doesn't rearrange Stacks beyond picking units for Armies.
- **Retreat:** in a Battle, the Bot orders a Retreat once its side's strength falls below its difficulty's share of the enemy's.

## Building and training

- **Placement:** extractors where Richness is highest, production buildings on the Planets nearest the front, Labs spread one per Planet before any Planet has two, research buildings on the safest Planets.
- **Units:** Normal and Hard score each trainable unit by its Advantage tiers against the enemy units they've seen, per cost. Easy trains a fixed mix.
- **Better armies:** Normal and Hard build production for a unit a fifth better than any they train now, and count a Resource three times while the best unit they could have needs it and nothing earns it (Alloys for vehicles), so their economy builds toward that army.
- **Prices:** a Bot weighs Resources at their Exchange rate into the Resource the most rates sell into (Credits in the base Mod): an Alloy is worth 2, a Material half.
- **Money:** a Bot plans against its projected Payday, never queues into debt, and keeps a **reserve** of its caps. When one Resource is short and another near its cap, it uses the Exchange.

## Research

- Every Research field idle is its whole rate wasted, so a Bot keeps each one running.
- Normal and Hard score each card in an idle field's hand by how much it serves their top goals: an unlock their unit choice needs, the economy Techs while Economy weighs heavily. Recover and Resume cards get a bonus. Easy picks the first card.
- A research building is worth its field's Research, weighted by the goal that field serves, its Ruleset `botGoal`: Military by Army, Industry by Economy, and a field naming none (Logistics) by the higher of the two.
- The Lab is the one with the most free Tech Slots on the safest Planet.

## Difficulties

The Ruleset's `botDifficulties`, one profile per level; a Mod can retune them or add one.

| | Easy | Normal | Hard |
|---|---|---|---|
| Think interval | 10 s | 5 s | 2 s |
| Score noise | ±30% | ±15% | none |
| Attack margin | 1.0× | 1.25× | 1.5× |
| Plan depth | 3 | 5 | 8 |
| Reserve | 10% | 15% | 20% of caps |
| Retreat below | never | 40% | 50% of the enemy's strength |
| Goal weights | all 1 | all 1 | all 1 |
| Unit choice | fixed mix | by Advantage | by Advantage |
| Research | first card | by goals | by goals |

A Faction's `ai` block gains a `bot` sub-block of goal weights (`expand`, `attack`, `defend`, `economy`, `army`, `research`); anything left out is 1.

## Testing

- Headless Bot-vs-Bot Matches from seeds, with no humans and no Nakama, calling `Think` directly.
- Hard beats Easy in at least 80% of seeded Matches on the base map. Not met yet: `TestHardBeatsEasy` has Hard winning 9 of its 20 seeds, about chance. Tuning waits for playtests. `HALO_BOT_SWEEP=1 go test ./internal/bot -run TestHardBeatsEasy -v` plays the sweep with each Bot's stats; it fails on a Match that doesn't end or a Bot left idle, and logs the win rate.
- Every Bot Match ends within a Match-Time cap, and no Bot sits idle with Resources to spend and nothing queued.

## Later

- A **spectator view** for eliminated players, and watching Bots play each other in a Match with no human Seat; a Match still ends when no human is left in it.
- A cheating "Brutal" difficulty.
