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
   * Damage multiplier per tier name. A Unit Class missing from a combat block's tiers counts as `average`.
   */
  tiers: {
    [k: string]: number;
  };
  /**
   * Travel-time multiplier per Lane type.
   */
  laneTypes: {
    [k: string]: number;
  };
  /**
   * Sides on the Initiative die.
   */
  initiativeDie: number;
  /**
   * Duration of one Battle Round.
   */
  roundSeconds: number;
  /**
   * Most Rounds a Battle can run.
   */
  roundCap: number;
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
}
/**
 * Defaults the lobby fills in.
 */
export interface ResourceMap {
  [k: string]: number;
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
  startingKit: StartingKit;
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
  cost: ResourceMap1;
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
  combat: Combat;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap1 {
  [k: string]: number;
}
/**
 * Battle stats. A Unit Class missing from tiers counts as `average`.
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
  damage: number;
  initiative: number;
  /**
   * Effectiveness tier name (from the Ruleset) per Unit Class id.
   */
  tiers?: {
    [k: string]: string;
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
  cost: ResourceMap1;
  /**
   * Seconds to build.
   */
  buildTime: number;
  upkeep: ResourceMap2;
  yield: ResourceMap3;
  commandPointBonus: number;
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  trains?: string[];
  combat?: Combat;
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
 * Amounts keyed by Resource id.
 */
export interface ResourceMap3 {
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
  income: ResourceMap4;
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
export interface ResourceMap4 {
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
  overrides?: PlanetOverrides;
}
export interface Position {
  x: number;
  y: number;
}
/**
 * Values that replace this Planet's Planet Type values.
 */
export interface PlanetOverrides {
  income?: ResourceMap1;
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
