import { createStore } from "zustand/vanilla";
import type { LocalState } from "./local";

// Plain Match state. Only MatchConnection writes it; nothing outside the
// connection imports FlatBuffers types.

export type Phase = "lobby" | "play" | "results";

export type Seat = {
  user: string;
  displayName: string;
  faction: string;
  ready: boolean;
  bot: string; // a Bot's difficulty id; "" for a player
  team: number; // 1–4 with Teams on; 0 with them off
};

export type Lobby = {
  phase: Phase;
  host: string;
  map: string;
  startingResources: Map<string, number>;
  seats: Seat[]; // longest held first
  spectators: { user: string; displayName: string }[];
  teams: boolean; // each Seat picks a Team; off is a free-for-all
  winner: number | null; // in results: a Team (a Seat with Teams off), or null for none
  endReason: string; // in results: "hold", "last-standing", ...
};

/** One unit type in a Stack, in its cell of the Stack's grid. */
export type UnitSlot = { unit: string; count: number; cell: number };

/**
 * A building under construction or a unit in training. Only the first in a
 * queue runs: it has endsAt, or paused when it can't run (debt or Locked).
 * Later items wait. A trained unit with no room stays first, past its end.
 */
export type QueueItem = {
  id: number;
  slot: number; // the Building Slot it fills, or trains at
  building: string; // a construction item
  unit: string; // a unit item
  started: boolean;
  paused: boolean;
  endsAt: number; // Match Time; 0 unless running
  remaining: number; // ms left, when not running
};

/** A Planet in vision. Planets outside vision aren't in the View. */
export type PlanetView = {
  id: string;
  owner: number | null; // a Seat index; null is neutral
  capital: boolean;
  locked: boolean;
  buildings: string[]; // one per Building Slot; "" is empty
  stacks: UnitSlot[][]; // the three Stacks
  queue: QueueItem[]; // construction, in order; only on your own Planets
  unitQueue: QueueItem[]; // every unit queue, by slot then order; own only
  rallyStack: number; // where trained units go; own only
  rallyPoint: string; // the Planet trained units leave for, "" for none; own only
  richness: Map<string, string>; // per Resource; a Resource left out is none
  labs: Map<number, string[]>; // the Techs each Lab holds, by Building Slot
};

/**
 * An Army in vision: on a Lane hop from `from` to `to`, or waiting in orbit
 * at `to`. Other players' never show where they're headed.
 */
export type Army = {
  id: number;
  owner: number;
  units: UnitSlot[];
  from: string;
  to: string;
  departed: number; // Match Time
  arrives: number; // Match Time
  waiting: boolean;
  destination: string; // own only
  toStack: number; // own only
  path: string[]; // own only: the Planets after `to`, in order
  raid: boolean; // own only: nobody else sees a Raid at all
  tech: string; // a Courier's, which has no units; "" for any other Army
  homePlanet: string; // own only, a Courier's: the Lab it left, "" once that's lost
  homeSlot: number;
  destPlanet: string; // own only, a Courier's: the Lab it's going to
  destSlot: number;
  turned: boolean; // own only, a Courier's: `to` is the captured Planet it just leaves
};

export type Side = "attacker" | "defender";

/** A Unit Slot or building in a Battle, as your side sees it. */
export type Squad = {
  id: number;
  side: Side;
  unit: string; // a unit or building id
  building: boolean;
  x: number;
  y: number;
  count: number; // members left
  start: number; // members at the start
  shield: number; // the front member's layers: it takes the hits
  armor: number;
  hp: number;
  commandPost: boolean; // the defender's Command Post: destroying it wins the Battle
  // Your own squads' orders: where it's going, and the enemy it was told to
  // attack, or 0.
  goal: { x: number; y: number } | null;
  target: number;
  dropship: boolean; // a Dropship in flight: it can't be fired on
};

