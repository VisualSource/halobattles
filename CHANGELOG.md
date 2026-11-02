# Changelog

Player-facing changes to Halo Battles. Each release is its own section, newest first; `Unreleased` collects changes until the next one. Versions follow [SemVer](https://semver.org): 0.x while in development, the middle number for new features, the last for fixes only.

## Unreleased

## 0.4.0 - 2026-11-02

### Added

- The main menu shows the game's version: click it to read this changelog.
- Planets come in more looks: terrestrial, desert, ice, lava, barren, and gas giants with or without rings, each in colours of its own.
- Servers can keep a log of each Match, to look back at what Bots and Battles did.

### Changed

- The Stacks above a Planet stand out from the Planet and its glow.

### Fixed

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
