# Holding researched tech in strategy games

Researched 2026-11-06. Status: **research only**; nothing is built from it. The question: how do strategy games, especially board games, handle researched technology? Is it permanent, can it be lost or stolen, what caps how much a player holds, and what does losing territory do to it? The aim is to inform "Direction B" for Halo Battles: Techs held by the player, with Labs giving only capacity.

## Verdict

- **Every board game surveyed keeps researched tech for the whole game.** In TI4, Eclipse, Civilization, Through the Ages, Clash of Cultures, Scythe and Terraforming Mars, nothing destroys a tech you've researched. Territory loss costs income, buildings, wonders and points, never the tech itself.
- **Stealing is almost always copying.** The thief gains a copy and the victim keeps theirs (TI4's Nekro Virus and *Plagiarize*, Civ's spoils of war, Stellaris's and Endless Space 2's espionage). The one true transfer found is Through the Ages, where a won war can take a *special* technology card out of the loser's play area.
- **Caps limit what you can get, not what you keep.** The usual shapes are:
  - a **pyramid** (Civ: each tech needs two below it);
  - **stages** you unlock with techs from the stage before (Endless Space 2, Sins of a Solar Empire II's research points);
  - **tracks with fixed space** (Eclipse: a full track takes no more techs);
  - **one of a kind** (Through the Ages special techs, TI4 unit upgrades, Clash of Cultures governments), where a new one replaces the old.
- **Buildings usually gate access, and losing them suspends access rather than deleting tech.**
  - Halo Wars (2009): losing a Reactor drops the tech level, and a lost Temple resets Covenant tech to zero.
  - StarCraft II: losing a tech building stops new production that needs it.
  - Sins II: falling below the research points keeps completed research but stops new research and the tier bonus.
  - Rebuilding restores access. Halo Wars says so in its manual, and Halo Wars 2 went further: per Prima's official guide, its tech level never decreases.
- **The two digital games closest to the current Halo Battles rule are the harshest, and even they restore access when you rebuild.** No game surveyed makes the player research a lost tech again.
- **Direction B fits the mainstream:** player-held Techs, with Labs as capacity. The part with no precedent is losing Techs when over the cap. The closest models are Halo Wars's "suspend until rebuilt" and Sins II's "keep completed research, lose the bonus".

## Board games

### Twilight Imperium 4th edition

Source: Fantasy Flight's *Living Rules Reference* v1.2 (06/12/19), §79 Technology ([archived copy of the FFG PDF](https://cs.uwaterloo.ca/~dtompkin/archive/dtlib/base/Twilight%20Imperium%20(Fourth%20Edition)%20~%20Living%20Rules%20v1-2.pdf)). Later versions (v2.0, Prophecy of Kings) were not checked.

- **Permanent.** "Each player places any technologies he has gained faceup near his faction sheet. He owns those cards for the duration of the game" (79.1). No rule removes a researched tech. On elimination, the player's technologies go back to the box with everything else (31.2).
- **Prerequisites by colour, not a tree.** Each non-upgrade tech has a colour (Biotic, Warfare, Propulsion, Cybernetic). Its prerequisites are a count of owned techs of each colour (79.7, 79.8, 79.12). Unit upgrades have no colour and satisfy nothing (79.7).
- **Territory helps but never holds tech.** A planet with a **technology specialty** can be exhausted to ignore one prerequisite of its colour (79.13–79.15). Losing the planet loses that discount, not any tech.
- **No cap on held techs.** The limit is the rate of gain. The *Technology* strategy card gives one tech, or two for 6 resources, and other players can follow for a command token and 4 resources (80.2, 80.3).
- **Stealing is copying, and it belongs to factions and cards:**
  - **Nekro Virus** uses its two *Valefar Assimilator* techs to "gain faction technologies that have been researched by other players, including unit upgrades" (79.16). That is a **two-slot cap on copied tech**, and replacing a copied upgrade removes the old one (79.21). If the victim is eliminated, the copied tech stays with the Nekro (79.18, 31.2).
  - The Nekro's base ability *Technological Singularity*: "after 1 of your opponent's units is destroyed, you may gain 1 technology that is owned by that player" ([TI4 reference site](https://scottmk.github.io/ti4-reference/factions/codex/ordiniannekro), **secondary**; I didn't see the printed sheet).
  - The *Plagiarize* action card (Codex I): "Spend 5 influence and choose a non-faction technology owned by 1 of your neighbors; gain that technology" ([RulesPal](https://rulespal.com/twilight-codex-volume-i-ordinian/rulebook), **secondary**).
  - In every case the victim keeps their copy.
- **Gaining is different from researching.** "If an ability instructs a player to gain a technology, he does not research it; … ignoring prerequisites" (79.5).

### Eclipse: Second Dawn for the Galaxy

Source: [Dized](https://rules.dized.com/eclipse-second-dawn-for-the-galaxy/rule/research/research-overview), the publisher-licensed rules app.

- **Permanent.** "You are not allowed to Research a Tech already present on your Species Board, nor are you allowed to discard a Researched Tech Tile from your Species Board."
- **Tracks with a fixed number of spaces.** Each tech goes on "the leftmost available space of the Tech Track of its category". "If a Tech Track is full, no more Techs of that type may be Researched, nor may Rare Techs be placed there." This is the clearest board-game **capacity** model, but it caps what you can *add*, so it never forces a discard.
- **The track rewards depth.** "Each Tech you have in a category gives you a discount on further Techs Researched in the same category." There is a minimum Science cost.
- **Territory:** nothing on the research pages ties techs to sectors. Losing sectors costs influence and income, not techs.
- **Not confirmed:** the number of spaces per track, and the track VP values. The Dized pages I read don't state them.

### Sid Meier's Civilization: The Board Game (FFG, 2010)

Source: the rulebook as transcribed at [RulesPal](https://rulespal.com/sid-meiers-civilization/rulebook). The page doesn't name FFG as its source, so treat it as **near-primary**. I couldn't reach FFG's PDF.

- **The tech pyramid.** "Each level II tech a player researches must be placed above two level I techs", and level III above two level II, and so on. Space Flight, the only level V tech, wins the game, and reaching it takes "a minimum of five level 1 techs, four level 2 techs, three level 3 techs, and two level 4 techs".
  - Your **breadth at low levels caps your height**. You can't rush a top tech without paying for a wide base first.
  - The starting tech always sits in the bottom row, whatever its level.
- **Permanent.** I found no rule that loses a tech. The closest thing is *obsoleting* a **wonder**: Monarchy and Gunpowder can turn off a wonder's ability, but no tech is lost.
- **Stealing is copying, on conquest.** When a non-capital city is destroyed, the winner may "learn one of the loser's known techs that the winner does not know, without having to pay the trade cost", but only if they have a legal space for it in their pyramid. The loser keeps theirs. Destroying a capital ends the game with a military victory.

### Through the Ages: A New Story of Civilization

Source: Czech Games Edition's [rulebook PDF](https://d.cge.as/tta_manual/through-the-ages-new-story-rules-en.pdf). Its text layer is damaged, but the passages below are legible.

- **Tech and buildings are separate, and that's the key analogy.** A farm, mine, urban building or military unit is a **worker placed on a technology card**. Destroying a building means "move the worker from the card to your worker pool". The **technology card stays in play**.
- **Caps are on buildings and on cards in hand, not on techs in play:**
  - "Your government has an urban building limit that specifies the maximum number of urban buildings you can have of any particular type."
  - You "cannot take any non-wonder card if the number of civil cards in your hand is equal to or greater than your civil action total."
- **Old tech isn't lost.** When an age ends, antiquated cards are discarded *from hand*, but "Other cards in play (technologies, colonies, completed wonders, …) remain in play even if they are antiquated". Each player does lose 2 yellow tokens.
- **Upgrades replace.** A special technology (law, warfare, exploration, construction) of the same type as one you have replaces it: "only the higher level card stays in play". The same holds for governments.
- **The one true theft found.** In a war, if "the victor steals a special technology, the victor takes the card from the defeated civilization's play area and puts it into his or her own play area". The victor can't steal one they already have. If it's the same type as theirs, they keep the higher level and discard the other. Both the transfer and the replacement rule are good models for a capture.

### Clash of Cultures: Monumental Edition

Source: WizKids's [rulebook PDF](https://wizkids.com/posters/repository/wizkids/Clash-of-Cultures---Rulebook---WEB---2021-02-05-compressed.pdf), Feb 2021.

- **Advances are cubes on your player board.** One costs 2 Food. You need a category's top Advance before the others, and some Advances unlock Buildings.
- **No loss rule in the core rules.** Capturing a city replaces its pieces with the capturer's and gives Gold. A captured city's Wonder goes to the capturer. Advances are untouched.
- **Government advances can be reassigned.** You "can only have Advances from one Government category". In the Status Phase you may pay to "move all of your Advances from one Government category to another", keeping the count.
  - This is a **re-slotting** mechanic, not a loss: the investment carries over.
  - Under the Civilizations rules, losing the government advance can also cost the special advance that depends on it (a [search excerpt](https://rulespal.com/clash-of-cultures-civilizations/rulebook), **secondary**, not checked in the PDF).
- **Not checked:** the text of individual Event and Action cards.

### Scythe

Source: [Dized](https://rules.dized.com/game/qjEyV--bTu-DXKGZWToM1A/GyLBMF3lSfGcrM64RRbVIg/upgrade), Stonemaier's licensed rules app.

- **An upgrade moves a cube.** "Pay the cost, pick up a technology cube from any green box on your Player Mat … place it on any empty red box with bracketed borders". It costs Oil.
- **The cap is physical.** Only the bracketed boxes can take a cube.
- **Not confirmed from a primary source:** that no rule ever reverses an upgrade. The upgrade pages say nothing either way, and I found no reversing rule. Territory loss in Scythe costs points and resources, not mat cubes.

### Terraforming Mars

Source: [Dized](https://rules.dized.com/terraforming-mars/rule/actions/play-a-card-place-the-card).

- **Played project cards stay.** Automated (green) cards "have no ongoing effect, but since they represent the current extent of your operations, their tags still apply". Active (blue) cards stay face up for their effects.
- **Events are the exception.** Events (red) "are collected in a personal pile face down after being played. Their tags only apply while being played."
- **There is no territory loss.** Tiles stay where they are placed.
- **Not checked:** the official FryxGames/Stronghold rulebook. Dized is licensed but secondary to it.

### Dune: Imperium

Skipped. Its tech tiles come only in the *Rise of Ix* expansion, and that game has no territory that holds them.

## Digital games

### Halo Wars (2009)

Source: the official Xbox 360 *Planetary Operations Manual* ([copy hosted by a third party](https://nuangel.net/pcdownloads/xboxmanuals/HaloWars_MNL_EN-US.pdf)).

- **Tech level is a count of buildings.**
  - UNSC: "Upgrades and some units may require up to four Reactor technology units." An Advanced Reactor "counts as two tech levels".
  - Covenant: "Availability of some upgrades and units may require up to three Temple technology levels."
- **Losing the building drops the level:**
  - UNSC: "when any of your Reactors are destroyed, your corresponding tech level also drops."
  - Covenant: "If the Temple is destroyed, the technology level resets to zero, although it will be restored to its previous level if another Temple is built."
- **What's lost is access, and it comes back.** You don't research again: you rebuild. "Most upgrades require resources and a minimum technology level."
- **Not confirmed:** whether upgrades **already researched** keep working after the tech level drops. The manual and Halopedia ([Tech](https://www.halopedia.org/Tech), [UNSC Reactor](https://www.halopedia.org/UNSC_Reactor), **secondary**) don't say.
- Each extra Reactor costs 250 more resources than the last ([Halopedia](https://www.halopedia.org/UNSC_Reactor), **secondary**). That rising price is what limits the count, not a hard cap.

### Halo Wars 2

- Halo Wars 2 replaced Tech with **Power**, a spendable resource ([Halopedia, Tech](https://www.halopedia.org/Tech), **secondary**).
- **Tech level comes from upgrading the base.** Per Prima's official guide, upgrading a base "increases your Tech Level", and your tech level **never decreases**, even if you lose your most advanced base ([Prima eGuide, Bases](https://primagames.com/eguides/halo-wars-2-eguide/structures/bases/about-bases)).
  - I saw this only in search excerpts. The page returned 403.
  - That makes it **unconfirmed**, but it matters: the series moved *away* from tech you can lose.

### StarCraft II

- **Tech buildings gate production.** Upgrades are researched at a building, and "the second and third levels of most categories require an additional tech building" ([Liquipedia, Upgrades](https://liquipedia.net/starcraft2/Upgrades), **secondary**).
- **Losing the building suspends what needs it.** When a Tech Lab is destroyed, "units that have started production in that building will finish regardless of now-missing tech requirements. Queued units which require the Tech Lab will be canceled" ([Liquipedia, Tech Lab](https://liquipedia.net/starcraft2/Tech_Lab), **secondary**).
- **Not confirmed from a primary source:** that finished upgrades (weapons, armor) persist after their building dies. It's widely held, but I found no Blizzard text for it.

### Sins of a Solar Empire (2008) and Sins II

- **Labs gate each tier.**
  - Sins (2008): each column of a research tree needs a number of Military or Civilian Labs, for example "Heavy Fallout requires 5 Military Labs instead of 4 in *Entrenchment*" ([Sins wiki, Military Tree](https://sinsofasolarempire.fandom.com/wiki/Military_Tree), **secondary**).
  - Sins II: labs give research points per tree, and tiers 1 to 5 need 1, 3, 6, 10 and 15 points ([StrategyWiki](https://strategywiki.org/wiki/Sins_of_a_Solar_Empire_II/Research), **secondary**).
- **Lab loss in Sins II:** "If your labs are destroyed or removed, you may lack the research points required for the tier. Completed research will remain unaffected, but existing research will be halted, and the tier bonus will no longer be active." (same, **secondary**)
- **Lab loss in Sins (2008):** forum reports on the official Stardock forums say that falling below a tech's lab count makes it unusable, for example superweapons won't fire. One player said an ability didn't come back after rebuilding.
  - Threads: [researched tech becoming non usable](https://forums.sinsofasolarempire2.com/177441/researched-tech-becoming-non-usable), [destroying labs question](https://forums.sinsofasolarempire2.com/303097/destroying-labs-question), [global unity breaks if you lose a harmony lab](https://forums.stardock.com/425457/global-unity-breaks-if-you-lose-a-harmony-lab).
  - These are **secondary**. I saw them only in search excerpts (the pages returned 403), and they disagree across versions.
- **Not confirmed:** the official Sins manual. I found only third-party uploads.

### Stellaris

Source: the [Stellaris wiki](https://stellaris.paradoxwikis.com/Technology), Paradox's official, community-edited wiki, verified for version 4.5.

- **Research is a hand of cards** drawn semi-randomly from weighted options, with a new hand after each tech.
- **Cost grows with empire size:** +0.2% for each point of empire size above 100.
- **Debris:** destroying enemy ships can leave debris, and each component debris gives "10% progress on the technology".
- **Espionage:** *Steal Technology* gives "+30% Research progress in a random technology" the target has ([Espionage](https://stellaris.paradoxwikis.com/Espionage)). If the target has nothing you lack, it gives +1000 research in each category instead.
- **Stealing is partial progress, never a whole tech, and the victim loses nothing.**
- **Not confirmed:** that researched tech can never be lost. The wiki doesn't say, and I know of no such mechanic.

### Endless Space 2

- **Stages per domain.** "To advance to the next stage … you need to possess half the technologies of the previous stages, either through trade or research" ([Amplitude dev blog, 24 Jan 2017](https://community.amplitude-studios.com/amplitude-studios/endless-space-2/blogs/496-horatio-update-focus-on-the-tech-tree)). That was in Early Access, and later patches may have changed the thresholds.
- **Tech can be traded** through diplomacy (same source).
- **Hacking** (Penumbra DLC) can "steal sensor data or technology" ([Amplitude dev blog, 22 Jan 2019](https://community.amplitude-studios.com/amplitude-studios/endless-space-2/blogs/655-penumbra-invisible-hacking-space-wraiths)).
- **Not confirmed:** how much one hack yields, and whether the victim loses anything.

## Comparison

| Game | Permanent? | Lost how | Stolen how | Cap / gate | Territory loss |
|---|---|---|---|---|---|
| TI4 | Yes | Never (elimination only) | Copy: Nekro, *Plagiarize* | Colour prerequisites; Nekro holds 2 copies | Lose prerequisite-skip planets only |
| Eclipse | Yes, can't discard | Never | No | Track spaces per category | No effect on techs |
| Civilization (FFG) | Yes | Never | Copy on destroying a city | Pyramid | Capital lost = game over |
| Through the Ages | Yes in play | Never (hand cards age out) | **Transfer** of a special tech in war | Building limits, hand limit, one per special type | Buildings lost; tech stays |
| Clash of Cultures | Yes | Never (government re-slotted) | No | Category order; one government | Pieces and wonders change hands |
| Scythe / TfM | Yes | Never | No | Mat boxes / none | None on tech |
| Halo Wars | Level is building-held | Reactor or Temple destroyed | No | Tech level 4 (UNSC) / 3 (Covenant) | Level drops; rebuilding restores |
| Halo Wars 2 | Level never drops (unconfirmed) | — | No | Base upgrades | None on level |
| StarCraft II | Upgrades held (unconfirmed) | Access lost with the building | No | Building prerequisites | Production suspended |
| Sins II | Completed research kept | Tier bonus and new research | No | Lab points per tier | Bonus off; research halts |
| Stellaris / ES2 | Yes | Never | Partial progress / hack | Empire-size cost; stages | No effect |

## What this suggests for Direction B

All of the following are **suggestions**, not decisions.

### The capacity model

- **Player-held Techs with Labs as capacity is the mainstream design.** Every board game here keeps tech with the player. The digital games that tie tech to buildings tie *access* to them, not ownership, and rebuilding restores it.
- **The cap should feel like Eclipse's track: it limits what you add, not what you keep.** A full cap blocks new Projects until you build a Lab. That's simple and needs no new UI beyond "Tech Slots: used / total".
- **Watch the inversion.** Today a deep tech position is a fragile one. Under B, the cap is total Tech Slots across all Labs, so losing one Lab on a three-Lab research Planet costs 3 capacity, not 9 Techs. That's much gentler, which is what playtesters asked for.

### When a player goes over the cap

No surveyed game forces a tech discard when capacity drops. Three precedents can be adapted:

1. **Suspend, don't delete (Halo Wars, Sins II).** Over the cap, the newest Techs (or the player's choice) go **dormant**: held, but with no effects and no unlocks, until capacity returns. They come back as soon as a Lab is rebuilt.
   - This is the closest Halo precedent, and the manual says it plainly: the Temple's level "will be restored to its previous level if another Temple is built".
   - It removes the guaranteed-card and recovery-cost rules for this case.
2. **Choose what to lose (Through the Ages-style replacement).** The player picks which Tech to drop, with a short timer, and the newest goes by default. If losing remains, the recovery card at 50% still makes sense.
3. **Lose a bonus, not a Tech (Sins II tier bonus).** Being over the cap switches off a global effect, such as a Research penalty, rather than any specific Tech.

Option 1 is the least harsh and needs the least explanation. Option 2 keeps the stakes of the current design. Whichever is chosen, the over-cap state should show in the UI as disabled, named slots, in line with the "a control with nothing to act on stays in place, disabled" rule.

### Tiers or a pyramid

- **Civ's pyramid** (each tier needs two below it) would make breadth a precondition for top Techs. It fits the existing Rarity tiers (Common to Legendary): for example, a Rare Tech needs two held Uncommon Techs.
- **Endless Space 2's "half the previous stage"** and **TI4's colour counts** do the same job more loosely. TI4's version maps directly onto the three fields: "needs 2 Military Techs".
- **Sins-style lab gating** ("tier N needs N Labs") would give Labs a second role beyond capacity. It also brings back the harshness question, so treat it as a later option.
- A pyramid only gates research. On its own it never makes a held Tech fall when one below it is lost, and no game surveyed does that.

### Stealing or capturing Techs

Today's spec lists "taking Techs from an enemy (capturing or raiding a Lab)" under *Later*. The precedents:

- **Copy, don't transfer (TI4, Civ, Stellaris).** Capturing a Planet with a Lab, or winning a Raid on one, lets the attacker copy one Tech the defender holds and they don't. That could be a whole Tech (Civ), a guaranteed card at a discount, or partial progress (Stellaris's +30%). The defender keeps theirs, so capture isn't a double swing.
- **Transfer only a narrow class (Through the Ages).** If true theft is wanted, limit it to one category and resolve duplicates by "keep the better one".
- **Make it fit capacity.** Civ allows the steal only if the pyramid has room. The same rule fits B: a stolen Tech needs a free Tech Slot.
- **TI4's Nekro is a capped thief.** Two Assimilator slots and swap-to-replace would suit a Covenant-flavoured faction trait.

### What removing Couriers costs

- **What Couriers do today:** they save a Tech from a Planet you expect to lose, and they make a visible, interceptable target.
- **Under B, the first job disappears.** Techs aren't in any Lab, so there's nothing to evacuate. A Lab's loss costs capacity, and capacity can't be carried.
- **What is lost:**
  - an interception mini-game (other players see the Tech a Courier carries and can destroy it);
  - a way to spend money on safety;
  - some code and a planned UI mockup. Those are savings, not costs.
- **None of the surveyed games has anything like Couriers.** I found no precedent for moving tech between buildings.
- If the interception play is valued, it would be better rebuilt as **capturing or copying Techs** (above), which gives an attacker a reason to hit Labs.
- **Docs to update if B goes ahead:** `tech-spec.md` (Moving Techs, Losing Techs, Guaranteed cards, the Planet window UI) and the summary line in `game-design-spec.md` that mentions Couriers. Couriers also appear there in the own-territory travel rule and the Truce rules.

## Not verified

- **TI4:** I read LRR v1.2 (2019), not v2.0 (Prophecy of Kings). The texts of *Technological Singularity* and *Plagiarize* come from fan reference sites, not printed cards.
- **Eclipse:** the number of spaces per tech track and its VP values.
- **Civilization:** the FFG PDF itself. I used RulesPal's transcription.
- **Through the Ages:** the name of the war card that steals a special technology. The PDF's text layer is damaged, though the quoted passages are legible.
- **Clash of Cultures:** individual Event and Action card texts, and the Civilizations-expansion rule on losing a special advance.
- **Scythe:** no primary text says upgrades can't be reversed.
- **Terraforming Mars:** the official rulebook (I used Dized).
- **Halo Wars:** whether upgrades already researched keep working after the tech level drops.
- **Halo Wars 2:** "tech level never decreases" comes from a search excerpt of Prima's official guide. The page returned 403.
- **StarCraft II:** no Blizzard source that completed upgrades survive the loss of their building. Liquipedia is the only source.
- **Sins (2008 and II):** every claim is from StrategyWiki, the fan wiki, or forum excerpts. The official manual and the developer article ([Research Parallelism](https://www.sinsofasolarempire2.com/article/515529/research-parallelism)) returned 403.
- **Stellaris:** that tech can never be lost. Not stated either way.
- **Endless Space 2:** the current stage thresholds, and what a tech-stealing hack yields.
- I didn't test any claim in play. The notes on halobattles come from reading `tech-spec.md` and `game-design-spec.md` only.