/** One of your side's Dropships over a Battle. */
export type Drop = {
  side?: Side; // the Lab's, which lists both sides'
  unit: string; // the Dropship's
  units: number; // the troops it carries
  state: "orbit" | "flying" | "done"; // done: it has landed them, once a Battle
  point: number | null; // the Landing Zone it's going to, or went to
  aiAt: number; // in orbit: the tick the AI sends it, if nobody has
};

/** An order to squads in a Battle you command. */
export type SquadOrder = {
  kind: "move" | "attack" | "attackMove" | "hold";
  cell?: { x: number; y: number }; // move and attackMove
  target?: number; // attack: the enemy squad
};

export type ControlPoint = {
  x: number;
  y: number;
  owner: Side | null; // a Landing Zone; null is nobody's
  taker: Side | null; // taking it while progress > 0
  progress: number; // sim ticks the taker has held it alone
};

/** A build pad: whoever holds it can build a turret on it. */
export type BuildPad = {
  x: number;
  y: number;
  owner: Side | null; // null is nobody
  taker: Side | null;
  progress: number; // sim ticks the taker has held it alone
  turret: number; // the turret squad on it, or 0
  building: string; // a turret under construction, or ""
  readyAt: number; // the tick it's built
  coolsAt: number; // its turret destroyed: the tick it can be built on again
};

/** A Battle's grid, row by row; it never changes. */
export type Battlefield = {
  width: number;
  height: number;
  terrains: string[]; // Terrain ids; a cell holds an index into this
  terrain: number[];
  heights: number[];
};

export type Cell = { x: number; y: number };

/** Your Planet's defence layout: the Battlefield you'd defend it on, and where your buildings and Stacks start. */
export type DefenceLayout = {
  planet: string;
  field: Battlefield;
  commandPost: Cell;
  sites: Cell[]; // the base's building sites
  points: Cell[]; // Landing Zones
  landings: Cell[]; // the ones an attacker may land at
  pads: Cell[];
  reach: number; // a Stack starts this near the Command Post or a building
  buildingSites: (number | null)[]; // per Building Slot: its site; null by the Command Post, or empty
  stackStarts: Cell[];
  setSites: (number | null)[]; // the layout as set, per Building Slot; null is its default
  setStarts: Map<number, Cell>;
};

/** One squad's fire in one sim tick, added up. */
export type Volley = {
  actor: number; // 0: a shooter your side can't see
  target: number;
  shots: number;
  hits: number;
  kills: number;
  shieldDmg: number;
  armorDmg: number;
  hpDmg: number;
};

/** Sim ticks per second. */
export const BATTLE_TICKS = 5;

/** A Battle you're a side of, as your side sees it. */
export type Battle = {
  id: number;
  planet: string;
  attacker: number;
  defender: number | null; // null is neutral
  started: number; // Match Time of the first fighting tick
  tick: number; // 0 in a summary
  edge: number; // the attacker's edge: 0 top, 1 right, 2 bottom, 3 left
  field: Battlefield | null; // null until it arrives
  squads: Squad[]; // your own, and enemies in Sight
  points: ControlPoint[];
  pads: BuildPad[];
  retreatAt: number; // the tick your side's Retreat countdown ends; 0 is none
  retreating: Record<Side, boolean>; // public: you see a side turn and run
  raid: boolean; // the attacker is after the buildings, within raidTime
  buildingsLeft: number; // public: the Planet's buildings standing, a Raid's score
  buildings: number; // and at the start
  commanded: boolean; // your side is yours to command: no AI runs it
  drops: Drop[]; // your side's Dropships
  /**
   * A Battle you don't have open: squads are what the report needs (every
   * one your side has seen, the dead too, with no cell or layers); no pads,
   * Landing Zones or tick.
   */
  summary: boolean;
  damage: { attacker: number; defender: number }; // dealt by each side, in the fire your side could see
};

