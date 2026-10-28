// Generated from schema/content by mise run gen. Do not edit.

/**
 * Up to a Planet's three Stacks, first Stack first.
 *
 * @maxItems 3
 */
export type Stacks = [] | [Stack] | [Stack, Stack] | [Stack, Stack, Stack];
/**
 * Units in one Stack, one entry per Unit Slot.
 */
export type Stack = StackEntry[];

/**
 * The merged content document the server serves: kind, then id, then definition, with every Patch applied.
 */
export interface Content {
  resources: {
    [k: string]: Resource;
  };
  rulesets: {
    [k: string]: Ruleset;
  };
  factions: {
    [k: string]: Faction;
  };
  units: {
    [k: string]: Unit;
  };
  buildings: {
    [k: string]: Building;
  };
  unitClasses: {
    [k: string]: UnitClass;
  };
  weaponTypes: {
    [k: string]: WeaponType;
  };
  planetTypes: {
    [k: string]: PlanetType;
  };
  maps: {
    [k: string]: GalaxyMap;
  };
  terrains: {
    [k: string]: Terrain;
  };
  terrainPresets: {
    [k: string]: TerrainPreset;
  };
}
/**
 * A stockpiled currency players earn at Payday and spend. Command Points is not a Resource.
 */
export interface Resource {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
}
/**
 * Game-wide tuning values. There is exactly one, `base:rules`, which later Mods Patch.
 */
export interface Ruleset {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * Time between Paydays.
   */
  paydaySeconds: number;
  /**
   * Refund for cancelling a queue item after it started.
   */
  cancelRefundPercent: number;
  /**
   * Refund for selling a building.
   */
  sellRefundPercent: number;
  unitSlotsPerStack: number;
  /**
   * An attack's d20 roll below this misses.
   */
  toHit: number;
  /**
   * Travel-time multiplier per Lane type.
   */
  laneTypes: {
    [k: string]: number;
  };
  startingResources: ResourceMap;
  /**
   * How long a disconnected player keeps their Seat.
   */
  gracePeriodSeconds: number;
  /**
   * How long a player keeps seeing a Planet after their Army there leaves or is destroyed.
   */
  armyVisionSeconds: number;
  /**
   * How long a Match stays in results.
   */
  resultsSeconds: number;
  battlefield: BattlefieldRules;
  battle: BattleRules;
}
/**
 * Defaults the lobby fills in.
 */
export interface ResourceMap {
  [k: string]: number;
}
/**
 * How Battlefields are generated. A map's Planet can override the size and preset.
 */
export interface BattlefieldRules {
  width: number;
  height: number;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  terrainPreset: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  pathClass: string;
  controlPoints: number;
  /**
   * The fewest cells between two Control Points, where the map has room.
   */
  controlPointSpacing: number;
  /**
   * Depth in cells of the strip along each edge an attacker can deploy in.
   */
  deployDepth: number;
  /**
   * Build pads the generator places: spots a side can capture and build a turret on.
   */
  buildPads: number;
}
/**
 * How a Battle runs on its Battlefield.
 */
export interface BattleRules {
  /**
   * Seconds from an Army's arrival to the first sim tick: both sides are deployed and the Planet Locked, so players can open the Battle.
   */
  startDelay: number;
  /**
   * Seconds a turret takes to build on a build pad.
   */
  padBuildSeconds: number;
  neutralFunds: ResourceMap1;
  /**
   * Seconds of fighting, after startDelay, until the defender wins.
   */
  timeCap: number;
  /**
   * How near, in cells, a ground Squad must be to a Control Point to hold or take it.
   */
  captureRadius: number;
  /**
   * How long one side alone must be in range to take a Control Point.
   */
  captureSeconds: number;
  /**
   * How many Control Points the attacker must hold to start the hold timer.
   */
  holdPoints: number;
  /**
   * How long the attacker must hold them to win.
   */
  holdSeconds: number;
  /**
   * Added to the To-hit roll of a ground attack from a higher height level.
   */
  highGroundToHit: number;
  /**
   * Seconds from ordering a Retreat until the side turns and heads off the field; it fights on meanwhile, and can call it off.
   */
  retreatCountdown: number;
  /**
   * Extra Sight, in cells, per height level a ground unit stands on.
   */
  heightSight: number;
  structure: Structure;
  /**
   * Battle stats per Unit Class id, for any a unit or building doesn't set. Every Unit Class needs one.
   */
  classDefaults: {
    [k: string]: ClassStats;
  };
}
/**
 * What a neutral garrison has to spend on pad turrets in each Battle, having no economy.
 */
