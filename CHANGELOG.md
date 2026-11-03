# Changelog

Player-facing changes to Halo Battles. Each release is its own section, newest first; `Unreleased` collects changes until the next one. Versions follow [SemVer](https://semver.org): 0.x while in development, the middle number for new features, the last for fixes only.

## Unreleased

### Added

- Raids: drag a Stack of raiders (scouts, infiltrators and shock troops, up to 10 Command Points) onto a Planet's raid slot to send it after the buildings there. Nobody else sees a Raid coming. The raiders have 100 s to destroy every building, then head home; the Planet never changes hands, but what they destroy stays destroyed. A Raid that finds no buildings turns back, and tells you so.
- The UNSC M121 Jackrabbit, a light scout vehicle built at the Vehicle Depot.

### Changed

- New scouts: the Jackrabbit replaces the Warthog as the UNSC's scout, and the Revenant, now with real stats, replaces the Ghost as the Covenant's. ODSTs, Elites, Jackal Snipers and Spectres can raid.
- The Warthog now needs the Hog Wild Tech, after Motor Pool. The Summoning Foundry has its own Tech, which Ghost and Wraith Fabrication need.

- Battles are won differently: the attacker wins by destroying the defender's Command Post, a new structure on every Battlefield. Wiping out the defence isn't enough; the Command Post still has to fall before time runs out. A defender that Retreats abandons it, and it blows up.
- An enemy Planet with no units and no buildings is taken on arrival, with no Battle.
- Battlefields have shape: open fields, rivers with fords, ridges and valleys, and ruined cities, with landmarks such as crash sites, trench lines, Forerunner ruins and bridges.
- The defender fights from a base, a UNSC firebase, a Covenant outpost or a garrison's outpost, holding its Command Post and buildings, far from where the attacker lands.
- The attacker lands at a Landing Zone and holds it; the others start held by nobody, for either side to take. Holding Control Points no longer wins a Battle; they're now Landing Zones.
- A defender's scout comes home to fight once the enemy is found, instead of roaming the map while its base is attacked.
- In Battles, a squad picks off enemies that fire back before buildings.
- In Battles, units fight in smaller squads: infantry in fours, vehicles and aircraft in pairs. 10 Marines take the field as three squads instead of one.

### Fixed

## 0.4.0 - 2026-11-02

### Added

- Join a full lobby to watch the Match, or switch between a Seat and watching. Beaten players can stay and watch the rest, and Bots play on while someone watches.
- Teams: the Host can turn them on in the lobby, and each player picks a Team. Teammates share vision, pass through each other's Planets, and win together.
- 8 player colours, so no two players on a big map share one.
- An Armies tab beside your Planets lists every Army on the move and every Stack with units in it; click one to select it, double-click to jump there.
- Rally Points: set one in a Planet's Stacks to send every unit trained there straight on to another of your Planets.
- The main menu shows the game's version: click it to read this changelog.
- Planets come in more looks: terrestrial, desert, ice, lava, barren, and gas giants with or without rings, each in colours of its own.
- Servers can keep a log of each Match, to look back at what Bots and Battles did.

### Changed

- The lobby fits the screen: the Seats list and Match Settings scroll inside their own cards, and the page no longer scrolls.
- Your Faction sits under Match Settings in the lobby, and is hidden while you're watching.
- The lobby's Teams setting is a switch.
- Hover a Stack's Rally badge to see what it means: newly trained units are placed there.
- The Stacks above a Planet stand out from the Planet and its glow.

### Fixed

- The Forerunner no longer show up as a Faction to play or give a Bot: they only guard neutral Planets.
- An Easy Bot no longer sends lone Grunts into your Planet one after another, keeping it Locked.
- Bots gather their units for one target at a time, instead of passing them from Planet to Planet.
- A Bot that takes your last Capital now wins the Match; it used to end as abandoned.
- Clicking a Planet selects it even with an Army right next to it.

## 0.3.0 - 2026-11-01

### Added

- The tech tree: see every Tech, what it needs and what it leads to.
- A building's info card opens on click.
- Units to build show the same detail as the building picker.
- New units: more Warthog models, an anti-air Wraith, the Rhino, Revenant and Spectre, and the Forerunner's Sentinels and Prometheans.
- Unit variants: a unit can come in more than one version.
- A new map: War Amp.

### Changed

- A balance pass over the Forerunner units.
- Command Points have their own icon.
- The music fades in.

## 0.2.0 - 2026-10-31

### Added

- A building's info card: what it does, what it costs and its Upkeep.
- Focus fire in Battles.
- Battle AI Task Forces: squads move, gather and fight together.
- A setup phase at the start of a Battle, while the defender takes build pads and builds turrets.
- A soundtrack.
- A Tech you can't research yet tells you what it needs.

### Changed

- Battlefields are built around their Control Points, with lanes between them and build pads where they're useful.
- Battles start sooner.
- Each Research field's hand is topped up.
- A tidier unit production list.

### Fixed

- Battle squads react to pad turrets and shoot back at them.

## 0.1.0 - 2026-10-30

The first tracked release.

### Added

- **The galaxy map:** Planets joined by Lanes. Order Armies by dragging Stacks between Planets, see what's in your Vision, and remember Planets as you last saw them.
- **Battles:** real-time tactical Battles on generated Battlefields, with Control Points, build pads, turrets and Retreat.
- **The economy:** Credits, Materials and Alloys paid at each Payday, Stockpile caps, Sprawl, the Exchange, and buildings and units to queue.
- **Research:** Labs and their Tech Slots, and three Research fields (Military, Industry and Logistics), each with its own Project and hand of cards. Techs unlock units and buildings or give effects, and a Tech in a lost Lab can be recovered.
- **Bots:** Easy, Normal and Hard Bots take a Seat and play the galaxy map, attacking, defending, building and researching.
- **The lobby:** pick the map, your Faction (UNSC or Covenant) and the starting resources, share an invite link, and add or remove Bots.
- **Winning:** hold the map's share of Planets for long enough, or be the last player standing.
- Notifications when a Tech finishes or a Research field sits idle.
- A threat level for your own Planets and Armies.