/** The public part of every player. */
export type PlayerView = {
  seat: number;
  user: string;
  displayName: string;
  faction: string;
  planetCount: number;
  eliminated: boolean;
  connected: boolean;
  graceEnds: number; // Match Time a disconnected player forfeits at
  bot: string; // a Bot's difficulty id; "" for a player
  stats: PlayerStats | null; // only in a Spectator's View
  team: number; // with Teams on, Team 1 is 0; with them off, the Seat
  truces: number[]; // the Seats this player has a Truce with that you may see (#81)
  // Between this player and you, as Match Times (0 for none): their offer of
  // a Truce to you, yours to them, and when you may offer them again.
  offerFrom: number;
  offerTo: number;
  retryAt: number;
};

/** Whether two Seats are on one Team: you and your Teammates. Neutral is no one's ally. */
export const allied = (view: View, a: number | null, b: number | null) =>
  a !== null &&
  b !== null &&
  a >= 0 &&
  b >= 0 &&
  (view.players[a]?.team ?? a) === (view.players[b]?.team ?? b);

/** A Planet's owner as the player knows it: live, else as last seen, else neutral. */
export function knownOwner(
  view: View,
  lastSeen: LocalState["lastSeen"],
  id: string,
) {
  const live = view.planets.get(id);
  return live ? live.owner : (lastSeen.get(id)?.planet.owner ?? null);
}

/** A Planet's owner as Route sees it: a Teammate's counts as your own, as on the server. */
export function routeOwner(
  view: View,
  lastSeen: LocalState["lastSeen"],
  id: string,
) {
  const owner = knownOwner(view, lastSeen, id);
  return allied(view, owner, view.you) ? view.you : owner;
}

/** Whether a Planet in view is a Teammate's: passed through, never stopped at. */
export const allyPlanet = (view: View | null, id: string) => {
  const owner = view?.planets.get(id)?.owner ?? null;
  return !!view && owner !== view.you && allied(view, owner, view.you);
};

/** A Team's name, as the lobby numbers them: Team 1 is 0. */
export const teamName = (team: number) => `Team ${team + 1}`;

/**
 * Who holds or won, as a Team (a Seat with Teams off): "You" or "Your Team",
 * else the Team's or the player's name.
 */
export function winnerName(view: View | null, teams: boolean, team: number) {
  if (teams)
    return view && view.you >= 0 && view.players[view.you]?.team === team
      ? "Your Team"
      : teamName(team);
  return team === view?.you
    ? "You"
    : view?.players[team]?.displayName || `Player ${team + 1}`;
}

/** A player's economy at a glance, as a Spectator sees it. */
export type PlayerStats = {
  resources: Map<string, number>;
  income: Map<string, number>; // per Payday
  commandPointsUsed: number;
  commandPointsCap: number;
};

/** The running win-hold countdown, public to everyone. seat is a Team (a Seat with Teams off). */
export type WinHold = { seat: number | null; ends: number };

/** Your own economy; nobody else's is ever sent. */
export type Economy = {
  resources: Map<string, number>; // can be below zero: debt
  commandPointsUsed: number;
  commandPointsCap: number;
  paydayStart: number; // Match Time of the last Payday, or Start
  paydayEnd: number; // Match Time of the next Payday
  caps: Map<string, number>; // Stockpile caps, storage included
  projected: Map<string, number>; // what the next Payday would change if it came now; before caps
};

/**
 * A running Project: `done` Research as of `since` (Match Time), growing at
 * `rate` per second (0 while paused) until it reaches `cost`.
 */
export type Project = {
  tech: string;
  planet: string;
  slot: number; // its Lab's Building Slot
  cost: number;
  done: number;
  since: number;
  rate: number;
};

/** Your own research; nobody else's is ever sent. */
export type Research = {
  rates: Map<string, number>; // Research per second, by Research field
  projects: Project[]; // at most one per field
  hands: Map<string, string[]>; // Techs offered, by field; only an idle field has one
  // Guaranteed cards: stopped Projects, and lost Techs at their recovery cost.
  saved: { tech: string; cost: number; done: number; lost: boolean }[];
};