export interface ResourceMap1 {
  [k: string]: number;
}
/**
 * What a building without a combat block is in a Battle: a target that never fires.
 */
export interface Structure {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  unitClass: string;
  shield: number;
  armor: number;
  hp: number;
}
/**
 * A Unit Class's default Battle stats.
 */
export interface ClassStats {
  /**
   * Cells per second.
   */
  speed: number;
  /**
   * Farthest it fires, in cells.
   */
  range: number;
  /**
   * Seconds between volleys.
   */
  fireInterval: number;
  /**
   * Sight radius in cells.
   */
  sight: number;
}
/**
 * A playable side with its own units and buildings.
 */
export interface Faction {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
  ai?: AIWeights;
  startingKit: StartingKit;
}
/**
 * How the Faction's Battle AI plays: each weight scales one kind of choice; 1 is neutral.
 */
export interface AIWeights {
  /**
   * How much it goes after enemy squads it can see. Defaults to 1.
   */
  aggression?: number;
  /**
   * How much enemies near a goal put it off, and how readily a hurt squad regroups. Defaults to 1.
   */
  caution?: number;
  /**
   * How much it prefers cover and high ground when it stops to fight or hold. Defaults to 1.
   */
  cover?: number;
  /**
   * How much it goes after enemy buildings. Defaults to 1.
   */
  raid?: number;
  /**
   * How much it searches when it can see no enemy. Defaults to 1.
   */
  scout?: number;
}
/**
 * Placed on the Faction's Capital when a Match starts. Starting resources are a lobby setting, not part of the kit.
 */
