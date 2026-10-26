// Generated from schema/content by mise run gen. Do not edit.

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
