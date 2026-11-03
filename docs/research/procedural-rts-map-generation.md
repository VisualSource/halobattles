# Procedural map generation for RTS games

Researched 2026-11-03. Status: **research only**; nothing is built from it. The question: how do strategy games generate maps that each feel distinct and memorable, and are still fair enough for competitive play?

## Verdict

No shipped game relies on one algorithm. The generators that work all follow the same plan:

1. **A designer-authored archetype picks the map's shape.** Examples are an AoE2 script, an OpenRA "terrain type", a Neroxis "map style" and an Unexplored cycle type. Noise and randomness only fill in the details inside it.
2. **Fairness comes from symmetry wherever the game allows it.** Most generators build one player's share of the map and copy it by mirroring or rotation. Where symmetry isn't possible, the generator places each player's essentials relative to their start, within set distance bands, and treats the rest of the map as shared.
3. **Hard properties are constraints; soft ones are measured.** Connectivity, base space and minimum spacing are checked or repaired, never left to chance. Balance and interest are measured with path distances, or by letting bots play, and bad seeds are rejected.
4. **A map feels distinct because its structure changes, not because its noise does.** What players notice is choke topology, landmarks and where the resources sit. A generator that changes only the noise makes "10,000 bowls of oatmeal".

Every source treats seeds as the way to reproduce a map: to debug it, to share it, and to promote a good one into the handmade pool.

## Techniques

### Archetype scripts (template-based, constructive)