/** A Project's progress at Match Time `now`. */
export const projectDone = (p: Project, now: number) =>
  Math.min(p.cost, p.done + (p.rate * (now - p.since)) / 1000);

export type View = {
  matchTime: number; // ms since Start
  contentHash: string;
  ruleset: string;
  map: string;
  you: number; // your Seat; -1 for a lobby Spectator
  // Watching: a Spectator or an eliminated player. The whole map, no fog,
  // and no economy or research of your own.
  spectating: boolean;
  players: PlayerView[]; // by Seat
  planets: Map<string, PlanetView>;
  armies: Map<number, Army>;
  battles: Map<number, Battle>;
  economy: Economy;
  research: Research;
  winHold: WinHold;
};

/** What changed since the last View: whole entities, plus removed ids. */
export type ViewDelta = {
  matchTime: number;
  players: PlayerView[]; // changed players only
  planets: PlanetView[];
  removedPlanets: string[];
  armies: Army[];
  removedArmies: number[];
  battles: Battle[];
  removedBattles: number[];
  economy: Economy | null; // null when unchanged
  research: Research | null; // null when unchanged
  winHold: WinHold | null; // null when unchanged
};

export function applyDelta(view: View, d: ViewDelta): View {
  const players = [...view.players];
  for (const p of d.players) players[p.seat] = p;
  const planets = new Map(view.planets);
  for (const p of d.planets) planets.set(p.id, p);
  for (const id of d.removedPlanets) planets.delete(id);
  const armies = new Map(view.armies);
  for (const a of d.armies) armies.set(a.id, a);
  for (const id of d.removedArmies) armies.delete(id);
  const battles = new Map(view.battles);
  for (const b of d.battles) battles.set(b.id, b);
  for (const id of d.removedBattles) battles.delete(id);
  return {
    ...view,
    matchTime: d.matchTime,
    players,
    planets,
    armies,
    battles,
    economy: d.economy ?? view.economy,
    research: d.research ?? view.research,
    winHold: d.winHold ?? view.winHold,
  };
}

export type MatchState = {
  lobby: Lobby | null;
  view: View | null;
  disconnected: boolean; // the socket dropped, e.g. the server restarted
};

export const createMatchStore = () =>
  createStore<MatchState>(() => ({
    lobby: null,
    view: null,
    disconnected: false,
  }));

/**
 * One of your Battles as this client saw it, kept after it ends for its
 * report. Squads holds every squad it ever saw, as last seen, so it gives
 * both how many started and how many are left. Damage counts only the fire
 * this client was told about.
 */
export type BattleReport = {
  id: number;
  planet: string;
  attacker: number;
  defender: number | null;
  squads: Map<number, Squad>;
  started: number; // Match Time of the first fighting tick
  damage: { attacker: number; defender: number }; // dealt by each side
  winner?: number | null; // set when it ends; null is neutral
  endedAt?: number; // Match Time
  raid?: { left: number; of: number }; // a Raid's buildings, as last seen
};

/** A report brought up to date with the Battle as the View has it now. */
export function reportView(
  r: BattleReport | undefined,
  b: Battle,
): BattleReport {
  const squads = new Map(r?.squads);
  for (const sq of b.squads) squads.set(sq.id, sq);
  return {
    id: b.id,
    planet: b.planet,
    attacker: b.attacker,
    defender: b.defender,
    ...r,
    squads,
    started: b.started,
    damage: b.damage, // the server's count: it sees the fire while the Battle isn't open
    raid: b.raid ? { left: b.buildingsLeft, of: b.buildings } : undefined,
  };
}

/** A report after a tick's volleys: kills off, for squads that die out of the next view. */
export function reportVolleys(
  r: BattleReport,
  volleys: Volley[],
): BattleReport {
  const squads = new Map(r.squads);
  for (const v of volleys) {
    const target = squads.get(v.target);
    if (!target) continue;
    squads.set(v.target, {
      ...target,
      count: Math.max(0, target.count - v.kills),
    });
  }
  return { ...r, squads };
}
