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
 * [x, y]: shares of the map's width and height, 0 to 1.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Point = [number, number];
/**
 * [x, y]: shares of the map's width and height, 0 to 1.
 *
 * @minItems 2
 * @maxItems 2
 */
export type Point1 = [number, number];
/**
 * Build pads.
 */
export type Points = Point1[];
/**
 * Building sites, after the base fixture's own.
 */
export type Points1 = Point1[];
/**
 * Slots each taking a feature fixture, picked by weight.
 */
export type Points2 = Point1[];

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
  fixtures: {
    [k: string]: Fixture;
  };
  layouts: {
    [k: string]: Layout;
  };
  techs: {
    [k: string]: Tech;
  };
  soundtracks: {
    [k: string]: Soundtrack;
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
  /**
   * Where it's listed, lowest first; a tie goes by id.
   */
  order?: number;
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
   * Travel-time multiplier for a hop between two Planets both held by the Army's owner or a Teammate, judged as it sets off.
   */
  ownLaneTime: number;
  /**
   * Travel-time multiplier per Lane type.
   */
  laneTypes: {
    [k: string]: number;
  };
  startingResources: ResourceMap;
  stockpileCaps: ResourceMap1;
  sprawl: Sprawl;
  /**
   * The Exchange's rates. A trade gives a whole multiple of giveAmount and gets getAmount for each; a pair not listed can't be traded.
   */
  exchange: ExchangeRate[];
  /**
   * The defence scores where a Planet's threat becomes Medium, High and Very high, in increasing order. A unit or armed building scores (Shield + Armor + HP) times its Damage roll's average, times its count.
   *
   * @minItems 3
   * @maxItems 3
   */
  threatBands: [number, number, number];
  /**
   * How long a disconnected player keeps their Seat.
   */
  gracePeriodSeconds: number;
  /**
   * How long a player keeps seeing a Planet after their Army there leaves or is destroyed.
   */
  armyVisionSeconds: number;
  /**
   * How long an offer of a Truce stays open before it lapses.
   */
  truceOfferSeconds: number;
  /**
   * How long after a declined or lapsed offer before the same player can offer the other a Truce again.
   */
  truceRetrySeconds: number;
  /**
   * How long a Match stays in results.
   */
  resultsSeconds: number;
  /**
   * The levels a Bot can play at, in the order the lobby offers them.
   *
   * @minItems 1
   */
  botDifficulties: [BotDifficulty, ...BotDifficulty[]];
  /**
   * Per Rarity: what moving a held Tech to another Lab costs, paid on sending and never refunded.
   */
  techTransferCost: {
    [k: string]: ResourceMap2;
  };
  tech: TechRules;
  battlefield: BattlefieldRules;
  battle: BattleRules;
}
/**
 * Defaults the lobby fills in. Each must fit under its Stockpile cap.
 */
export interface ResourceMap {
  [k: string]: number;
}
/**
 * The most of each Resource a player holds before storage buildings: anything over it is lost at Payday. Every Resource needs one.
 */
export interface ResourceMap1 {
  [k: string]: number;
}
/**
 * Each Planet a player owns beyond freePlanets adds percent to the cost of everything they queue, rounded to the nearest whole amount.
 */
export interface Sprawl {
  freePlanets: number;
  percent: number;
}
export interface ExchangeRate {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  give: string;
  giveAmount: number;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  get: string;
  getAmount: number;
}
/**
 * One level a Bot can play at. See docs/specs/bot-spec.md#difficulties.
 */
export interface BotDifficulty {
  /**
   * Local to the Ruleset, e.g. easy.
   */
  id: string;
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * How often it decides.
   */
  thinkSeconds: number;
  /**
   * The random ± spread on its goal scores.
   */
  noisePercent: number;
  /**
   * How many times a target's estimated strength its Army needs before it attacks.
   */
  attackMargin: number;
  /**
   * How many steps its plans look ahead.
   */
  planDepth: number;
  /**
   * How much of each Stockpile cap it keeps back.
   */
  reservePercent: number;
  /**
   * It Retreats from a Battle when its strength falls below this share of the enemy's; 0 never Retreats.
   */
  retreatBelowPercent: number;
  /**
   * fixed: a set mix; advantage: by Advantage against the enemies seen.
   */
  unitChoice: "fixed" | "advantage";
  /**
   * first: the first card; goals: by its goals.
   */
  research: "first" | "goals";
  weights?: BotGoalWeights;
}
/**
 * Its goal weights, times its Faction's.
 */