export interface StartingKit {
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  buildings: string[];
  stacks: Stacks;
}
export interface StackEntry {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  unit: string;
  count: number;
}
export interface Unit {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  faction: string;
  cost: ResourceMap2;
  /**
   * Seconds to train one.
   */
  buildTime: number;
  /**
   * Command Points one unit occupies, from queue to death.
   */
  commandPoints: number;
  /**
   * Per-player limit, counted from queue to death.
   */
  maxCount?: number;
  /**
   * The most of this unit one Unit Slot holds; more take another slot. Unset is no limit.
   */
  slotLimit?: number;
  /**
   * Hints for the Battle AI: which roles it picks this unit for first. A scout roams to look and falls back from the enemy; a skirmisher patrols between points and hunts what it's good against.
   */
  roles?: ("scout" | "skirmisher")[];
  combat: Combat;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap2 {
  [k: string]: number;
}
/**
 * Battle stats. A Unit Class missing from tiers counts as `normal`.
 */
export interface Combat {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  unitClass: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  weaponType: string;
  shield: number;
  armor: number;
  hp: number;
  /**
   * The damage roll, in dice notation: NdM, or NdM+K.
   */
  damage: string;
  /**
   * Cells per second; defaults from the Ruleset's battle.classDefaults.
   */
  speed?: number;
  /**
   * Farthest it fires, in cells; defaults from battle.classDefaults.
   */
  range?: number;
  /**
   * Closest it fires, in cells (artillery). Defaults to 0.
   */
  minRange?: number;
  /**
   * Seconds between volleys; defaults from battle.classDefaults.
   */
  fireInterval?: number;
  /**
   * Sight radius in cells; defaults from battle.classDefaults.
   */
  sight?: number;
  /**
   * Per Unit Class id, how this attacker rolls against it: advantage rolls the to-hit and damage twice and keeps the higher, disadvantage keeps the lower, none can't target it.
   */
  tiers?: {
    [k: string]: "advantage" | "normal" | "disadvantage" | "none";
  };
}
/**
 * Sits in a Building Slot. `trains` makes it a production building with its own unit queue; `combat` makes it armed.
 */
export interface Building {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  faction: string;
  cost: ResourceMap2;
  /**
   * Seconds to build.
   */
  buildTime: number;
  upkeep: ResourceMap3;
  yield: ResourceMap4;
  commandPointBonus: number;
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  trains?: string[];
  /**
   * Can be built on a build pad in Battle, lasting only that Battle. Needs a combat block.
   */
  padTurret?: boolean;
  combat?: Combat;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap3 {
  [k: string]: number;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap4 {
  [k: string]: number;
}
/**
 * A combat category that attackers are more or less effective against.
 */
export interface UnitClass {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * Flies: ignores cover and high ground both ways, and shares a cell with one ground unit.
   */
  air?: boolean;
}
/**
 * A kind of damage, with a multiplier for each layer it hits.
 */
export interface WeaponType {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  shield: number;
  armor: number;
  hp: number;
}
/**
 * A template of Planet values that a map's Planets are based on.
 */
export interface PlanetType {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  income: ResourceMap5;
  buildingSlots: number;
  commandPointBonus: number;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  sprite?: string;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap5 {
  [k: string]: number;
}
/**
 * A galaxy map. Planet ids are local to it.
 */
export interface GalaxyMap {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * @minItems 1
   */
  planets: [MapPlanet, ...MapPlanet[]];
  lanes: Lane[];
  /**
   * Neutral starting forces by Planet id. On a start Planet it applies only when that start is unused.
   */
  garrisons?: {
    [k: string]: Stacks;
  };
  /**
   * Planet ids. Its length is the most players the map takes; a used start is its player's Capital.
   *
   * @minItems 1
   *
   * Items: An id local to one definition, such as a map's Planet ids. No namespace.
   */
  starts: [string, ...string[]];
  minPlayers: number;
  win: Win;
}
export interface MapPlanet {
  /**
   * An id local to one definition, such as a map's Planet ids. No namespace.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  type: string;
  position: Position;
  /**
   * How the client draws it: a planet (the default), or a Halo ring.
   */
  model?: "planet" | "ring";
  battlefield?: PlanetBattlefield;
  overrides?: PlanetOverrides;
}
export interface Position {
  x: number;
  y: number;
}
/**
 * Overrides the Ruleset's Battlefield size and Terrain Preset for this Planet.
 */
export interface PlanetBattlefield {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  terrainPreset?: string;
  width?: number;
  height?: number;
}
/**
 * Values that replace this Planet's Planet Type values.
 */
export interface PlanetOverrides {
  income?: ResourceMap2;
  buildingSlots?: number;
  commandPointBonus?: number;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  sprite?: string;
}
export interface Lane {
  /**
   * An id local to one definition, such as a map's Planet ids. No namespace.
   */
  from: string;
  /**
   * An id local to one definition, such as a map's Planet ids. No namespace.
   */
  to: string;
  /**
   * A Lane type from the Ruleset.
   */
  type: string;
  /**
   * Defaults to the straight-line distance. One unit is 1 s at multiplier 1.
   */
  length?: number;
  /**
   * Seconds; overrides length × the Lane type's multiplier.
   */
  time?: number;
}
export interface Win {
  /**
   * Share of Planets to hold; must be over 0.5.
   */
  planetShare: number;
  holdSeconds: number;
}
/**
 * A kind of ground on a Battlefield cell.
 */
export interface Terrain {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * Placeholder colour the client draws it in.
   */
  colour: string;
  /**
   * Added to the To-hit roll of attacks against a ground unit standing here; negative is cover.
   */
  cover: number;
  /**
   * Per Unit Class id, the cost of entering a cell of this Terrain. A Unit Class missing here can't enter it.
   */
  movement: {
    [k: string]: number;
  };
}
/**
 * How a Battlefield is generated: two noise fields, elevation and moisture, each ranked so a threshold is a share of the map's cells.
 */
export interface TerrainPreset {
  $schema?: string;
  /**
   * Replace an existing definition with this id.
   */
  replace?: boolean;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  noise: Noise;
  /**
   * Elevation bands, lowest first. Each covers elevation up to `upTo`; the last must reach 1.
   *
   * @minItems 1
   */
  bands: [Band, ...Band[]];
  clear: Clear;
}
export interface Noise {
  /**
   * Noise cycles across the map's width in the first octave.
   */
  frequency: number;
  /**
   * Each doubles the frequency of the last.
   */
  octaves: number;
  /**
   * Each octave's amplitude relative to the last.
   */
  persistence: number;
}
export interface Band {
  upTo: number;
  /**
   * Height level: high ground and extra Sight.
   */
  height: number;
  /**
   * Terrains by moisture, driest first. Each covers moisture up to `upTo`; the last must reach 1.
   *
   * @minItems 1
   */
  terrains: [BandTerrain, ...BandTerrain[]];
}
export interface BandTerrain {
  upTo: number;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  terrain: string;
}
/**
 * What the generator turns blocked cells into when it cuts a path to connect the map.
 */
export interface Clear {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  terrain: string;
  height: number;
}
