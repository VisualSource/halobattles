# Battle structure in Empire at War and Halo Wars 2

Researched 2026-11-09. Status: **research only**; nothing is built from it. The question: how do *Star Wars: Empire at War* (2006, with *Forces of Corruption*) and *Halo Wars 2* (2017: Deathmatch, Domination, Strongholds, Blitz and some campaign missions) structure their battles? For each: how a battle is won and how it ends, timers included; what the defender gets and what the attacker brings; reinforcement points and landing; unit caps and reserves; capture points; base defences and shields; battle length; retreat; and what makes the rest of the map matter. The aim is to inform Halo Battles' tactical Battles, where the attacker's win rate depends heavily on Faction (see [What this means for Halo Battles](#what-this-means-for-halo-battles)).

## Verdict

- **Neither game ends a battle with "time's up, the defender wins" in its normal modes.**
  - EaW's Galactic Conquest battles have no time limit (fan reverse-engineering). They end when one side is destroyed or retreats.
  - HW2's timed modes (Blitz 12 min, Strongholds 15 min) score the timer: whoever holds more points or more Strongholds wins. Neither side wins by default.
  - The one close match is a HW2 campaign defence mission ("Hold the Line"): survive a 30-minute countdown.
- **EaW's land battle is built around attacker reinforcement points, which Halo Battles only half copies.**
  - The attacker's population cap comes from the points it holds. It can't land its whole army at once, and it lands only within a held point's radius.
  - The defender's cap is fixed at 10 and isn't tied to points.
  - Only infantry can capture a point, and only after nearby enemies are cleared.
- **EaW says outright that the defender starts ahead, and gives the attacker ways back** (manual p. 14). The defender gets:
  - garrison units that respawn from its buildings and don't count toward its cap;
  - upgrades bought during the battle;
  - turrets, and in space a station that launches fighters.

  The attacker evens the odds with secondary structures on the map, friendly natives and bombing runs from orbit.
- **Capture points do different jobs in each game.**
  - EaW: points raise your cap and let you land troops. Build pads let either side buy turrets, healing or sensors.
  - HW2 Domination: held points drain the enemy's tickets.
  - HW2 Strongholds: each held point adds 5 population.
  - Blitz: holding more zones than the enemy scores points.

  In EaW's *Land Control* and in Strongholds, holding every point for a set time (30 s and 1 min) wins outright.
- **Each game has more than one way to win.**
  - EaW: destroy the enemy, or make it retreat.
  - Domination: run out the enemy's tickets, or destroy its base.
  - Strongholds: hold all points for a minute, hold the most at the timer, or kill everyone.
- **Shields block strikes, not entry.**
  - An EaW base shield "prevent[s] orbital bombardments and energy attacks directly on the base", but "does not prevent enemies from entering", and it needs a power generator (p. 39).
  - The Banished Shield Generator in HW2 is a structure you build.
  - Neither shield is switched on or off by who holds capture points.
- **Defences differ by faction on purpose in HW2.** UNSC turrets convert to one counter role. Banished turrets stack upgrades, and the Banished also get Shield and Cloaking Generators.
- **Retreat is cheap in EaW and missing in HW2.**
  - EaW: retreat is locked for the first 30 s. The countdown is about 11 s, and units are "more vulnerable" during it. Its stock attrition is 0 (game data, via fan sources).
  - HW2's base-building modes have no retreat rule that I found. Blitz refunds half a unit's Energy when it dies.

## Star Wars: Empire at War (2006) and Forces of Corruption

Sources:

- **The official manuals** for EaW and *Forces of Corruption*, in one upload on Scribd ([EaW + FoC manual](https://www.scribd.com/doc/55650373/Star-Wars-Empire-at-War-Manual-En)). Page numbers are the printed ones. FoC pages are marked "FoC". I read the page text the upload serves, so wording may differ slightly from the printed copy.
- **Game data via fan sources, not first-party:**
  - [EaW Revised](https://github.com/EaW-Revised/EaW-Revised), a fan reimplementation that documents FoC rules from a debug build and the game's XML. Its own docs say "No retail capture was made".
  - The `GameConstants.xml` shipped in the [Unofficial FoC Patch](https://github.com/AlyMar1994/UFoCP/blob/master/Data/XML/GameConstants.xml) (UFoCP), a modified copy of the stock file.

  Values from these two are labelled **(fan data)**.

### How a battle is won and ends

- A planet changes hands only after the attacker wins **both** layers. "The attacker must conquer both the space and the land map of a planet", which "earns instant credits" (p. 5).
- **Space:** "the attacking fleet must destroy the defender's entire enemy fleet and space station (if a station is present)" (p. 5).
- **Land:** "the attacking army must destroy the enemy's base structures and units" (p. 5). "Only primary objectives must be completed for victory" (p. 19).
- **No time limit in campaign battles (fan data).** EaW Revised lists the conditions installed for a Galactic Conquest battle: all enemy units destroyed, all enemies able to retreat have retreated, and the enemy leader killed when the galaxy uses that rule. "No time-limit or lobby victory choice is installed" ([gc-tactical.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/gc-tactical.md), WGT-29).
- **Skirmish has selectable win conditions** (p. 45):
  - *Land Skirmish*: "wipe out the enemy and their base";
  - *Land Control*: "capture all of the reinforcement points in order to win". The stock hold time is 30 s (`Control_Point_Domination_Victory_Time_In_Secs`, **fan data**: UFoCP).
- **The only countdown that ends a battle** is the Death Star's. Once it is in range it can destroy the planet's surface, and the land map is gone for good (p. 23).

### Attacker and defender

- **The defender starts ahead, by design.** "In tactical battles, the defender initially has the advantage. The defender can upgrade his troops during battle at friendly structures, and use defensive emplacements to hold off the enemy. If the defender has built military structures on the planet's surface, he will be rewarded with garrison troops … The burden is on the attacker to bring the right units" (p. 14).
- **The attacker's counterweights** are on the same page: "secondary structures on the map that may provide upgrades, lift the fog of war, or provide friendly indigenous troops", and "a bombing run to strike key targets" if it has bombers in orbit (p. 14).
- **No new units in battle, for either side.** Both "must be prepared to make the most of what they constructed on the Galactic Map" (p. 14). Skirmish is the exception (p. 25).
- **What the defender gets:**
  - **Garrisons.** Structures "automatically produce garrison units. These are bonus units that are not affected by the population cap. When a garrison unit is destroyed, the structure produces a replacement" (p. 25). The land chart lists a garrison for each production building: Barracks, then Stormtrooper or Trooper squads; Light Factory, then AT-ST or T2-B; and so on (p. 47).
  - **Upgrades bought in battle, which persist.** "Upgrades are persistent, so if you purchase an upgrade in one battle, and are attacked again, your units will retain the bonus" (p. 21). The attacker can buy upgrades only if it finds a Mercenary Outfitter on the map (p. 21).
  - **Base structures.** A power generator "built automatically at your base" runs "base shields, turbolaser towers and mining facilities". The turbolaser tower is "highly effective against vehicles" (p. 39).
  - **A space station** with "defensive weapons", upgrades bought during battle, and "garrison fighters" (p. 15). Station levels 1–5 launch more garrisons: at level 1, an X-wing and a Y-wing squadron; at level 5, two corvettes and two Nebulon-B frigates as well (Rebel chart, p. 47). In campaign the station's garrison reserve is unlimited (`-1`, **fan data**: [gc-tactical.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/gc-tactical.md), WGT-10).
  - **Planetary guns that fire into space.** The Rebel Ion Cannon disables a capital ship. The Imperial Hypervelocity Gun "can penetrate most shields". Each "is on the planet's surface and can only be destroyed during a land tactical battle" (pp. 19, 33, 37).
- **FoC adds a defence layout.** The *Advanced Base Layout* screen lets the owner drag troops and structures "into various tactical positions on the battlefield". A spy can view an enemy's layout: the Consortium on corrupted planets, the Empire with a probe droid, the Rebels with R2-D2 and C-3PO (FoC pp. 6–7).
- **FoC can switch garrisons off.** Consortium *Bribery* on a planet means "Enemy bases no longer produce garrisons during combat" (FoC p. 5).

### Reinforcement points and landing

- **What they are.** "Reinforcement Points are tactical positions that increase the owner's population cap and allow reinforcements to land" (p. 23).
- **Capture.** "You must eliminate all nearby enemy units and then have at least one infantry unit near the Reinforcement Point hologram until it turns green. Only infantry units can capture Reinforcement Points" (p. 23). Fan data: capture takes 10 s within radius 100, and the landing radius is 250. The capacity a point adds varies by map, with variants worth 1, 2, 3, 4, 5 and 10 ([land-combat.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/land-combat.md), LC-49). Captures are locked for the first 30 s of a battle (`Land_Capture_Allowed_Countdown_Seconds`, **fan data**: UFoCP).
- **Landing.** "Units can be deployed within the radius of a friendly reinforcement point" (p. 19). Units are dragged in from a reinforcement queue. "It's a good idea to keep some units safe in the Reinforcement queue until they are needed" (p. 19).
- **Space works differently.** "Reinforcements can enter the battle in open space", but only "into areas where your units have already cleared the fog of war", and never "in Asteroid Fields, Nebulae, Ion Storms, or near enemy bases" (pp. 17, 23).
- **FoC's Pathfinder slot.** The unit in the slot "will be the first unit to enter tactical battle. All remaining forces will need to be brought into battle via reinforcement" (FoC p. 9).
- **FoC Mercenary Outfitter "Secure Area":** "Reinforcement point takes 20% less time to capture" (FoC p. 11).

### Unit caps and reserves

- **Space:** "Population cap is 20" (p. 17). Big ships cost more population (p. 17). FoC data has Rebel 25, Empire 20 and Consortium 25 (**fan data**: [reinforcements.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/reinforcements.md), WR-01).
- **Land:** "the attacker's population cap is tied to the reinforcement points they control. Each reinforcement point provides a population bonus. You must capture and hold these points in order to increase the number of units you can bring to the battle. The defender's population cap is always 10. It is not tied to reinforcement points" (p. 17).
- Fan data adds a ceiling for both sides. In a campaign land battle the cap starts at `Max_Ground_Forces_On_Planet` (10). The attacker is "additionally limited" by the capacity its points give, and the defender is not ([land-combat.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/land-combat.md), LC-47).
- **Off the cap:** garrisons (p. 25), build-pad emplacements (p. 21) and indigenous forces (p. 41).
- **A planet holds at most ten land units** between battles (p. 13). Extra units wait in a space fleet aboard "lightly armored transport ships that are vulnerable to attack" (p. 15).

### Build pads and special structures

- **Build pads** are "construction sites that either faction can capture". Each buys one of six emplacements: an anti-vehicle, anti-infantry or anti-aircraft turret, a Bacta healing station, a repair station, or a sensor node. They "do not count toward your population cap" (p. 21). Selling one returns Credits (p. 21). Fan data: pad capture takes 5 s, and a pad can't be built on again for 15 s ([land-combat.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/land-combat.md), LC-56).
- **Special structures** "either faction can claim": "finding a sensor array will completely dispel the fog of war … Capturing a turbolaser tower will allow you to obliterate enemy vehicles from a great distance" (p. 25).
- **Indigenous forces** may be friendly to you, to the enemy, or hostile to all. "Indigenous forces do not count toward the population cap. They make excellent scouts and advance units" (pp. 25, 41).
- **Good Ground:** infantry who Take Cover there get "a bonus to their offensive and defensive abilities" (p. 25).
- **FoC adds:**
  - bunkers for up to five infantry;
  - Mobile Defense Units, which act as build pads you can drive;
  - terrain effects, among them a height bonus to sight and range (FoC p. 11);
  - Outpost pads in skirmish (FoC p. 9).

### Shields, bombardment and station levels

- **The base Shield Generator** "prevent[s] orbital bombardments and energy attacks directly on the base it protects. It does not prevent enemies from entering. Shield Generators require a power generator to operate" (p. 39).
- Fan data confirms the mechanics. A bombing run or FoC orbital bombardment can't target a point inside an active base shield ([land-combat.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/land-combat.md), LC-62, LC-65).
- **Bombing runs** need Y-wings or TIE bombers in orbit (p. 19). The stock interval is 120 s (**fan data**: UFoCP `Min_Bombing_Run_Interval_Seconds`).
- **FoC orbital bombardment** needs "capital ships in orbit above the planet" (FoC p. 9). Its interval is 260 s (**fan data**: UFoCP).
- **I couldn't confirm** that the base shield blocks ground artillery shells. Players say it does, but no first-party source I found says so.
- **Station levels** add weapons, garrisons and Unit Capacity: "upgraded space stations offer much greater defense for your planet" (p. 27). FoC links each station's Communications Array hardpoint to the planet's Ion Cannon or Hypervelocity Gun: "If the hard point is destroyed, you lose the ability to use these weapons" (FoC p. 11).

### Retreat

- **The rules** (p. 19): "Whenever retreat has been initiated, a timer will begin counting down, at which time your units are more vulnerable to attack. The retreat is executed once the timer ends. The surviving units will regroup at a nearby friendly planet." Retreat isn't possible "right at the beginning of a battle, and when gravity well generators are in effect".
- **Fan data:**
  - the opening lockout is 30 s (`Land_Retreat_Allowed_Countdown_Seconds`, UFoCP);
  - the countdown is 10.99 s for Rebels and Empire and 4.99 s for the Consortium ([gc-tactical.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/gc-tactical.md), WGT-35);
  - stock retreat attrition is 0 for land and space (UFoCP `Land_Retreat_Attrition_Factor`);
  - in space, ships whose engines are all destroyed or disabled are left behind ([reinforcements.md](https://github.com/EaW-Revised/EaW-Revised/blob/main/docs/behaviour/walks/reinforcements.md), WR-45).
- **Blocks:** the Interdictor's Gravity Well Generator "prevents enemies from retreating", and so does the station structure of the same name (pp. 35, 37). Fleets under Tarkin "will not be able to retreat from a space battle" (p. 37).
- **Auto-resolve is worse.** "Using Auto-resolve often results in the loss of many more units than if you had fought the battle yourself" (p. 15).

### Battle length

- The manual gives no length for campaign battles, and I found no first-party figure. Skirmish battles "are shorter conflicts" (p. 5). There's no time limit (see above).

### From the game files

Read from XML and Lua files copied out of the game and two mods. Cited as `source: file, tag`, where the source is one of:
- `base`: EaW;
- `foc`: Forces of Corruption;
- `tr`: the Thrawn's Revenge mod;
- `aotr`: the Awakening of the Rebellion mod.

These are data files, not design notes. The mods are fan work.

- **The fan figures above check out.** In `foc: GAMECONSTANTS.XML`:
  - captures and retreat are both locked for 30 s (`Land_Capture_Allowed_Countdown_Seconds`, `Land_Retreat_Allowed_Countdown_Seconds`);
  - retreat attrition is 0 (`Land_Retreat_Attrition_Factor`);
  - auto-resolve costs the loser 80% and the winner 75% (`AutoResolveLoserAttrition`, `AutoResolveWinnerAttrition`);
  - a fleeing retreat in auto-resolve costs 65% and 50%;
  - orbital bombardment comes every 260 s.
- **No time limit anywhere.** None of the four sets has a battle timer.
  - A battle ends in one of three ways: one side is wiped out, the attacker overruns (below), or the domination win in multiplayer, which needs every control point held for 30 s (`Control_Point_Domination_Victory_Time_In_Secs`; aotr 60 s).
- **Overrun.** At 3:1 odds, after at least 30 s, the battle is called for the stronger side (`Tactical_Overrun_Multiple`, `Minimum_Tactical_Overrun_Time_In_Secs`).
  - Both mods raise the minimum to 100 s, so a battle is always fought for a while.
  - tr turns overrun off (multiple 999).
- **Land unit cap.** The cap is 10 in skirmish, falling to 5 with 8 players (`aotr: FACTIONS.XML, Land_Skirmish_Unit_Cap_By_Player_Count`).
  - In the campaign each reinforcement point adds capacity through `Additional_Population_Capacity`.
  - A plain point adds 5, takes 10 s to capture, and stays yours once you leave it (`tr: Markers.xml, Reinforcement_Point`, `Ownership_Sticks`).
- **Base EaW let the defender reinforce; FoC took it away.** `Allow_Reinforcement_Percentage_Normalized` is 0.25 in base and 0.0 in foc.
- **Thrawn's Revenge's Victory Point is close to our Command Post** (`tr: Markers.xml, Victory_Point`; `Scripts/Library/eawx-plugins-gameobject-land/victory-point-handler/VictoryPointHandler.lua`). It's a capture point that:
  - starts as the defender's (`Always_Side_With_Defender`);
  - takes 45 s to capture, against 10 s for a plain point;
  - can't be damaged;
  - adds 10 capacity to whoever holds it;
  - is marked as a rush target for the AI.
- **The attacker who captures the Victory Point wins the battle outright** (`StoryUtil.DeclareVictory`).
  - The capture doesn't count while the defender still has a planetary shield or capital building (`tr: AI/PerceptualEquations/BasicLandEquations.xml, Disable_VictoryPoint`).
  - So the attacker knocks out a building first, then holds ground for 45 s, rather than grinding down hit points.
- **Defence buildings switch off attacker tools.** In tr, while the defender has an ion cannon, hypervelocity gun or planetary shield, bombardment is off (`Disable_Bombardment`, same file).
- **Difficulty never touches combat.** AI difficulty changes only Credits and build time. Damage, Health and Shield multipliers are 1.0 at every level in both mods (`DifficultyAdjustments.xml`).
  - For example, tr Hard gets ×1.35 Credits and ×0.8 build time.
  - aotr goes up to ×3.25 Credits.
- **A catch-up rule.** In multiplayer tactical play, the team with the lower income gets 8% of the income gap as a bonus every tick (`foc: Multiplayer_Losing_Team_Bonus_Credit_Percentage`).

## Halo Wars 2 (2017)

Sources:

- **Prima's official guide** (*Halo Wars 2* eGuide). Some sections are open, and the rest need a free account. Only the open parts loaded, so some pages are cut short.
- **Xbox Wire**, Microsoft's own news site.
- **Halopedia**, a fan wiki, labelled **(secondary)**. I didn't find a Halo Waypoint page that sets mode timers or ticket values.

### Modes and how each ends

From Prima's [Game Modes](https://primagames.com/eguides/halo-wars-2-eguide/multiplayer-basics/game-modes) page:

- **Deathmatch:** "Wipe your enemies off the map to claim victory." Depending on match options, "minibases can count as HQs in a game of Deathmatch" ([Minibases](https://primagames.com/eguides/halo-wars-2-eguide/structures/minibases/about-minibases)). I found no time limit.
- **Domination:** "Control Points that, when taken over, start accruing Points for your team. Once the Point limit is reached, victory is yours. Alternatively, you can still win by destroying the enemy base."
  - Halopedia (**secondary**) describes it as tickets: holding points drains the enemy's, and a team at zero loses ([Domination](https://www.halopedia.org/Domination)).
  - Map counts vary. On Ashes, 1v1 "there are only three objectives", and 3v3 has Points A to E ([Ashes](https://primagames.com/eguides/halo-wars-2-eguide/multiplayer-basics/multiplayer-atlas/ashes)).
  - **Not confirmed:** the point limit, the rates, and whether there is a timer.
- **Strongholds:**
  - Rules: "nearly unlimited resources and a Tech Level that increases over time … Each Stronghold increases your total Population count by five. Hold the most Strongholds at the end of the timer, kill off your opponents, or hold all the Strongholds for one minute to win the game."
  - Xbox Wire's preview: "two teams of three players fight over seven small bases … whichever team has more bases at the end of the round is crowned the winner" ([Xbox Wire](https://news.xbox.com/en-us/2016/06/14/halo-wars-2-hands-on-preview/)).
  - Halopedia (**secondary**, citing a Waypoint article) gives "the time limit is set to 15 minutes" ([Strongholds](https://www.halopedia.org/Strongholds_(Halo_Wars))).
- **Blitz:** "you have 12 minutes to score more points than your opponent. You only earn points while you're holding more Control Zones than the opposing team." The rates are one point per 1.3 s, or per 0.7 s while holding all three. "Victory goes to the first team to score 200 points, or to the team with the most points when the 12-minute time limit expires" ([Blitz Basics](https://primagames.com/eguides/halo-wars-2-eguide/blitz/blitz-basics)).
- **Campaign missions** often aren't "destroy the base". Some ask you to capture a set of Nodes, or to hold out "against multiple waves of enemy forces until you can safely evacuate" ([Game Phases](https://primagames.com/eguides/halo-wars-2-eguide/getting-started/game-phases)).
  - **"Hold the Line":** a 30:00 countdown starts, and "Your job is to keep the cannon health bar from draining to zero before the Carrier Shield Breach countdown timer hits zero" ([Hold the Line](https://primagames.com/eguides/halo-wars-2-eguide/campaign-walkthrough/act-ii/mission-hold-the-line)).
  - **"Last Stand":** defend a control room under "a blue energy dome" that "sustained Banished attacks can degrade and eventually destroy". A bonus asks you to kill the commanders "within 10 minutes" ([Last Stand](https://primagames.com/eguides/halo-wars-2-eguide/campaign-walkthrough/act-iii/mission-last-stand)).

### Attacker and defender

- Multiplayer is symmetric: each side has a base and attacks the other. The asymmetry is between factions, and between a base and the open map.
- **Base defences** ([Banished Bases](https://primagames.com/eguides/halo-wars-2-eguide/structures/bases/banished-bases), [About Defensive Structures](https://primagames.com/eguides/halo-wars-2-eguide/structures/defensive-structures/about-defensive-structures)):
  - Bases at Tech Level 1 or higher have four Turret sites.
  - Forward bases and minibases have none: "If a minibase is performing a vital task, make sure you're prepared to actively defend it."
- **Faction defences differ by design.**
  - UNSC Turrets cost 300 and convert to Anti-Infantry, Anti-Vehicle or Anti-Air, "risk/reward" choices that are weaker against everything else. Advanced UNSC bases add long-range Siege Turrets that are "Vulnerable at close range" ([UNSC Defensive Structures](https://primagames.com/eguides/halo-wars-2-eguide/structures/defensive-structures/unsc-defensive-structures)).
  - Banished Turrets stack all three upgrades, "ensuring that a fully modified Turret deals reliable damage to all unit types". Larger Banished bases add "Shield Generators [that] protect structures and nearby units from hostile fire" (Tech Level 2) and "Cloaking Generators [that] can render entire bases invisible" ([Banished Defensive Structures](https://primagames.com/eguides/halo-wars-2-eguide/structures/defensive-structures/banished-defensive-structures)).
- **Losing a base** destroys "all the structures attached to it". The site can't be rebuilt for about 25 s ([About Bases](https://primagames.com/eguides/halo-wars-2-eguide/structures/bases/about-bases)).

### Reinforcement and caps

- **Units leave the base** that trained them, toward a local or global rally point. A base can be locked down so that new units stay inside, which hides the army's size ([About Bases](https://primagames.com/eguides/halo-wars-2-eguide/structures/bases/about-bases)).
- **Blitz deploys from cards, and landing in the field has a price.** "When you play a unit card, the corresponding unit instantly appears at your current location … Units afflicted by Deployment Fatigue suffer a 50 percent penalty to health and damage for eight seconds." A unit that takes no damage in that time recovers. "summoning units to your home base is the best way to ensure your reinforcements arrive at full strength" ([Core Concepts](https://primagames.com/eguides/halo-wars-2-eguide/blitz/core-concepts)).
- **Population caps:**
  - In the base-building modes, 80 at the start and 120 at most (Halopedia, **secondary**, as in [rts-economies-eaw-halo-wars.md](rts-economies-eaw-halo-wars.md)).
  - In Strongholds, +5 per Stronghold held.
  - In Blitz, "a Population limit of 30 active units … Blitz counts each active unit as a single member" ([Core Concepts](https://primagames.com/eguides/halo-wars-2-eguide/blitz/core-concepts)).

### What makes the rest of the map matter

From [Map Features](https://primagames.com/eguides/halo-wars-2-eguide/multiplayer-basics/multiplayer-atlas/map-features) unless noted:

- **Garrisons** hold one or two units, which "gain a defense buff and a line-of-sight bonus".
- **Resource Nodes**, captured by infantry, give the whole team Power "at roughly half the rate of a standard Generator".
- **Supply and Power pickups** are one-time grabs.
- **Minibases and expansion bases** add slots.
- **Healing Pylons** "instantly begin to heal all units that enter their radius".
- **Teleporters, light barriers and lightbridges** change the routes across the map.
- **In Blitz,** Energy Crates drop at set times: two at 10 s, one at 50 s, then every two minutes. Collecting them raises the team's income ([Blitz Basics](https://primagames.com/eguides/halo-wars-2-eguide/blitz/blitz-basics)).
- **In "Hold the Line",** Turret slots sit on high ground across the map. The Banished arrive by two lanes, each through a choke point with barricades ([Hold the Line](https://primagames.com/eguides/halo-wars-2-eguide/campaign-walkthrough/act-ii/mission-hold-the-line)).

### Retreat and battle length

- **Retreat:** I found no retreat rule in HW2. Losses are final, except in Blitz: "Each time you lose a unit, you receive a 50 percent refund for that unit's Energy cost" ([Core Concepts](https://primagames.com/eguides/halo-wars-2-eguide/blitz/core-concepts)).
- **Length:** 12 min for Blitz and 15 min for Strongholds (the latter **secondary**). Deathmatch and Domination have no length I could confirm. Prima's campaign advice treats a mission's "first five minutes" as its opening phase ([Game Phases](https://primagames.com/eguides/halo-wars-2-eguide/getting-started/game-phases)).

## Comparison

| | EaW land (campaign) | EaW space (campaign) | HW2 Domination / Strongholds / Blitz | Halo Battles today |
|---|---|---|---|---|
| Attacker wins by | destroying all units and base structures, or enemy retreat | destroying fleet and station, or enemy retreat | point or ticket limit, base kill; most Strongholds at the timer, or all held 1 min; 200 points | destroying the Command Post only |
| Time limit | none (fan data) | none (fan data) | Blitz 12 min, Strongholds 15 min (secondary), scored at the end | 4 min, defender wins |
| Attacker cap | from reinforcement points held, max 10 (fan data) | 20 (FoC: 20–25) | population; +5 per Stronghold | none; the whole Army lands at once |
| Defender cap | 10 plus free garrisons | 20 plus station garrisons | same as attacker | none |
| Reserves | queue, dragged in at held points | queue, dragged into cleared open space | trained at bases; Blitz cards, fatigued if summoned in the field | Dropship, once per Battle, at a held Landing Zone |
| Capture points | raise attacker cap; only infantry capture | none | score, tickets, or population | power the Command Post's shield |
| Defender extras | respawning garrisons, upgrades bought in battle, turrets, shield, layout (FoC) | station levels 1–5, garrisons, planetary guns | turrets (faction-specific), Banished shield and cloak | turrets on build pads, buildings as targets, layout, hidden Command Post |
| Retreat | 30 s lockout, ~11 s countdown, no attrition (fan data) | same, Gravity Well blocks it | none found | 10 s countdown, no lockout |

## What this means for Halo Battles

Halo Battles today (from [tactical-battle-spec.md](../specs/tactical-battle-spec.md)):

- The attacker wins only by destroying the Command Post.
- The Command Post's shield is down only while the attacker holds half the Landing Zones, rounded up. It is hidden until seen.
- At the 4-minute cap the defender wins.
- The attacker wins 67% when UNSC attacks Covenant, 33% when Covenant attacks UNSC, and 45% / 24% in big Battles. The target is 40–55% for either attacker.

All of the following are **options**, not decisions. Each is marked as likely to **lower Faction dependence** (close the UNSC/Covenant gap), to **shift attacker/defender balance** (move both rates together), or both.

### 1. The Command Post's armour favours one Faction (lowers Faction dependence)

- **Finding:** in both games, the objective a faction must break is built against everyone's weapons alike. EaW's targets are the base and station. Each HW2 faction defends with its own kit, and Banished defences are built to deal "reliable damage to all unit types".
- **Halo Battles:** the Command Post is the same for both Factions: `battle.commandPost` is 0 Shield / 60 Armor / 150 HP. By the damage table in [game-design-spec.md](../specs/game-design-spec.md), Kinetic does ×1.0 to Armor and ×1.25 to HP, and Plasma does ×0.75 and ×1.0. Ignoring overkill, UNSC small arms need about 60 + 150 / 1.25 = 180 damage to destroy it, and Covenant small arms about 60 / 0.75 + 150 = 230. That is about 28% more. The Starting Kits are 10 Marines and 2 Warthogs against 10 Grunts and 2 Ghosts, all Kinetic or all Plasma, with the same `disadvantage` tier against Structures, so nothing offsets it. `battle.structure` (0/20/30) leans the same way for buildings and Raids.
- **The measurements fit this, though other changes landed at the same time.** The UNSC/Covenant gap was 0 points (54% / 54%) under the old hold-timer win. It was 6 points (69% / 63%) once the Command Post arrived. It was 17 before step 7, and 34 now that the shield and the hidden Command Post make the Command Post the whole game.
- **Options:**
  - a Faction-specific Command Post, as the turrets already are: a Covenant one in Shield, like the Plasma Turret's 19/6/38;
  - Command Post stats that take equal damage from Kinetic and Plasma;
  - or let Explosive units carry the job, as the design intent says ("Explosive units are how either side breaks through").

  Any of these should be measured first, with the Lab's balance test, before the end-of-v4 pass.

### 2. A second way to win by holding ground (lowers Faction dependence, shifts balance)

- **Finding:** both games let territory win outright. EaW Land Control needs every point held for 30 s. Strongholds needs all held for 1 minute. Domination wins on points or by killing the base.
- **Halo Battles:** Landing Zones only switch the shield. Holding them all wins nothing.
- **Option:** the attacker also wins by holding every Landing Zone (or all but one) for N seconds. This brings back part of the v3 hold timer, which measured 54% / 54% before it was dropped (#98).
  - Taking ground doesn't depend on Weapon Type against a structure's layers, so it should narrow the Faction gap.
  - It also raises attacker wins overall, so the time cap or the hold time would need retuning.
- **A variant from Thrawn's Revenge** (see "From the game files"): the attacker wins by capturing the Command Post rather than destroying it. The capture is a 45 s hold, and it only counts once the shield is down.
  - Our shield already drops when the Landing Zones are taken, so this swaps "chew through 60 armour and 150 HP" for "stand there 45 s".
  - Standing still doesn't care about Weapon Type, which is where the Faction gap came from.

### 3. Score the time cap instead of handing it to the defender (shifts balance)

- **Finding:** neither game's normal modes award the timer to the defender. EaW has no limit. HW2 scores the end: the most points, or the most Strongholds. Only a campaign defence mission ("Hold the Line") is pure survival.
- **Halo Battles:** "time cap, 4 min" means the defender wins. Hiding the Command Post sent up to 30% of Battles to the cap, and moving the cap from 3 to 4 min raised both attackers (48→67%, 21→33%) without closing the gap. That suggests the cap is an attacker/defender lever, not a Faction one.
- **Options at the cap:**
  - the side holding more Landing Zones wins;
  - or a draw that leaves the attacker's Army in orbit at the Planet, Locked, to try again, much as EaW's attacker keeps its fleet in orbit after a failed landing.

  A slight defender lean is fine (memory: 40–55%), so ties could still go to the defender.

### 4. Attacker population tied to Landing Zones (shifts balance, makes the map matter)

- **Finding:** in EaW the attacker's cap comes from the points it holds, it lands only at held points, and the defender's cap is a flat 10. Reserves wait in a queue and come in as points are taken.
- **Halo Battles:** the whole attacking Army deploys at once at its Landing Zone. Only Dropships feed in later.
- **Option:** land part of the Army at the start (a Command Point budget), and raise the budget with each Landing Zone held. This gives Landing Zones a second job besides the shield.
  - It weakens the attacker unless the start budget is generous, so it's a lever for when big Battles lean to the attacker.
  - It doesn't touch Faction dependence.
  - Blitz's Deployment Fatigue is a related idea: units landed in the field arrive weakened for 8 s, units sent to home base don't.

### 5. Defender buildings that do something in Battle (shifts balance)

- **Finding:** EaW's production buildings spawn garrison units that respawn while the building stands and don't count toward the defender's cap. Its power generator runs the base shield and turrets. FoC Bribery switching garrisons off shows they matter.
- **Halo Battles:** buildings are passive targets. Destroying them "has no effect on the win conditions".
- **Options:**
  - a Barracks or Hall spawns a small mirrored garrison (one Marine or Grunt squad) on a timer while it stands;
  - or a building powers something, such as a turret's fire rate, or the shield in place of Landing Zones.

  Either makes destroying buildings a real secondary objective. With mirrored garrisons this moves attacker/defender balance rather than the Faction gap.

### 6. Give the attacker things on the map to find (shifts balance, makes the map matter)

- **Finding:** EaW says the defender starts ahead, and plants answers for the attacker in the map. It has special structures (a sensor array that clears the fog, a turbolaser tower to capture), friendly natives, a Mercenary Outfitter for attacker upgrades, and bombing runs from orbit that a base shield blocks. HW2 adds garrisonable buildings (a defence buff and more sight), Healing Pylons and Resource Nodes.
- **Halo Battles:** build pads, Landing Zones and cover. The defender takes pads during setup, so pads mostly help the defender.
- **Options, each a Fixture or a Ruleset value rather than code-heavy:**
  - garrisonable buildings in Fixtures;
  - a capturable sensor or gun emplacement on the attacker's half;
  - a healing point;
  - a periodic orbital strike for an attacker with ships in orbit, blocked inside the Command Post's shield.

  These are the most direct way to make the rest of the map matter. Placed symmetrically, they're Faction-neutral.

### 7. Smaller points

- **Retreat:**
  - EaW locks retreat for the first 30 s, and stock retreat costs nothing beyond the countdown. Halo Battles' 10 s countdown matches EaW's 11 s.
  - A short opening lockout would stop a defender from Retreating (and blowing the Command Post) before the attacker has engaged. This is minor.
- **Battle length:** Halo Battles' 141–155 s fights are far shorter than HW2 matches (12–15 min), but a Match holds many Battles, so short is right. EaW gives no length to compare.
- **Defence by Faction:** HW2 gives its factions different defensive kits on purpose (UNSC turret conversions, Banished shield and cloak). If Halo Battles gives Factions different defences, the measured balance needs to account for them. Today only the turrets' layers differ, and they mirror each other.

### Which ideas touch which problem

| Idea | Lowers Faction dependence | Shifts attacker/defender | Makes the map matter |
|---|---|---|---|
| 1. Command Post armour per Faction or neutral | **yes, likely the most** | slightly | no |
| 2. Win by holding all Landing Zones | yes | yes (towards the attacker) | yes |
| 3. Score the time cap | little | yes | yes, if scored by Landing Zones |
| 4. Population from Landing Zones | no | yes (towards the defender) | yes |
| 5. Buildings that spawn garrisons or power defences | no, if mirrored | yes (towards the defender) | yes |
| 6. Capturables, garrisons, orbital strike | no, if symmetric | yes (towards the attacker) | **yes, the most** |

## Not verified

- **EaW/FoC:**
  - I read the manuals as page text served by a Scribd upload, not a LucasArts-hosted PDF.
  - The following come from fan sources (EaW Revised's reverse-engineering, and UFoCP's modified XML), not first-party documents:
    - no time limit in campaign battles;
    - the 10-unit land ceiling for the attacker;
    - reinforcement point radii, capture time and capacity variants;
    - retreat timings and attrition;
    - bombing intervals.
  - UFoCP may have changed some stock values.
  - Whether the base shield blocks ground artillery: player reports only.
  - The capacity each reinforcement point gives on each map.
  - Campaign land battle lengths.
- **Halo Wars 2:**
  - Domination's point or ticket limit, its rates, and whether it has a timer.
  - The Strongholds timer of 15 minutes is from Halopedia (**secondary**), citing a Waypoint article I couldn't load.
  - Whether Deathmatch has any time limit.
  - The paywalled parts of Prima's pages weren't read. Prima's figures are launch-era and may have changed in later patches.
- **Halo Battles:**
  - The 180 vs 230 damage estimate uses only the layer multipliers. It ignores to-hit, overkill, Explosive units and focus fire. It's a hypothesis to measure, not a result.
  - The gap figures in point 1 span several changes (counters, AI, the hold timer's removal), so they don't isolate the Command Post.
- **The game files:** read as data only. I didn't check what the engine does with tags I didn't recognise, such as `Diminishing_Firepower`, `Base_Shield_Speed_Modifier` and `Base_Shield_Vulnerability_Modifier`, so they're left out. The mod files come from whatever versions were on the drive.
- **None of this was tested in play.**
