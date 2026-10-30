# Halo Battles: tech spec (Tech tree v1)

How players research and hold Techs, mixing three games: Stellaris's research (a Research rate, a hand of cards drawn by Rarity, a Project limit), Empire at War's tech you can lose (it sits on a Planet an enemy can raid), and Halo Wars 2's unlocks and upgrades. This is the single source for tech's rules and numbers; the [game-design spec](game-design-spec.md) summarises it. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Tracked in issue #23, built in its sub-issues.

Every number here is Ruleset or Mod data, and all of them are **first-pass values meant to be tuned in playtests**.

## Techs

- A **Tech** does one or more of:
  - **unlock** units and buildings (see [Locked content](#locked-content));
  - give **effects**: flat or % modifiers (see [Effects](#effects)).
- Each Tech has a **Rarity**, a base Research cost, optional requirements, and a Faction. A Tech with no Faction is **shared**: any Faction can research it.
- A Tech may **require** other Techs and buildings. It's offered only once the player holds every required Tech and owns every required building. A required building must stand for the whole Project (it pauses without one), but not once the Tech is researched.
- Any building can be a requirement. The base Mod adds one building per Faction whose job is to open its Legendary Tech (see [Base Mod Techs](#base-mod-techs)).

## Labs

- A **Lab** is a building that holds Techs in its **Tech Slots**: 2 per Lab. Techs can raise that.
- A Planet holds at most **3 Labs**. That makes a dedicated research Planet possible, and a bigger target.
- A held Tech applies on every Planet, while its Lab stands.
- A Tech is held **once**. It can't be researched again while held, and it **never moves** to another Lab.
- Each Faction's **Starting Kit** gains one Lab on the Capital.
- Labs don't make Research.

## Research

- **Research** is a rate per second. It's never stockpiled, capped or traded, so it isn't a Resource.
- A player's Research rate is the sum of:
  - **2** from their Capital;
  - **2** from each **research building** they own. Each Faction has its own (UNSC **ONI Station**, Covenant **Seminary**: 200C 50M, 30 s, Upkeep 10C). It makes the same Research on every Planet.
- Research buildings keep working while their Planet is Locked, like income.

## Projects

- A **Project** is the research of one Tech, running in a Lab the player chose when starting it. Starting reserves one of that Lab's Tech Slots until the Project ends.
- A player runs at most their **Project limit** at once: **3**, raised by Techs.
- **Progress** is continuous, in Match Time. The Research rate is split evenly across the **running** Projects.
- **A Project pauses:**
  - while the player is in debt (every Project pauses);
  - while its Lab's Planet is Locked;
  - while a required building is missing.
  - A paused Project takes no share, so the others go faster.
- **Finishing:** the Tech is held in the reserved Tech Slot.
- **Cancelling** a Project frees its Tech Slot and its place under the limit, and keeps its progress (see [Guaranteed cards](#guaranteed-cards)).
- **A Project whose Lab is lost** stops the same way, keeping its progress.

### Cost

- A Project costs the Tech's base cost × **(1 + 10% for each Tech the player holds)**, fixed when it starts. Every Tech raises the next one's cost, so faster research needs more research buildings, and so more Planets.
- Base costs by Rarity, as a guide for content: Common 300, Uncommon 600, Rare 1200, Legendary 2400.
- The scaling percentage is a Ruleset value, to be checked in playtests.

## The hand

- While a player has room under their Project limit, they're offered a **hand of 3 cards** drawn from their pool, plus every guaranteed card.
- **The pool** is every Tech of their Faction or shared that:
  - they don't hold, and isn't in a running Project or a guaranteed card;
  - has its requirements met;
  - is of a Rarity their Research rate has opened.
- **Draw weights by Rarity:** Common 10, Uncommon 6, Rare 3, Legendary 1. With fewer than 3 Techs in the pool, the hand is smaller.
- **Picking** a card and a Lab with a free Tech Slot starts its Project. The hand stays until the player picks; there are no rerolls. After a pick, the next hand is drawn. Unpicked cards go back to the pool.
- Draws use the Match seed, so a Match replays the same.

### Rarity

| Rarity | Offered from a Research rate of | Draw weight |
|---|---|---|
| Common | 0 | 10 |
| Uncommon | 4 | 6 |
| Rare | 8 | 3 |
| Legendary | 14 | 1 |

- The threshold only controls the draw. Cards already in the hand and running Projects stay if the rate drops below it.
- The thresholds aren't shown: a rarer card turning up is the sign Research has grown.

## Losing Techs

- Losing a **Lab** loses every Tech it holds. A Lab is lost when:
  - it's destroyed in a Battle;
  - its Planet is captured (capture destroys the loser's buildings, as now);
  - the player sells it. Selling a Lab that holds Techs asks first, naming the Techs.
- **A lost Tech:**
  - stops unlocking: its units and buildings can't be queued again until it's held again. Units and buildings already made stay, and items already queued finish;
  - stops its effects at once (in-progress Battles excepted, see [Effects](#effects));
  - comes back as a [guaranteed card](#guaranteed-cards).
- Nobody else gains a lost Tech. Taking tech from an enemy is a later idea.
- **Elimination:** the player's Labs stay standing on their now-neutral Planets, but empty. Their Techs leave with them.

### Guaranteed cards

- A **lost** Tech, and a Project that was cancelled or lost its Lab, come back as a **guaranteed card**. It's offered in every hand, beside the 3 drawn cards, until it's picked.
- A lost Tech's card costs **50%** of its normal cost (with the scaling above). A stopped Project's card resumes at its saved progress.
- Guaranteed cards skip the Rarity threshold, but their requirements still apply.

## Locked content

- A unit or building named in any Tech's unlocks is **locked**: the player can queue it only while they hold a Tech that unlocks it. Everything no Tech names is free.
- A building that trains units doesn't unlock them: a unit can need its own Tech (in the base Mod the Vehicle Depot comes with the Warthog, and the Scorpion is a later Tech).
- The client shows a locked item disabled, naming the Tech it needs.
- Starting Kits may place locked buildings and units; they work, but more can't be made without the Tech.

## Effects

- An effect is a flat amount or a percentage on one thing:
  - **combat:** Shield, Armor, HP or damage, for a Unit Class or a unit;
  - **economy:** extractor yields, Upkeep, Stockpile caps, build time, Sprawl-free Planets;
  - **capacity:** the Command Point cap, the Project limit, Tech Slots per Lab;
  - **research:** the Research rate.
- **Stacking:** percentages on the same thing add (+10% and +10% is +20%), then apply once. Flat amounts add.
- Effects apply only to the holder's own units, buildings and Planets.
- **Combat effects are fixed when a Battle starts.** A Tech held or lost mid-Battle changes the next Battle, not that one.
- Lane speed, Vision range and Exchange rates are later ideas.

## Visibility

- A player's Research rate, Projects, hand and guaranteed cards are private.
- A Lab is a building, so other players see it on a Planet in their Vision, **with the Techs it holds**. That's what makes a raid a plan. Out of Vision they see it as last seen.

## UI

- The top bar shows Research per Payday, like a Resource (`+810` for 9 a second); clicking it opens the **Research panel**, docked over the map's left edge.
- The panel is a column of Project slots, as many as the Project limit. A running one shows its Tech, what it does, its Lab, and a progress bar with Research done and cost, or why it's paused. A free slot opens a popover: pick a card from the hand or back on offer (Resume, Recover), each tinted by its Rarity's colour, then a Lab with a free Tech Slot.
- The Planet window shows its Labs' Tech Slots, other players' in Vision too. Selling a Lab that holds Techs asks first, naming them.
- Locked units and buildings show disabled, naming their Tech (see [Locked content](#locked-content)).

## Ruleset additions

| Field | Default |
|---|---|
| Project limit | 3 |
| Capital Research | 2 per second |
| Tech cost scaling | +10% per Tech held |
| Lost-Tech recovery cost | 50% |
| Labs per Planet | 3 |
| Rarity thresholds | Uncommon 4, Rare 8, Legendary 14 |
| Rarity draw weights | Common 10, Uncommon 6, Rare 3, Legendary 1 |
| Hand size | 3 |

## Base Mod buildings

| UNSC / Covenant | Cost | Time | Upkeep | Role |
|---|---|---|---|---|
| Research Lab / Sanctum | 250C 100M | 45s | 15C | a Lab: 2 Tech Slots |
| ONI Station / Seminary | 200C 50M | 30s | 10C | +2 Research |
| Forerunner Dig Site / Relic Shrine | 400C 200M 50A | 60s | 20C | required by the Faction's Legendary Tech |

## Base Mod Techs

A draft for review. Requirements in parentheses; "UNSC" units below means the holder's own.

**Locked by these Techs:** Vehicle Depot / Summoning Foundry, Air Pad / Summit, Turret / Plasma Turret, Foundry / Forge, Depot / Reliquary, and the units listed. Still free: Barracks / Hall and their infantry, Supply Pad / Warehouse, Mine / Excavator, the Lab and the research building.

### Shared

| Tech | Rarity | Does |
|---|---|---|
| Refining | Common | unlocks Foundry / Forge |
| Expanded Storage | Common | unlocks Depot / Reliquary |
| Fortifications | Uncommon | unlocks Turret / Plasma Turret |
| Deep Core Extraction | Uncommon | +15% extractor yields |
| Parallel Research | Rare | +1 Project limit |
| Efficient Supply Lines | Rare | −10% Upkeep, units and buildings |
| Frontier Administration | Rare | +1 Sprawl-free Planet |

### UNSC

| Tech | Rarity | Does |
|---|---|---|
| Motor Pool | Common | unlocks Vehicle Depot, Warthog |
| Marine Training Program | Common | +10% Infantry HP |
| ONI Data Mining | Common | +1 Research |
| Main Battle Tank | Uncommon (Motor Pool) | unlocks Scorpion |
| Air Wing | Uncommon (Motor Pool) | unlocks Air Pad, Hornet |
| Titanium-A Plating | Uncommon | +10% Vehicle and Aircraft Armor |
| Logistics Command | Rare | +10 Command Points |
| Forerunner Reverse-Engineering | Legendary (Forerunner Dig Site) | +1 Tech Slot per Lab, +1 Project limit |

### Covenant

| Tech | Rarity | Does |
|---|---|---|
| Ghost Fabrication | Common | unlocks Summoning Foundry, Ghost |
| Unggoy Conscription | Common | −10% Infantry build time |
| San'Shyuum Archives | Common | +1 Research |
| Wraith Fabrication | Uncommon (Ghost Fabrication) | unlocks Wraith |
| Banshee Flight | Uncommon (Ghost Fabrication) | unlocks Summit, Banshee |
| Shield Harmonics | Uncommon | +10% Shield, every unit |
| Fleet Logistics | Rare | +10 Command Points |
| Forerunner Relic Study | Legendary (Relic Shrine) | +1 Tech Slot per Lab, +1 Project limit |

## Later

- Taking Techs from an enemy (capturing or raiding a Lab).
- Planet effects on Research, like Richness for Resources.
- Effects on Lane speed, Vision range and Exchange rates.
- A lobby setting for starting Techs or tech off.