export interface BotGoalWeights {
  /**
   * Defaults to 1.
   */
  expand?: number;
  /**
   * Defaults to 1.
   */
  attack?: number;
  /**
   * Defaults to 1.
   */
  defend?: number;
  /**
   * Defaults to 1.
   */
  economy?: number;
  /**
   * Defaults to 1.
   */
  army?: number;
  /**
   * Defaults to 1.
   */
  research?: number;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap2 {
  [k: string]: number;
}
/**
 * Research and Labs; see docs/specs/tech-spec.md.
 */
export interface TechRules {
  /**
   * The Research fields, by id. Each has its own Research rate, one Project and its own hand.
   */
  fields: {
    [k: string]: ResearchField;
  };
  /**
   * Research per second a player's Capital makes, in every field.
   */
  capitalResearch: number;
  /**
   * Added to a Project's cost for each Tech the player holds.
   */
  costScalingPercent: number;
  /**
   * What a lost Tech costs to research again.
   */
  recoveryPercent: number;
  labsPerPlanet: number;
  /**
   * Cards drawn for a hand, besides guaranteed ones.
   */
  handSize: number;
  /**
   * Per Rarity: the field's Research rate it's offered from, and its draw weight.
   */
  rarities: {
    [k: string]: RarityRule;
  };
}
export interface ResearchField {
  /**
   * Inline English display name.
   */
  name: string;
  /**
   * What the client tints it with.
   */
  colour: string;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
  /**
   * Where it's listed, lowest first; a tie goes by id.
   */
  order?: number;
  /**
   * The Bot goal its Research serves; left out, the higher of the two.
   */
  botGoal?: "army" | "economy";
}
export interface RarityRule {
  /**
   * The Research rate it's offered from.
   */
  from: number;
  /**
   * Its draw weight.
   */
  weight: number;
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
  /**
   * Depth in cells of the strip along each edge an attacker can deploy in.
   */
  deployDepth: number;
  /**
   * Radius in cells of the clear ground the generator makes round each Control Point. Defaults to 3.
   */
  pointArea?: number;
}
/**
 * How a Battle runs on its Battlefield.
 */
export interface BattleRules {
  /**
   * Sim steps a second. The Match ticks 5 times a second, so it runs this many steps per Match tick, rounded down: use a multiple of 5.
   */
  ticksPerSecond: number;
  /**
   * Seconds from an Army's arrival to the first sim tick: both sides are deployed and the Planet Locked, so players can open the Battle.
   */
  startDelay: number;
  /**
   * How far, in cells, a build pad sees for the side holding it.
   */
  padSight: number;
  /**
   * Seconds after a pad turret is destroyed before its pad can be built on again.
   */
  padCooldown: number;
  /**
   * How far, in cells, from the Command Post or one of its buildings a Planet's owner can place a Stack's start in its defence layout.
   */
  startReach: number;
  /**
   * Seconds a turret takes to build on a build pad.
   */
  padBuildSeconds: number;
  neutralFunds: ResourceMap3;
  /**
   * Seconds of fighting, after startDelay, until the defender wins.
   */
  timeCap: number;
  /**
   * Seconds of fighting a Raid has to destroy the Planet's buildings; then the raiders go home.
   */
  raidTime: number;
  /**
   * The most Command Points a raiding Stack can hold.
   */
  raidCap: number;
  /**
   * Seconds a Dropship waits in orbit over a Battle before the AI sends it to a Landing Zone; a commanding player can send it sooner.
   */
  landingDelay: number;
  /**
   * The unit roles that can Raid: a Stack raids only if every unit has one.
   */
  raidRoles: ("scout" | "skirmisher" | "infiltration" | "shock")[];
  /**
   * How near, in cells, a ground Squad must be to a Landing Zone to hold or take it.
   */
  captureRadius: number;
  /**
   * How long one side alone must be in range to take a Landing Zone.
   */
  captureSeconds: number;
  /**
   * Added to the To-hit roll of a ground attack from a higher height level.
   */
  highGroundToHit: number;
  /**
   * Seconds from ordering a Retreat until the side turns and heads off the field; it fights on meanwhile, and can call it off.
   */
  retreatCountdown: number;
  /**
   * Extra range and Sight, in cells, per height level a ground unit stands above a ground target.
   */
  heightReach: number;
  /**
   * The most height levels that count for heightReach.
   */
  heightLevels: number;
  /**
   * A line of sight between two ground cells is blocked when the Terrain on the cells between them obscures more than this in all (see Terrain obscures), or one of them is higher than both ends.
   */
  sightObscured: number;
  structure: Structure;
  commandPost: CommandPost;
  /**
   * Battle stats per Unit Class id, for any a unit or building doesn't set. Every Unit Class needs one.
   */
  classDefaults: {
    [k: string]: ClassStats;
  };
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap3 {
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
 * The defender's objective structure, on every Battlefield: destroying it wins the Battle for the attacker. It never fires.
 */
export interface CommandPost {
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
  /**
   * Not offered in the lobby, to players or Bots: a Faction that only supplies content, such as neutral garrisons' units.
   */
  hidden?: boolean;
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
  /**
   * How much more strength than the threat it has seen it gathers before a Task Force goes in. Defaults to 1.
   */
  mass?: number;
  bot?: BotWeights;
}
/**
 * How the Faction's Bots play the galaxy map: each weight scales one goal, times its difficulty's; 1 is neutral. See docs/specs/bot-spec.md.
 */
export interface BotWeights {
  /**
   * Defaults to 1.
   */
  expand?: number;
  /**
   * Defaults to 1.
   */
  attack?: number;
  /**
   * Defaults to 1.
   */
  defend?: number;
  /**
   * Defaults to 1.
   */
  economy?: number;
  /**
   * Defaults to 1.
   */
  army?: number;
  /**
   * Defaults to 1.
   */
  research?: number;
  /**
   * Its Bots' names, taken in order; a Bot past the end is named by its Seat.
   *
   * Items: Inline English display name.
   */
  names?: string[];
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
  variantOf?: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  faction: string;
  /**
   * A sentence or two on what it's for, shown in its info popover.
   */
  description?: string;
  /**
   * A Battle balance tag: units of one peer group (e.g. basic infantry: the Marine, Grunt, Promethean Soldier and Aggressor Sentinel) are each other's equals across Factions, and should fight each other to about even. The duel matrix checks only units with one.
   */
  peerGroup?: string;
  /**
   * A sentence or two on how to use it, shown in its info popover under the description.
   */
  tactics?: string;
  cost: ResourceMap2;
  upkeep?: ResourceMap4;
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
   * False keeps it off every building's trains, and its variants with it: a garrison or Starting Kit unit. Defaults to true.
   */
  trainable?: boolean;
  /**
   * Hints for the Battle AI: which roles it picks this unit for first. A scout roams to look and falls back from the enemy; a skirmisher patrols between points and hunts what it's good against. A scout, infiltration or shock unit can Raid. Only an aa unit can fire on a Dropship.
   */
  roles?: ("scout" | "skirmisher" | "infiltration" | "shock" | "aa")[];
  /**
   * A Dropship: the Command Points of units it lands in a Battle already under way, once a Battle. It never fires.
   */
  carry?: number;
  combat: Combat;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  model?: string;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap4 {
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
   * Closest it fires, in cells (artillery: a long range and a minRange). Defaults to 0.
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
   * Per Unit Class id, how this attacker rolls against it (see tier). A class left out takes this attacker's Unit Class default (its tiers), else normal.
   */
  tiers?: {
    /**
     * How an attacker rolls against a Unit Class: counter rolls the to-hit with advantage and the damage dice twice, added; advantage rolls the to-hit and damage twice and keeps the higher, disadvantage keeps the lower, none can't target it.
     */
    [k: string]: "counter" | "advantage" | "normal" | "disadvantage" | "none";
  };
}
/**
 * Sits in a Building Slot. `trains` makes it a production building with its own unit queue; `combat` makes it armed; `techSlots` makes it a Lab.
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
   * A sentence or two on what it's for, shown in its info popover.
   */
  description?: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  faction: string;
  cost: ResourceMap2;
  /**
   * Seconds to build.
   */
  buildTime: number;
  upkeep: ResourceMap5;
  yield: ResourceMap6;
  extracts?: ResourceMap7;
  refines?: Refining;
  storage?: ResourceMap8;
  /**
   * Makes it a Lab, holding this many Techs.
   */
  techSlots?: number;
  research?: ResearchMap;
  commandPointBonus: number;
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  trains?: string[];
  /**
   * An aa building can fire on a Dropship.
   */
  roles?: "aa"[];
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
export interface ResourceMap5 {
  [k: string]: number;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap6 {
  [k: string]: number;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap7 {
  [k: string]: number;
}
/**
 * Converts input into output at each Payday, after Upkeep. Short of input, it converts what there is at the same rate.
 */
export interface Refining {
  input: ResourceMap2;
  output: ResourceMap2;
}
/**
 * Amounts keyed by Resource id.
 */
export interface ResourceMap8 {
  [k: string]: number;
}
/**
 * Research it makes per second in each Research field named, the same on every Planet.
 */
export interface ResearchMap {
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
  /**
   * The most members one squad of this class has in a Battle: a Unit Slot with more fights as several squads. Defaults to no limit, one squad per Unit Slot.
   */
  squadSize?: number;
  /**
   * Default tiers for attackers of this class, per Unit Class id: an attacker's own tiers override them (see combat.tiers).
   */
  tiers?: {
    /**
     * How an attacker rolls against a Unit Class: counter rolls the to-hit with advantage and the damage dice twice, added; advantage rolls the to-hit and damage twice and keeps the higher, disadvantage keeps the lower, none can't target it.
     */
    [k: string]: "counter" | "advantage" | "normal" | "disadvantage" | "none";
  };
  /**
   * Its part in a Battle AI Task Force: lead (goes in first, ahead of the rest), follow (keeps behind the leaders) or hunt (goes for enemies it fights at a better tier than the rest of the force). Defaults to follow.
   */
  taskForceRole?: "lead" | "follow" | "hunt";
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
  income: ResourceMap9;
  richness?: Richness;
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
export interface ResourceMap9 {
  [k: string]: number;
}
/**
 * Per Resource id, how much a Planet's extractor buildings draw from it: none ×0, poor ×0.5, normal ×1, rich ×1.5. A Resource left out is none.
 */
export interface Richness {
  [k: string]: "none" | "poor" | "normal" | "rich";
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
   * How the client draws it: planet (the default) picks a style by the Planet's id; ring is a Halo ring; the rest name a style.
   */
  model?: "planet" | "ring" | "gasGiant" | "ringedGiant" | "terrestrial" | "barren" | "ice" | "lava" | "desert";
  battlefield?: PlanetBattlefield;
  overrides?: PlanetOverrides;
}
export interface Position {
  x: number;
  y: number;
}
/**
 * Overrides the Ruleset's Battlefield size, Terrain Preset and Archetype for this Planet.
 */
export interface PlanetBattlefield {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  terrainPreset?: string;
  /**
   * Forces this Planet's Battlefield Archetype, over its preset's weights.
   */
  archetype?: "open" | "river" | "ridge" | "ruins";
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  layout?: string;
  width?: number;
  height?: number;
}
/**
 * Values that replace this Planet's Planet Type values.
 */
export interface PlanetOverrides {
  income?: ResourceMap2;
  richness?: Richness;
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
   * How much a cell of it obscures a line of sight across it, against the Ruleset's sightObscured. Defaults to 0.
   */
  obscures?: number;
  /**
   * Per Unit Class id, the cost of entering a cell of this Terrain. A Unit Class missing here can't enter it. An air Unit Class ignores this: every cell costs it 1.
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
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  pointCover?: string;
  archetypes?: ArchetypeWeights;
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
 * How often each Battlefield Archetype is picked for a Planet with this preset. Left out: an open field only.
 */
export interface ArchetypeWeights {
  open?: number;
  river?: number;
  ridge?: number;
  ruins?: number;
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
/**
 * A hand-made piece of Battlefield, drawn as ASCII art, that generation stamps in. A base holds the defender's Command Post, building sites and unit starts; a feature is a landmark placed in open space.
 */
export interface Fixture {
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
   * base: the defender's, holding its Command Post; feature: a landmark.
   */
  kind: "base" | "feature";
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  faction?: string;
  /**
   * The Battlefield Archetypes it can appear in; left out, any.
   */
  archetypes?: ("open" | "river" | "ridge" | "ruins")[];
  /**
   * How often it's picked among those that fit, against the others' weights. Defaults to 1.
   */
  weight?: number;
  /**
   * Whether generation may turn it a quarter, half or three quarters.
   */
  rotate?: boolean;
  /**
   * Whether generation may flip it.
   */
  mirror?: boolean;
  /**
   * What each character in map is. A character that's in neither key nor markers leaves the Battlefield as it is; a marker's cell is made clear.
   */
  key: {
    [k: string]: FixtureCell;
  };
  /**
   * Characters that place something, on an open cell: commandPost (a base's one), site (a building site), unitStart (where a defending Stack deploys, in order), pad (a build pad), cover (the preset's point cover).
   */
  markers?: {
    [k: string]: "commandPost" | "site" | "unitStart" | "pad" | "cover";
  };
  /**
   * Its cells, row by row, top first; every row the same length.
   *
   * @minItems 1
   */
  map: [string, ...string[]];
}
/**
 * Exactly one of terrain, clear (the preset's clear ground) or cover (its point cover), so a fixture suits any preset; height, if given, sets the height level.
 */
export interface FixtureCell {
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  terrain?: string;
  clear?: boolean;
  cover?: boolean;
  height?: number;
}
/**
 * A hand-drawn lane plan a Battlefield is remixed from: where the base, Landing Zones, lanes, pads, building sites and features go, and the water, rock, high ground and cover round them. Every point is a share of the map's width and height, drawn with the attacker's edge at the top (y 0) and the defender's at the bottom (y 1).
 */
export interface Layout {
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
   * What the Lab and editors call it.
   */
  name?: string;
  /**
   * The Battlefield Archetypes it suits; left out, any.
   */
  archetypes?: ("open" | "river" | "ridge" | "ruins")[];
  /**
   * The Terrain Presets it suits; left out, any.
   *
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  presets?: string[];
  /**
   * How often it's picked among those that suit, against the others' weights. Defaults to 1.
   */
  weight?: number;
  /**
   * Whether generation may flip it left to right.
   */
  mirror?: boolean;
  base: Point;
  /**
   * Its Landing Zones, A first.
   *
   * @minItems 1
   */
  landingZones: [LayoutLandingZone, ...LayoutLandingZone[]];
  /**
   * Routes units travel, each a line through its points; cleared where a ground Unit Class couldn't cross.
   */
  lanes: LayoutLane[];
  /**
   * Shapes of ground: water (the preset's lowest band), blocked (its top band: cliff or rock), high (the band at height) or cover (its point cover).
   */
  areas?: LayoutArea[];
  pads?: Points;
  sites?: Points1;
  features?: Points2;
}
export interface LayoutLandingZone {
  at: Point1;
  /**
   * An attacker can land at it, and holds it from the start.
   */
  attacker?: boolean;
}
export interface LayoutLane {
  /**
   * @minItems 2
   */
  points: [Point1, Point1, ...Point1[]];
  /**
   * In cells; 2 if left out.
   */
  width?: number;
}
export interface LayoutArea {
  kind: "water" | "blocked" | "high" | "cover";
  /**
   * A high area's height level; 1 if left out.
   */
  height?: number;
  /**
   * @minItems 3
   */
  points: [Point1, Point1, Point1, ...Point1[]];
}
/**
 * Researched by a player and held in a Lab: it unlocks units and buildings, and gives effects, while held. See docs/specs/tech-spec.md.
 */
export interface Tech {
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
  faction?: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  field: string;
  /**
   * How likely a Tech is to be offered; rarer ones only above a Research rate.
   */
  rarity: "common" | "uncommon" | "rare" | "legendary";
  /**
   * Research, before the Ruleset's scaling.
   */
  cost: number;
  requires?: TechRequirements;
  unlocks?: TechUnlocks;
  effects?: Effect[];
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  icon?: string;
}
/**
 * Offered only once the player holds every Tech and owns every building listed.
 */
export interface TechRequirements {
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  techs?: string[];
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  buildings?: string[];
}
/**
 * Anything listed here, by any Tech, can be queued only while a Tech unlocking it is held.
 */
export interface TechUnlocks {
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  units?: string[];
  /**
   * Items: A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  buildings?: string[];
}
/**
 * A Tech's modifier, by exactly one of `percent` or `amount`. `unitClass` or `unit` narrows a combat stat or buildTime; `resource` narrows extractorYield, upkeep or stockpileCap; `field` narrows research.
 */
export interface Effect {
  stat:
    | "shield"
    | "armor"
    | "hp"
    | "damage"
    | "extractorYield"
    | "upkeep"
    | "stockpileCap"
    | "buildTime"
    | "sprawlFreePlanets"
    | "commandPoints"
    | "techSlots"
    | "research";
  percent?: number;
  amount?: number;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  unitClass?: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  unit?: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  resource?: string;
  /**
   * A content id, `mod:id`. Without a prefix it resolves to the Mod that writes it. ASCII only, so Go and JS sort ids the same way.
   */
  field?: string;
}
/**
 * An album of music a Mod brings, played in order during a Match, with its artist credited.
 */
export interface Soundtrack {
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
   * Who made it, credited in the player.
   */
  artist: string;
  /**
   * Where the album can be found, linked from the player.
   */
  url?: string;
  /**
   * In play order.
   *
   * @minItems 1
   */
  tracks: [Track, ...Track[]];
}
export interface Track {
  title: string;
  /**
   * An asset in a Mod's assets/ folder, written `__mod__/path`.
   */
  file: string;
}