- **AoE2 random map scripts (RMS)** run in fixed sections, in order: `PLAYER_SETUP`, `LAND_GENERATION`, `ELEVATION_GENERATION`, `CLIFF_GENERATION`, `TERRAIN_GENERATION`, `CONNECTION_GENERATION` and `OBJECTS_GENERATION`. ([aoe2-rms sections](https://docs.racket-lang.org/aoe2-rms/sections.html), which adapts Zetnus's guide)
  - Land origins are placed first, then all lands grow at once until they fill their share or meet a border or another land.
  - Connections replace terrain along paths between land origins, for example shallows across a river or gaps in a forest. A connection that can't be made is skipped.
  - Objects are placed in order, and an object that finds no valid spot is silently dropped, "so place the most important objects first".
- **Each script is one archetype; randomness lives inside it.**
  - `rnd(min,max)` randomizes any number. ([Forgotten Empires RMS features](https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/rms-features))
  - `start_random` / `percent_chance` pick among whole branches: a season, or even a whole other script via `#include_drs`. ([Zetnus, Definitive RMS Guide](https://docs.google.com/document/d/1jnhZXoeL9mkRUJxcGlKnO98fIwFKStP_OBozpr0CHXo/edit), "Random Code"; announced [on the AoE forums](https://forums.ageofempires.com/t/definitive-random-map-scripting-guide/104902))
- **OpenRA's generator** (playtest-20260222) works the same way. Its options are a seed, a **terrain type** (Lakes, Puddles, Gardens, Plots, Plains, Parks, Woodlands, Overgrown, Rocky, Mountains, Oceanic, Large Islands, Continents, Wetlands, …), a shape, a symmetry and resource settings. Each terrain type is just a bundle of parameter overrides, such as feature size, forest and mountain amounts and road spacing. ([mods/ra/rules/map-generators.yaml](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/map-generators.yaml), [ClassicMapGenerator.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/World/ClassicMapGenerator.cs))
- **FAF's Neroxis generator**, used for Supreme Commander matchmaking, layers its archetypes.
  - A **map style** (BASIC, BIG_ISLANDS, CENTER_LAKE, DROP_PLATEAU, LAND_BRIDGE, LOW_MEX, MOUNTAIN_RANGE, VALLEY, RIVERS, …) declares which map sizes and team counts it suits.
  - Each style then holds **weighted options** for its terrain style, biome, resource style and prop style. ([MapStyle.java](https://github.com/FAForever/Neroxis-Map-Generator/blob/develop/generator/src/main/java/com/faforever/neroxis/generator/util/serial/MapStyle.java), [README](https://github.com/FAForever/Neroxis-Map-Generator))
- **Wesnoth's default generator** is configured entirely by parameters ([MapGeneratorWML](https://wiki.wesnoth.org/MapGeneratorWML)):
  - hill iterations and size, lakes, rivers, `island_size`, and a temperature map;
  - castles with `min_distance` between them;
  - villages "per 1,000 hexes", so density scales with map size. The code multiplies by width × height / 1000 and retries a failed job up to 10 times. ([default_map_generator.cpp](https://github.com/wesnoth/wesnoth/blob/f323deb23ebc878796c32455eed53ab79e80781f/src/generators/default_map_generator.cpp))

### Graph first, then embed

- **Unexplored** builds an abstract mission graph with no spatial information first, then turns it into a low-resolution tilemap, then a high-resolution one, then adds monsters, traps and keys from the graph. ([Game Developer, Tommy Thompson](https://www.gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-))
- **Cycles instead of trees.** Joris Dormans' point is that most generators branch, which "is increasingly noticeable as levels increase in size", and that loops give real structure and routes. Unexplored starts from a 5×5 grid of nodes and draws a start, an end and a loop between them, using one of **24 major cycle types** that set the main flow. Minor cycles and dead ends are then added by graph rewriting. ([Boris the Brave, "Dungeon Generation in Unexplored"](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/); Dormans' grammar method is in [PCG book ch. 5](https://www.pcgbook.com/chapter05.pdf))
- **Most of the variety comes from hand-written rules.** By Boris the Brave's count, there are about 5,000 find-and-replace rules across about 50 modules, and "procedural generation doesn't remove this authoring work". Abstract symbols such as "Obstacle" and "Lock/Key" are resolved late, so one structure can be dressed many ways. (same source)
- **Red Blob's polygon maps** take the same graph-first view for terrain. Mapgen2 uses a Delaunay/Voronoi dual graph rather than a grid. It is "intentionally" unrealistic, because it was built for one game's needs: island shapes, and mountains in the centre. ([mapgen2](https://www.redblobgames.com/maps/mapgen2/); the original 2010 article is at [Stanford](http://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/), which was unreachable when checked)

### Noise terrain

- **Noise works as a texture under a structure, not as the structure.**
  - Wesnoth cuts a height map into terrain bands and converts terrain by temperature. ([MapGeneratorWML](https://wiki.wesnoth.org/MapGeneratorWML))
  - OpenRA layers terrain from noise with a "feature size", then repairs it: it removes unplayable regions and fills walled-off areas. ([ClassicMapGenerator.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/World/ClassicMapGenerator.cs))
  - Unexplored uses cell noise for terrain only after the graph has fixed the layout. ([Boris the Brave](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/))
- **Noise is biased, so measure it.** AoE2's hill placement "is noticeably biased towards being placed in the south". DE added `enable_balanced_elevation` to correct it. ([Zetnus guide](https://docs.google.com/document/d/1jnhZXoeL9mkRUJxcGlKnO98fIwFKStP_OBozpr0CHXo/edit), "enable_balanced_elevation")

### Wave function collapse

- **WFC only enforces local similarity.** It "generates bitmaps that are locally similar to the input bitmap". It can complete partly hand-made layouts.
- **It guarantees no global property.** Connectivity, for example, needs add-ons from other work.
- **It can fail.** Deciding whether a valid output exists is NP-hard, though contradictions are "surprisingly rare" in practice.
- **Easy tilesets give dull maps.** Tilesets that can never get stuck produce no interesting global structure.

([mxgmn/WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse))

For an RTS this makes WFC a dressing tool, not a layout tool.

### Search-based generation (evolve, then test)

- **The PCG book splits evaluation functions into three kinds**: *direct* (computed from the map), *simulation-based* (AI agents play it) and *interactive* (humans play it). Direct functions are fast but "hard to devise" for experience-level qualities. ([PCG book ch. 2](https://www.pcgbook.com/chapter02.pdf))
- **Togelius et al., StarCraft (CIG 2010).** The genotype is about 100 real numbers. Some numbers are base and resource positions; the rest drive a turtle that "draws" impassable areas. Every distance is an A* path length. ([paper](https://www.um.edu.mt/library/oar/bitstream/123456789/29280/1/Multiobjective_exploration_of_the_starcraft_map_space_2010.pdf))
  - **Sanity check:** every base and resource must be reachable from every base, or the map scores 0 on everything.
  - **Base space (fb0):** the share of the 5×5 around a base that is reachable within 5 steps.
  - **Base distance (fb1):** the minimum distance between bases ÷ (width + height).
  - **Resource fairness (fr4):** 1 − (max − min) of each base's distance to its nearest resource. Resource *ownership* and *safety* (fr2/fr3) measure how clearly each resource belongs to one base.
  - **Choke points (fp1):** the average narrowest gap on the paths between bases.
  - **Path overlap (fp2):** how much the base-to-resource paths share cells, as a stand-in for "flash points".
  - **Findings:**
    - The base-placement objectives were trivial to optimize, so they became **constraints**.
    - fr4 gave "much more palatable" maps than fr1.
    - Maximizing chokes produced "scattered and disconnected impassable areas" perforated by small gaps.
    - Their stated goals include "Interestingness: maps should not all look the same, and should not be bland (e.g. symmetrical or featureless)". They also note that "fairness … does not necessarily mean that starting positions should be or look similar".
- **Planet Wars (a Galcon-like graph RTS from the Google AI Challenge 2010):**
  - Lara-Cabrera, Cotta and Fernández-Leiva evolved maps for **balance**, meaning "none of the players strongly dominates her opponent", and for **dynamism** by playing top AI bots on each candidate. ([EvoApplications 2013 record](https://portaldelainvestigacion.uma.es/documentos/662468acdc30f904d76a02ec))
  - A follow-up scored "aesthetic" maps by planet-layout statistics: the mean and spread of inter-planet distances, the mean and spread of planet sizes, and the correlation of size with garrison. Evolved maps were pulled toward a set of liked maps and away from disliked ones. ([Evolving Aesthetic Maps for a RTS Game](https://riuma.uma.es/bitstreams/f6d60fae-fb0e-43fb-98c9-6a8650d6be23/download))
- **FPS balance by simulation:** Lanzi, Loiacono and Stucchi evolved maps that balance a match between bots of *unequal* skill, using statistics from simulated matches. ([Stucchi thesis, Politecnico di Milano](https://www.politesi.polimi.it/retrieve/a81cb05a-abd6-616b-e053-1605fe0a889a/RiccardoStucchi783044.pdf)) A later survey notes that players found those maps "quite flat" next to real games' maps. ([The Quest for Content, arXiv 2311.04710](https://arxiv.org/pdf/2311.04710))

## Fairness

### Symmetry

- **OpenRA** supports mirrors (left/right, top/bottom, both diagonals) and N rotations about the centre, and defaults to 2 rotations.
  - A mirror choice is offered only for even player counts.
  - It generates the map, then finds cells whose projections disagree and paints obstacles over them (`EnforceSymmetry`), so the result is truly symmetric for gameplay.
  - Rotations other than 180° "may be slightly imprecise" on a grid.
  - ([Symmetry.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/MapGenerator/Symmetry.cs), [Terraformer.cs `FindAsymmetries`](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/MapGenerator/Terraformer.cs), [map-generators.yaml](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/map-generators.yaml))
- **Neroxis** offers rotational symmetries from 2 to 16 points, the X and Z mirrors, both diagonals, QUAD and DIAG, and it has a `MapSymmetryTester`. ([Symmetry.java](https://github.com/FAForever/Neroxis-Map-Generator/blob/develop/shared/src/main/java/com/faforever/neroxis/map/Symmetry.java))
- **Symmetry alone doesn't settle positional balance.** The SC2 Map Analyzer, a mapmakers' tool, still measures ground and air shortest paths between key locations, "openness" (distance to the nearest unpathable cell), main-base space and chokes. It also gives a positional-balance "influence" score: how likely one start is to control a base compared with another. ([SC2 Map Analyzer](https://www.curseforge.com/sc2/assets/sc2-map-analyzer))

### Fairness without symmetry: per-player placement

- **AoE2 places each player's essentials relative to that player.**
  - `set_place_for_every_player` with `min_distance_to_players` / `max_distance_to_players` puts each player's gold, stone, berries and so on in a fixed distance band from their own town centre.
  - `create_player_lands` gives each player an equal share of land and, with `circle_radius`, puts every start the same distance from the centre.
  - ([Zetnus guide](https://docs.google.com/document/d/1jnhZXoeL9mkRUJxcGlKnO98fIwFKStP_OBozpr0CHXo/edit), "create_player_lands", "set_place_for_every_player")
  - **Pitfall:** `group_variance` varies "each group independently, so this is not suitable for ensuring fair player starting resources". Roll the random value once and apply it to every player instead. (same, "group_variance")
- **0 A.D.** works the same way.
  - Starts come from named patterns: circle, arcs, river, line, stronghold and random.
  - Player bases are stamped from parts: civic centre, mines at a set distance and angle, berries, hunt and trees.
  - Random placement requires starts at least a quarter of the map apart. After repeated failures it shrinks that limit by 5%, and it gives up after 500 resets.
  - ([rmgen-common/player.js](https://github.com/0ad/0ad/blob/master/binaries/data/mods/public/maps/random/rmgen-common/player.js); this GitHub mirror is archived, and development moved to Wildfire Games' Gitea)
- **Civilization VI** scores every plot's "weighted fertility" over a 3-tile radius: a river adds 100, while snow, ice and impassable tiles subtract. It divides the map into regions by fertility and starts each civ on a good plot in its region. The "balanced" start option then adds bonus resources near the starts. ([AssignStartingPlots.lua](https://github.com/notque/nqmod/blob/master/HBMap/AssignStartingPlots.lua), a mod's copy of Firaxis's script, which isn't published upstream) The competitive community still ships its own [Better Balanced Starts](https://github.com/CivilizationVIBetterBalancedGame/BetterBalancedStarts), which suggests score-based balance isn't enough for competitive play.
- **The Riftbreaker** fixes resource *amounts* per mission, within ranges, and leaves their *positions* to rules. The player spawns at the point closest to the basic resources. ([EXOR Studios, "Systematic chaos"](https://www.gamedeveloper.com/design/systematic-chaos---procedural-map-generation-in-the-riftbreaker))

## What makes maps feel non-repetitive

- **Perceptual difference, not mathematical difference.** "I can easily generate 10,000 bowls of plain oatmeal": every bowl is unique, yet the viewer sees only oatmeal. Kate Compton separates *differentiation* ("not identical to the last") from *uniqueness* (memorable), and says most output can be background as long as a few pieces stand out. ([Compton, "So you want to build a generator"](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator))
- **Archetypes with weighted sub-options.** Examples are Neroxis's style → terrain, biome, resource and prop styles, OpenRA's named terrain types, and AoE2's `percent_chance` between whole scripts (above). Each archetype changes the map's *topology* (islands, land bridge, valley, centre lake), and topology is what players remember.
- **Landmarks and authored set pieces.**
  - The Riftbreaker hides handcrafted **prefabs** under its tiles that "pop up wherever there is a window left for them", at random positions and orientations. Changing only the prefab seed gives results that "range from very subtle to completely unrecognizable". ([EXOR](https://www.gamedeveloper.com/design/systematic-chaos---procedural-map-generation-in-the-riftbreaker))
  - Unexplored places set pieces by pattern matching. ([Boris the Brave](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/))
- **Varying choke topology.**
  - Unexplored's 24 cycle types change the route structure, not just the decoration.
  - Togelius's fp1 shows a single choke metric drives the look from "compact impassable areas and open spaces" to perforated walls, so a target band for it, rather than a maximum, gives a continuum of map characters. ([paper](https://www.um.edu.mt/library/oar/bitstream/123456789/29280/1/Multiobjective_exploration_of_the_starcraft_map_space_2010.pdf))
- **Measuring variety (expressive range).**
  1. Pick two or more metrics.
  2. Generate many maps.
  3. Plot them as a heatmap. The heatmap shows the generator's bias, and comparing heatmaps across settings shows how controllable it is.
  - Choose metrics "as far as possible from the input parameters", since measuring an input only confirms it.
  - Add samples until the graphs stop changing.
  - ([PCG book ch. 12](https://www.pcgbook.com/chapter12.pdf), after Smith & Whitehead 2010)
- **Small, dense maps stay interesting more easily than big ones.** That is Dormans' view as reported by Boris the Brave. ([Boris the Brave](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/))

## Seeds and reproducibility

- **Give each stage its own RNG.** OpenRA derives a separate generator for each stage, so "changes in one part of the algorithm [don't affect] randomness in other parts". New stages are only ever appended, and a retired stage keeps its unused `random.Next()` call. ([ClassicMapGenerator.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/World/ClassicMapGenerator.cs), around line 465)
- **AoE2 shows the cost of one shared stream.** "Commenting out a random block at the end of your script may change which random branch is chosen at a different (earlier) point". ([Zetnus guide](https://docs.google.com/document/d/1jnhZXoeL9mkRUJxcGlKnO98fIwFKStP_OBozpr0CHXo/edit), "Scripting and Testing")
- **Show the seed.** AoE2 DE shows the map seed after a game and can regenerate a recorded game's map in the editor. (same, changelog notes)
- **Fuzz the generator.** OpenRA ships `--fuzz-map-generator`, which runs the generator over combinations of settings, sizes and tilesets and tallies failures by stack trace. ([FuzzMapGeneratorCommand.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/UtilityCommands/FuzzMapGeneratorCommand.cs))

## Pitfalls

- **Optimizing one metric gives a degenerate map.** Maximized chokes produced walls full of holes. An objective that is easy to satisfy belongs in the constraints, not in the fitness. ([Togelius et al.](https://www.um.edu.mt/library/oar/bitstream/123456789/29280/1/Multiobjective_exploration_of_the_starcraft_map_space_2010.pdf))
- **Symmetric maps read as bland, and asymmetric ones as unfair.** Togelius lists symmetry under blandness, yet every competitive generator above defaults to it. The usual compromise is a symmetric layout with varied structure, plus asymmetric decoration that doesn't affect play (OpenRA's `EnforceSymmetry` repaints only cells that matter).
- **Silent drops.** AoE2 skips objects and connections that don't fit, and the spacing rules in 0 A.D. and halobattles shrink until things fit. Either way a seed can quietly give one player less. Whatever shrinks or gets dropped needs a test or a log.
- **Rare failures.** Wesnoth retries up to 10 times. WFC can hit contradictions. 0 A.D.'s random placement can give up. Plan for a retry or a fallback layout, and fuzz for failures.
- **Generated maps can feel flat** next to handmade ones. ([survey](https://arxiv.org/pdf/2311.04710))
- **Most maps should be background.** Players need a few memorable ones, and a generator that tries to make every map special tends to make them all the same. ([Compton](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator))

## Relevance to Halo Battles

What exists today:

- **Galaxy maps** are handmade JSONC content (`quadrant`, `war-amp`, `sandbox`) with Planets, typed Lanes, `starts`, `minPlayers` and `win`. ([mods/base/data/maps/](../../mods/base/data/maps/)) Quadrant is 4-fold rotationally symmetric by hand ([game-design-spec.md](../specs/game-design-spec.md)); War Amp isn't symmetric.
- **Battlefields** are generated from the Match seed + the Planet id ([field.go](../../server/internal/battle/field.go), [tactical-battle-spec.md](../specs/tactical-battle-spec.md#generation)):
  - ranked noise bands from a per-Planet Terrain Preset, then a connectivity carve;
  - 3 Control Points in the middle half;
  - 3 attacker starts on the edges, placed by farthest-point;
  - MST-plus-ring lanes, building sites and pads.
  - Each stage already has its own PCG stream (`seed, 1` … `seed, 7`), which is OpenRA's practice.
  - The fight is asymmetric by design (defender vs attacker), and its balance is already measured by simulated win rate.

All of the following are **suggestions**, not decisions.

### Galaxy graph

1. **Keep handmade maps as the main pool.** If a generator is added, make it a **content tool that writes a JSONC map**, rather than something run when a Match starts. That fits the "data-driven content first" priority, lets a good seed become a named map, and keeps Match setup unchanged.
2. **Generate the graph first, then embed it, using one fundamental domain.** Generate one player's wedge (Planets, Lanes, Planet Types) and rotate it N ways for N `starts`, as Quadrant does by hand and as OpenRA and Neroxis do with `Rotations`. Positions come after the topology.
3. **Archetypes with weighted options, as in Neroxis.** Examples: hub-and-spoke (Quadrant), ring, two-front, a fortress chain, and a contested rich core. Each archetype then picks weighted options for the Lane-type mix (`fast`/`slow`), the share of Rich and Fortress Planets, and the neutral garrisons.
4. **Make cycles mandatory.** Each Capital should have at least two Lane routes to the contested area, so the graph isn't a tree (Dormans). A choke can then be a single `slow` Lane or one Fortress Planet, rather than the only way in.
5. **Fairness checks computed with the game's own routing.** The spec's Dijkstra travel times are the natural "A* distance" here. For each start, compute:
   - time to the nearest k neutrals;
   - time to the hub and to each other Capital;
   - the income within t seconds, a fertility-style score like Civ VI's;
   - the number of articulation points between Capitals.

   Under exact rotation these are equal by construction, so they serve as a regression test. For asymmetric maps like War Amp, they are the balance report, in the spirit of Togelius's fr4: 1 − (max − min).
6. **Expressive range.** Over about 1,000 seeds, plot two metrics that aren't inputs, such as mean Capital-to-Capital time against cycle count, to see whether the archetypes really differ.
7. **Bots as the final check.** If the bot spec's bots can play headless Matches, a Planet-Wars-style simulated win-rate check per map is possible later. That costs far more than the graph metrics.

### Tactical Battlefield

1. **Fairness here means fairness between attacker starts.** The Battle seed picks one of the 3 starts, but the first is random and the rest go farthest-point. Nothing yet keeps the path cost from each start to its nearest point, and to all three points, similar. Two fixes:
   - a constraint: reject and reshuffle when the spread is over a threshold;
   - or a reported metric, as Togelius's fr4 does for resources.
2. **The Control Point layout is the most noticeable sameness.** Three points in the middle half, spaced 10 apart, will mostly form similar triangles. The spec already says to revisit it. Options:
   - **layout archetypes**: line, triangle, a clustered pair plus an outpost, a point on high ground;
   - chosen per Terrain Preset with weights, or by `percent_chance`-style branches.
3. **Landmarks as prefabs.** Stamp a few authored pieces, such as a Forerunner structure, a crash site or a bridge, before or after noise, as The Riftbreaker does. Keep them as Mod content next to the Terrain Presets. That gives each Planet something memorable, and it already stays fixed for the whole Match.
4. **Choke metrics with a target band, not a maximum.** Measure the narrowest gap on each start-to-point lane (Togelius's fp1) and the openness around points. Aim each preset at a band, because maximizing either gives perforated or empty maps.
5. **Expressive range per preset.** Use the same heatmap method across seeds (for example, narrowest gap against the share of high ground near points) to check whether desert, ice and the rest *play* differently, not just look different.
6. **Fuzz alongside the existing win-rate tests.** Like OpenRA's fuzz command, run many seeds per preset and assert three things: no stage dropped or shrank its spacing, every start reaches every point, and the attacker's win rate stays in the spec's band.
7. **Keep the RNG streams append-only.** Add any new stage as `seed, 8` and onward, and never renumber, so existing seeds keep their maps (OpenRA's rule). This matters once players learn Planets.
8. **Use WFC only for local dressing**, such as rubble, cover patterns and the look of a base around a pad, never for layout. It can't guarantee the connectivity the carve step provides.

## Not verified

- These pages couldn't be read: the TeamLiquid symmetry threads (403), the official AoE2 RMS commands page (403) and the Stanford copy of Red Blob's polygon article (connection refused).
- The Civ VI script is a mod's copy, not Firaxis's original.
- The 0 A.D. source is the archived GitHub mirror.
- I didn't find a primary source on Stellaris hyperlane generation, the closest commercial match to a galaxy graph; the forum material was too thin.
- No claim here was tested against halobattles code. The Battlefield suggestions come from reading `field.go` and the specs only.
