# RTS bots that are fun to fight

Researched 2026-11-03. Status: **research only**; nothing is built from it yet. It surveys how RTS and strategy-game bots are built, and what their developers did to make them fun rather than only strong, so the [Bot spec](../specs/bot-spec.md) and the Battle AI ([ADR 0005](../adr/0005-ai-as-controller.md), [ADR 0007](../adr/0007-battle-ai-task-forces.md)) can borrow from it.

Sources are the developers' own talks, papers, book chapters and shipped code wherever they could be found. A claim with only a secondary source says so, and the [Not verified](#not-verified) section lists what couldn't be traced to a primary source at all.

## Verdict

**Strength isn't fun, and players can't see most of what a bot does.**

- In a controlled study, how much players enjoyed a bot **didn't correlate with its difficulty, how hard it seemed, or how realistic it seemed**. Players almost never worked out a bot's strategy: 83% failed to spot one that picked targets at random. ([Wetzel & Anderson, Game AI Pro 3 ch. 4](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf))
- Developers who wrote about this treat the AI as **content that should lose well**, not as an opponent that should win. Soren Johnson calls this "fun AI" as opposed to "good AI" ([GDC 2008 talk page](https://www.designer-notes.com/playing-to-lose-ai-and-civilization-gdc-2008/), [Game Watch report](https://game.watch.impress.co.jp/docs/20080222/ai.htm)). Lars Lidén: "Creating an NPC that can beat a human player is relatively easy. Creating one that can lose to the player in a challenging manner is difficult." ([AI Game Programming Wisdom ch. 1.4](https://www.cs.drexel.edu/~santi/teaching/2012/CS680/papers/Intro-ArtificialStupidity.pdf))
- **Cheating is judged by what players notice, not by what the code does.** Small, gradual, explained bonuses are accepted. Visible rule-breaking is resented, such as units appearing under fog or free Wonders. ([Johnson, "Game AI & Our Cheatin' Hearts"](https://www.gamedeveloper.com/game-platforms/analysis-game-ai-our-cheatin-hearts))
- The fun techniques with the best sources are:
  - **tell the player what the bot is about to do;**
  - **pace pressure in waves, with breathers between them;**
  - **give bots personalities through data;**
  - **make mistakes on purpose, in plausible ways;**
  - **avoid behaviour that feels "computery"**, such as instant reactions, constant target switching, relentless pursuit and perfect aim.

## Common architectures

Most shipped RTS bots have the same shape:

- a **world model** of analysers or managers that summarise the state;
- a **strategic layer** that picks goals or a strategy;
- **managers** for economy, building and research;
- **squads or task forces** that carry out military goals.

Each layer can be swapped, and the strategy is usually a data table.

### Build orders and scripts

- **Age of Empires II.** The AI is a rule script, a list of `defrule` condition-and-action pairs. The HD-era default script shipped with the game (by Archon and Promiskuitiv, who later wrote the DE AI) has separate blocks per difficulty, Easiest to Hardest. ([copy of the HD AI script](https://gist.github.com/hastebrot/5a797945e0b3d7b4fc4488f474b4e04d); a fork, not Microsoft's own page)
- **UAlbertaBot (StarCraft: Brood War competition bot).** Its strategy is a named build order chosen from config. Its source splits into a `GameCommander` with these managers ([UAlbertaBot source](https://github.com/davechurchill/ualbertabot/tree/master/UAlbertaBot/Source)):
  - `StrategyManager`
  - `ProductionManager`, with build-order search in `BOSSManager`
  - `CombatCommander` with `Squad`s
  - `ScoutManager` and `WorkerManager`
- **Halo Wars 2.** Each AI commander is driven by **strategy tables** that designers author in XML. A table sets the build order, the tech and leader-power unlock order, and preferred sub-missions (attack structures, defend, scout, forage). There are five macro strategies (Rush, Boom, Map Control, Fast Tech, Turtle) and ten micro behaviours, such as focus fire, pullback and kiting. It shipped with 94 tables (28 campaign, 66 skirmish), and 220 after DLC. Source: [Tommy Thompson, "Atriox's Commander AI in Halo Wars 2"](https://www.gamedeveloper.com/design/atriox-s-commander-ai-in-halo-wars-2). This is a secondary write-up, reviewed by Creative Assembly staff according to its acknowledgements. No first-party talk was found.

### Economy, construction and task managers

- **Total War campaign AI (Creative Assembly).**
  - **Analysers** form the world state: military strength, faction strength, attitudes, finances, unit availability, geospatial tasks.
  - **Subsystems** sit on top: Financial, Construction, Diplomacy, Task Management, Technology and Character Management.
  - **Task Management** generates tasks, then allocates armies to them and coordinates them with **Monte Carlo Tree Search**.
  - An army's minimum strength for a task is scaled by a personality's `enemy_strength_modifier`, and its recommended strength is twice that minimum.

  Source: [Davidson & Cakmak, ACCU 2018 slides](https://accu.org/conf-docs/PDFs_2018/Guy_Davidson__Duygu_Cakmak_-_How_AI_can_deliver_entertainment_in_Total_War.pdf).
- **0 A.D. Petra AI.**
  - It has a headquarters, an attack manager and a defense manager.
  - The attack manager runs four attack types: **Rush**, **Raid** (against units the defense manager flagged), **Default** and **HugeAttack**. After the first two attacks, later ones are Huge.
  - It targets, in order: the owner of an enemy Wonder or the most Relics (in those victory modes); the nearest enemy civic centre; then the enemy with the most entities.
  - Rushes skip enemies with more than six defensive structures.

  Source: [attackManager.js](https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/simulation/ai/petra/attackManager.js).

### Squads and task forces

- **OpenRA `SquadManagerBotModule`.** Its squad types are Assault, Rush, Protection, Air and Naval. ([SquadManagerBotModule.cs](https://raw.githubusercontent.com/OpenRA/OpenRA/bleed/OpenRA.Mods.Common/Traits/BotModules/SquadManagerBotModule.cs))
  - **Assault:** idle units pool at base until `SquadSize` is reached. A random `SquadSizeRandomBonus`, default up to 30 units, is added each time, so the threshold varies.
  - **Rush:** tried every `RushInterval` against enemy Construction Yards, through a fuzzy attack-or-flee check.
  - **Protection:** reacts to attacks on listed buildings, with a 30-tick cooldown that "prevent[s] too many responses to the same wave of attacks".
  - **Staggering:** timers are randomised at start ("Avoid all AIs trying to rush in the same tick").
- **Supreme Commander 2.**
  - Platoons ran a finite-state machine, and a **neural network** decided fight-or-flight when a platoon met enemies.
  - There were four networks, one per platoon type: land, naval, bomber, fighter.
  - The inputs were 17 friendly-to-enemy stat ratios and their reciprocals: DPS by range, health, shields, speed, value, repair rate.
  - Each network took about an hour of training and under 0.03 ms to evaluate.

  Source: [Robbins, Game AI Pro ch. 30](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter30_Using_Neural_Networks_to_Control_Agent_Threat_Response.pdf).
- **UAlbertaBot retreat.**
  - A squad on an attack order runs a SparCraft combat simulation when an enemy is in range, and regroups if the score is negative.
  - It uses **hysteresis**: "we should not attack unless 5 seconds have passed since a retreat", so it doesn't flip between attacking and retreating.

  Source: [Squad.cpp](https://github.com/davechurchill/ualbertabot/blob/master/UAlbertaBot/Source/Squad.cpp).
- **Combat outcome prediction.** Lanchester attrition models, extended for RTS, are a cheap alternative to simulation for the attack-or-retreat decision. ([Stanescu, Barriga & Buro, Game AI Pro 3 ch. 25](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter25_Combat_Outcome_Prediction_for_Real-Time_Strategy_Games.pdf))

### Influence maps and spatial reasoning

- **Kohan II.**
  - The map is split into regions by flood-filling tiles into rectangles. Chokepoints are found from them and used for defences.
  - Each unit's influence falls off with travel distance.
  - Friendly and enemy influence are **kept separate rather than subtracted**: subtraction hides the difference between a hotly contested tile and an empty one.
  - Counting 25% of allies' influence as your own attack power was "the only thing that we did to encourage teamwork between AI players that were allies". It "resulted in really nice coordinated attacks and/or one-two punches".

  Source: [Dill, Game AI Pro 2 ch. 31](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter31_Spatial_Reasoning_for_Strategic_Decision_Making.pdf).
- **Modular influence maps.** The approach combines threat, proximity and "interest" templates with add, multiply, normalise and invert operations into a working map for each query. ([Mark, Game AI Pro 2 ch. 30](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf))
- **Paragon (MOBA bots).** An influence map is combined with a per-lane "front line", so bots don't chase heroes too deep into enemy territory. ([Zieliński, Game AI Pro 3 ch. 32](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter32_Paragon_Bots_A_Bag_of_Tricks.pdf))

### Utility and personality weights

- **Utility AI.** It scores each option through response curves (linear, quadratic, logistic) and picks the best, or picks by weighted random. "Factors can also be further modified by weights that determine how much the AI cares about that particular factor, which emulates personality." ([Graham, Game AI Pro ch. 9](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf))
- **Civilization IV.**
  - Its AI, about 25,000 lines, evaluates *effects* (happiness, cost) rather than hard-coding specific buildings. That is what let data-driven mods work.
  - Its source was released, and the community's "Better AI" was adopted for *Beyond the Sword*.

  Source: [Game Watch report of Johnson's GDC 2008 talk](https://game.watch.impress.co.jp/docs/20080222/ai.htm), translated from Japanese.

## Difficulty design

Studios scale difficulty with three kinds of lever, often mixed:

| Lever | Examples |
|---|---|
| **Economy and stat bonuses** | Petra; Civ IV; Supreme Commander AIx; BAR Raptors' `damageMod`/`healthMod` |
| **Better play** | Halo Wars 2 tables scaled down from Legendary; AoE III: DE "Extreme"; OpenRA, which has no difficulty levels, only styles |
| **Handicaps** | Petra's population cap and no city phase on Very Easy; AlphaStar's APM caps and camera view; Paragon's aim deviation on Easy |

- **0 A.D. Petra** mixes all three ([config.js](https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/simulation/ai/petra/config.js)):
  - Gather-rate multipliers from Sandbox to Very Hard are `0.42, 0.56, 0.75, 1.00, 1.25, 1.56`. Build and train-time multipliers are `1.40, 1.25, 1.10, 1.00, 1.00, 1.00`, applied as an "AI Bonus" modifier.
  - Sandbox and Very Easy also halve population (`popScaling = 0.5`) and never reach the city phase (`workPhase3 = Infinity`).
  - Target worker counts are capped at 40, 60 or 120 by tier.
- **Civilization IV.**
  - The AI gets research and production bonuses by difficulty. At Noble the bonus is zero, and at the highest level it is 40%. ([Game Watch report](https://game.watch.impress.co.jp/docs/20080222/ai.htm))
  - Earlier games cheated more blatantly: free Wonders in Civ I, and implicit AI alliances against the human in Civ II. Civ III and IV moved to subtler advantages. (same source)
- **Supreme Commander: Forged Alliance.**
  - The lobby lists honest AIs (Easy, Normal, Adaptive, Rush, Turtle, Tech) and separate **"AIx" cheating AIs**. The AIx ones carry a Cheat Multiplier and a Build Multiplier from 0.1 to 5.9, and an "Omni" full-map-intel toggle.
  - The type list file is Gas Powered Games' (© 2006). The multiplier options are as they stand in the community Forged Alliance Forever fork.

  Sources: [aitypes.lua](https://github.com/FAForever/fa/blob/develop/lua/ui/lobby/aitypes.lua), [lobbyOptions.lua](https://github.com/FAForever/fa/blob/develop/lua/ui/lobby/lobbyOptions.lua).
- **Age of Empires II (HD AI).** Resource cheats are opt-in: "Taunt 200: Enables resource cheats - only works on 'hardest' difficulty". ([HD AI script copy](https://gist.github.com/hastebrot/5a797945e0b3d7b4fc4488f474b4e04d))
- **Halo Wars 2** ([Thompson](https://www.gamedeveloper.com/design/atriox-s-commander-ai-in-halo-wars-2), secondary):
  - Designers aimed for commanders that play "without resorting to cheating".
  - Skirmish tables were built for Legendary and **scaled down**, limiting uber units, turret counts, tech and leader-power upgrades, and some micro behaviours.
  - After launch, lower difficulties were weakened again: they upgraded less, used leader powers less, rebuilt less and spread out more. They had turtled so hard that novices couldn't beat them.
- **Age of Empires III: Definitive Edition.** The developer said higher levels "micro-manage better—including hit-and-run tactics", which led them to add "Extreme", "much stronger than the original 'Expert' AI". ([World's Edge interview with Joss Ellis](https://www.ageofempires.com/news/interview-joss-ellis/))
- **Handicaps that mimic human limits.**
  - **AlphaStar** averaged about 280 APM with a 350 ms observation-to-action delay. Its first matches used a raw whole-map interface, and a camera-limited version came later. ([DeepMind](https://deepmind.google/discover/blog/alphastar-mastering-the-real-time-strategy-game-starcraft-ii/))
  - For the public ladder, it had caps on actions per minute and per second, "designed in consultation with pro players", and saw only what was in its camera view. ([Blizzard FAQ](https://news.blizzard.com/en-us/article/22933138/deepmind-research-on-ladder))
  - **Paragon's** Easy bots add aim deviation, while higher bots keep perfect aim to "bridge the skill gap". ([Zieliński](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter32_Paragon_Bots_A_Bag_of_Tricks.pdf))
  - **Reaction times:** "The fastest a hyperfocused human can react is 0.2 seconds with mental comparisons requiring a bare minimum of 0.4 seconds... Use these times as the baseline to always delay the results of a decision." ([Rabin, Game AI Pro 3 ch. 1](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter01_The_Illusion_of_Intelligence.pdf))

### What players perceive as fair

- **Hidden and gradual is accepted; visible is resented.** Civ's small incremental discounts went unnoticed. Its fog-of-war unit creation, instant free Wonders, hard-coded dogpiling of the leader and Civ III's tech-trading "cartel" were resented. Johnson's advice: make rules explicit, keep hidden advantages small, and if you must cheat, cheat in the player's favour. ([Cheatin' Hearts](https://www.gamedeveloper.com/game-platforms/analysis-game-ai-our-cheatin-hearts))
- **Players are bad at detecting cheating either way.** They see it when it isn't there and miss it when it is. (Johnson, as reported in the [Game Watch report](https://game.watch.impress.co.jp/docs/20080222/ai.htm))
- **Hidden help went unnoticed in the study.** The "hustling" bots quietly shaved their own damage rolls when far ahead. Players rated them exactly as hard as the honest versions, though they won far less (57% vs 71%; 30% vs 70%). "It is critical that the AI not get caught cheating." ([Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf))
- **Partial-information estimates are a middle ground.** Kohan II argues influence maps that roughly sense unseen units are "a nice balance between a truly noncheating AI and an AI that doesn't blatantly cheat". A strictly fog-honest AI can be duped into attacking the wrong place, which "will make the AI look stupid and will make the game less fun". ([Dill](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter31_Spatial_Reasoning_for_Strategic_Decision_Making.pdf))

## Techniques for fun

### Telegraphing and telling the player

- **Warn before attacking:** use an "about-to-attack" animation, a sound, or a bark like "Gotcha!".
  - Warnings make clever AI *more* visible: "If the players are immediately killed as they fall into the ambush, they won't have time to comprehend their opponent's crafty tactics."
  - Announcing actions ("Flanking!", "Retreat!") makes players credit intelligence, "often... where none exists".

  Source: [Lidén](https://www.cs.drexel.edu/~santi/teaching/2012/CS680/papers/Intro-ArtificialStupidity.pdf).
- **Show the bot sizing up its options.** An AI that "spends a second looking at each enemy and sizes them up before attacking" telegraphs a decision it made instantly. In F.E.A.R., squad dialogue was "all smoke and mirrors" that sold coordination. ([Rabin](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter01_The_Illusion_of_Intelligence.pdf))
- **A visible threat meter (Beyond All Reason Raptors).** The PvE mode shows "Queen Hatch: x% (+y%/s)", broken down into Base, **Player Aggression** and **Economy** gain, along with a "Queen arrives in" countdown and "Prepare yourself for the final battle!" ([interface.json](https://github.com/beyond-all-reason/Beyond-All-Reason/blob/master/language/en/interface.json), [gui_raptorStatsPanel.lua](https://github.com/beyond-all-reason/Beyond-All-Reason/blob/master/luaui/Widgets/gui_raptorStatsPanel.lua))
- **Chat that explains the bot.**
  - **Petra** tells allies when it launches an attack and whom it targets ("I am launching an attack against %(_player_)s"). It explains refusals of help ("my next attack will target …"), calls for help when losing, and announces diplomacy changes to everyone. ([chatHelper.js](https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/simulation/ai/petra/chatHelper.js))
  - **The AoE II HD AI** answers taunts: 230+N makes it "target this enemy for 10 minutes", and 250 "Chats information about the current strategy". ([HD AI script copy](https://gist.github.com/hastebrot/5a797945e0b3d7b4fc4488f474b4e04d))

### Waves, pacing and breathers

- **Left 4 Dead's AI Director.**
  - It tracks each survivor's "intensity" and cycles through **Build Up**, **Sustain Peak** (3–5 s), **Peak Fade** and **Relax** (30–45 s of minimal threats).
  - "Constant, unchanging combat is fatiguing. Long periods of inactivity are boring."
  - It changes "pacing, not difficulty... Amplitude (difficulty) is not changed, frequency (pacing) is."

  Source: [Booth, "The AI Systems of Left 4 Dead"](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf). This is from a shooter, but it is the clearest primary source on breathers.
- **Back off sometimes.** "Enemies that temporarily back off are much more enjoyable adversaries", as in Pac-Man's attack/retreat ghost waves. ([Rabin](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter01_The_Illusion_of_Intelligence.pdf))
- **Escalating waves with a grace period (BAR Raptors).**
  - Each difficulty sets a grace period before waves start (9, 8, 7, 6, 5, 4 minutes from Very Easy to Epic) and a queen arrival time (55 down to 30 minutes).
  - It also sets spawn rates, the most raptors alive at once (25 to 45, scaled by economy), and damage and health modifiers (0.4/0.5 on Very Easy up to 1.2/1.25 on Very Hard).

  Source: [raptor_spawn_defs.lua](https://github.com/beyond-all-reason/Beyond-All-Reason/blob/master/luarules/configs/raptor_spawn_defs.lua).
- **Early pressure as a dial (0 A.D. Petra).** The number of rushes comes from personality, not difficulty: 3 rushes (16/20/24 units) for strongly aggressive, 2 or 1 below that. ([attackManager.js](https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/simulation/ai/petra/attackManager.js))

### Rubber-banding and dynamic difficulty

- **Racing games.** AI cars ahead of the player slow down and those behind speed up, with a dead zone near the player so close racing looks normal. "When done poorly, it can leave the player feeling cheated." ([Melder, Game AI Pro ch. 42](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter42_A_Rubber-Banding_System_for_Gameplay_and_Race_Management.pdf))
- **Pull back at the last minute.** Attack hard until the player is near the edge, then ease off so they win feeling accomplished. "If the trick is perceptible, it unequivocally ruins the game-playing experience." ([Lidén](https://www.cs.drexel.edu/~santi/teaching/2012/CS680/papers/Intro-ArtificialStupidity.pdf))
- **Hustling** never improves the bot's odds, only lowers them, because "players are more likely to notice (and complain) when an AI does better than normal than when they do worse." If the player has no way back, the bot should "ruthlessly crush" them, so that a later win feels earned. ([Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf))
- **Open rubber-banding** works if it is a rule players can see. Johnson's examples are Mario Kart's item boxes and Catan's robber ([Cheatin' Hearts](https://www.gamedeveloper.com/game-platforms/analysis-game-ai-our-cheatin-hearts)). BAR's queen-anger gain from "Player Aggression" and "Economy" is shown on screen in the same spirit (sources above).

### Personalities and archetypes

- **OpenRA** ships **Rush, Normal, Turtle and Naval** bots from one set of modules with different YAML ([ai.yaml](https://raw.githubusercontent.com/OpenRA/OpenRA/bleed/mods/ra/rules/ai.yaml)):
  - `SquadSize` is 20, 40, 10 and 1.
  - Turtle sets `RushInterval` and `MinimumAttackForceDelay` to 100000 ticks, so in practice it waits before attacking.
  - Turtle builds far more defences and only one barracks or factory of each kind, and adds a minelayer.
- **0 A.D. Petra** maps "aggressive", "balanced", "defensive" and "random" to ranges of continuous traits. It also has a random "cooperative" trait, raised in locked-team games. Those traits move tower and fortress timing, early barracks and rush counts. ([config.js](https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/simulation/ai/petra/config.js))
- **Supreme Commander 2.** An aggression value scaled the network's inputs, "to mimic the effect of the AI's units being stronger than they actually were", which gives a more aggressive AI with no retraining. Picking among the top N actions gives variety, at the cost of strength. ([Robbins](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter30_Using_Neural_Networks_to_Control_Agent_Threat_Response.pdf))
- **Supreme Commander: Forged Alliance** exposes Rush, Turtle, Tech and Adaptive as separate lobby AIs. ([aitypes.lua](https://github.com/FAForever/fa/blob/develop/lua/ui/lobby/aitypes.lua))
- **Civilization IV.** Leaders act in character even when it's inefficient: Tokugawa rarely trades tech and keeps his borders closed. That is a poor strategy, but it gives the leader personality and the player a story. ([Game Watch report](https://game.watch.impress.co.jp/docs/20080222/ai.htm))
- **Total War** diplomacy ranks goals by "personality based priorities". ([ACCU slides](https://accu.org/conf-docs/PDFs_2018/Guy_Davidson__Duygu_Cakmak_-_How_AI_can_deliver_entertainment_in_Total_War.pdf))
- **Halo Wars 2.** Each leader's strategy table sets its style, and behaviours are added over a match so its play develops. ([Thompson](https://www.gamedeveloper.com/design/atriox-s-commander-ai-in-halo-wars-2), secondary)
- **Caution: players can't read personality.** In the study, players couldn't detect even blatant traits like team-wide revenge or switching strategies. They also believed bots had personalities that weren't there. ([Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf))
  - Our inference: a personality has to be *announced* (a name, a chat line, a lobby label) to land.

### Deliberate mistakes and letting the player feel clever

- **Plausible intentional mistakes.** "Fun can be maximized when mistakes made by computer opponents are intentional", tuned "to be intentional but plausible". ([Lidén](https://www.cs.drexel.edu/~santi/teaching/2012/CS680/papers/Intro-ArtificialStupidity.pdf)) His tricks, written for shooters:
  - miss the first shot;
  - have bad aim, since near misses make players credit their own movement;
  - attack "Kung-fu style", where Half-Life let only two marines shoot at a time;
  - build in vulnerabilities, so the player discovers designed weaknesses rather than bugs;
  - turn real mistakes into personality, such as an "Oh no!" after a bad grenade.
- **The wrong kind of error breaks the illusion.** A billiards AI that made a pro shot and then missed three easy ones "forcefully remind[ed] the player that he or she was just playing a computer". ([Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf))
- **Pick the second-best target.** Some hustling bots chose it when it was within 20% of the best, or switched to a still-good second strategy when far ahead. (same source)
- **Ration damage, don't just lower it.**
  - A token or timer decides when a shot may actually hit. The delay is multiplied by context: distance, whether the player is in cover, and whether they are facing away or fleeing.
  - This avoids sudden damage spikes when many enemies fire at once.

  Source: [Ocio Barriales, Game AI Pro 3 ch. 33](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter33_Using_Your_Combat_AI_Accuracy_to_Balance_Difficulty.pdf). This is from a shooter, but the same idea applies to an RTS battle's damage pacing.
- **Teach through the enemy.** "If the player can learn from the strategies of their enemy, then they are being shown how to take advantage of the environment themselves." ([Dill](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter31_Spatial_Reasoning_for_Strategic_Decision_Making.pdf)) Halo Wars 2 commanders are likewise meant to teach the game ([Thompson](https://www.gamedeveloper.com/design/atriox-s-commander-ai-in-halo-wars-2), secondary).

### Avoiding frustrating behaviour

- **Constant target switching looks "computery".** Human players were persistent, and they took revenge on whoever hit them. ([Wetzel & Anderson](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter04_Player_Perception_of_AI_Opponents.pdf))
- **Relentless pursuit.** Stop chasing the player "relentlessly, similar to a terminator". Real creatures hesitate and reconsider. ([Rabin](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter01_The_Illusion_of_Intelligence.pdf))
- **Retreat flip-flopping.** UAlbertaBot won't re-attack within 5 seconds of retreating. ([Squad.cpp](https://github.com/davechurchill/ualbertabot/blob/master/UAlbertaBot/Source/Squad.cpp))
- **Cheap shots on arrival.** NPCs should "move the first time they see the player rather than shoot at them". ([Lidén](https://www.cs.drexel.edu/~santi/teaching/2012/CS680/papers/Intro-ArtificialStupidity.pdf))
- **Perfect micro and instant reactions.** See the handicaps above: AlphaStar's caps, Rabin's 0.2–0.4 s delays, Paragon's aim deviation on Easy.
- **Over-defensive low difficulties.** Halo Wars 2's novice-level turtling was patched out. ([Thompson](https://www.gamedeveloper.com/design/atriox-s-commander-ai-in-halo-wars-2), secondary)
- **Bots charging off at match start.** Players in mixed human-bot teams complained when all the Paragon bots raced down the lanes at the start of a match, and it was suggested they wait a moment instead. ([Zieliński](http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter32_Paragon_Bots_A_Bag_of_Tricks.pdf))
- **Synchronised bots.** OpenRA randomises timers so bots don't all rush on the same tick. ([SquadManagerBotModule.cs](https://raw.githubusercontent.com/OpenRA/OpenRA/bleed/OpenRA.Mods.Common/Traits/BotModules/SquadManagerBotModule.cs))
- **Playtest with fresh, naive players.** Ask them what they think happened, not what the AI did. "Only one player out of 30 might find that fatal flaw in the AI." ([Lidén](https://www.cs.drexel.edu/~santi/teaching/2012/CS680/papers/Intro-ArtificialStupidity.pdf))

## Not verified

These came up only in fan wikis, forums or press, with no primary source found:

- **StarCraft II's built-in levels.** Fan wikis say Cheater 1 = vision, Cheater 2 = extra resources and Cheater 3 = Insane. No Blizzard page was found, and Liquipedia contradicts itself. ([Liquipedia](https://liquipedia.net/starcraft2/Artificial_Intelligence))
- **Company of Heroes AI.** Players' claims conflict: fog-of-war cheats on Hard and Expert, and resource bonuses of +50/100/150% by level. No Relic talk or document was found.
- **Halo Wars (2009).** Legendary reportedly gives stat and economy boosts, and an "Automatic" difficulty adjusts to past results. The only sources are a Prima guide and Steam threads. No Ensemble postmortem was found.
- **Civ VI's per-level bonuses.** Only community sources were found.
- **Total War campaign AI "dancing"** (armies retreating to avoid battle). It's a well-known player complaint, but no CA patch note naming it was found. Warhammer 3's 8.1 update targets armies "clustering and idling", per press coverage only ([PCGamesN](https://www.pcgamesn.com/total-war-warhammer-3/patch-notes-8-1-campaign-ai)).
- **Harassment spam** as a frustration was raised in the brief, but no developer source discussing it in an RTS was found.
- **Gaps in the primary sources:**
  - The AoE II script is read from a GitHub copy, not the shipped file.
  - The Halo Wars 2 details are Thompson's write-up, not a Creative Assembly talk.
  - The Total War blog interview with Tim Gosling (totalwar.com) was blocked by a bot check and wasn't read.
  - Lidén's chapter is read from a course mirror of the book chapter.

## Implications for halobattles (our inference)

*This section is our reading of the sources against our specs; none of it is sourced fact.*

- **We already match the common architecture.**
  - The Commander scores goals, GOAP plans them, and Task Forces carry them out. That is the strategy layer, managers and squads of UAlbertaBot, Total War and Petra.
  - Goal weights in Faction data are the Utility and Civ IV "personality as weights" pattern, and they suit data-driven Mods.
- **Honest bots are a defensible choice, but they cost us strength.** Our Bots never cheat ([bot-spec](../specs/bot-spec.md)), like Halo Wars 2's and OpenRA's.
  - The literature suggests a fog-honest AI can be duped and look stupid (Kohan II). Our Memory with decaying sightings is a reasonable middle ground.
  - If the planned "Brutal" level cheats, it should be a separate, labelled AI with visible bonuses, like Supreme Commander's AIx, not a hidden boost.
- **Difficulty today is mostly the "better play" lever:** think interval, noise, plan depth, margin.
  - Cheap additions: an attack-count or rush cap and a population or Planet-count cap on Easy (Petra), and tables scaled down from Hard rather than up from Easy (Halo Wars 2).
  - `TestHardBeatsEasy` at about chance may mean the levers move too little.
- **Archetypes are cheap with what we have.** Rush, Turtle and Boom as goal-weight presets would follow OpenRA, Petra and SupCom.
  - Expose the archetype in the lobby name or tag. The study suggests players won't infer it from behaviour.
- **Telegraph attacks.** An optional Bot chat line when an Army is ordered at a player, or when it starts gathering at a staging Planet, would follow Petra and AoE II.
  - The Galaxy is turn-free and slow, so warning before an attack costs little and makes the Bot readable.
  - Chat lines can live in Faction data alongside the Bot names.
- **Pacing.**
  - Our staging-then-attack already makes waves.
  - A post-attack cooldown per target, beyond the "failed attacks" escalation, would give breathers (L4D Relax) and avoid back-to-back pressure.
  - A grace period before the first Attack on a human, scaled by difficulty, mirrors BAR Raptors.
- **Battle AI feel.**
  - **Persistence:** keep the Task Force target until it dies or is out of reach. ADR 0007's "shooter becomes the target" risks the "computery" switching the study found.
  - **Hysteresis on Retreat,** as in UAlbertaBot.
  - **Short reaction delays on lower difficulties.**
  - **A damage or hit budget,** so neutral garrisons and turrets don't spike new players.
- **Avoid hidden rubber-banding.** If we add catch-up help, make it a visible rule, as BAR does with Raptor anger and Mario Kart with item boxes, or keep it to the bot quietly taking second-best choices when far ahead (hustling), never to helping itself.

Not checked: the GDC Vault pages behind paywalls, Relic and Ensemble material that isn't online, and BAR's BARb bot itself (only its PvE Raptors config was read).
