import { createStore } from "zustand/vanilla";

// Plain Match state. Only MatchConnection writes it; nothing outside the
// connection imports FlatBuffers types.

export type Phase = "lobby" | "play" | "results";

export type Seat = {
  user: string;
  displayName: string;
  faction: string;
  ready: boolean;
};

export type Lobby = {
  phase: Phase;
  host: string;
  map: string;
  startingResources: Map<string, number>;
  seats: Seat[]; // longest held first
  winner: number | null; // in results: a Seat, or null for none
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
};

export type ControlPoint = {
  x: number;
  y: number;
  owner: Side;
  taker: Side; // taking it while progress > 0
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
};

/** A Battle's grid, row by row; it never changes. */
export type Battlefield = {
  width: number;
  height: number;
  terrains: string[]; // Terrain ids; a cell holds an index into this
  terrain: number[];
  heights: number[];
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
  started: number; // Match Time of tick 0
  tick: number;
  edge: number; // the attacker's edge: 0 top, 1 right, 2 bottom, 3 left
  field: Battlefield | null; // null until it arrives
  squads: Squad[]; // your own, and enemies in Sight
  points: ControlPoint[];
  pads: BuildPad[];
  hold: number; // sim ticks the attacker has held enough points
  holdPaused: boolean; // a defender stands on one of them: the hold waits
  retreatAt: number; // the tick your side's Retreat countdown ends; 0 is none
  retreating: Record<Side, boolean>; // public: you see a side turn and run
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
};

/** The running win-hold countdown, public to everyone. */
export type WinHold = { seat: number | null; ends: number };

/** Your own economy; nobody else's is ever sent. */
export type Economy = {
  resources: Map<string, number>; // can be below zero: debt
  commandPointsUsed: number;
  commandPointsCap: number;
  paydayStart: number; // Match Time of the last Payday, or Start
  paydayEnd: number; // Match Time of the next Payday
};

export type View = {
  matchTime: number; // ms since Start
  contentHash: string;
  ruleset: string;
  map: string;
  you: number; // your Seat
  players: PlayerView[]; // by Seat
  planets: Map<string, PlanetView>;
  armies: Map<number, Army>;
  battles: Map<number, Battle>;
  economy: Economy;
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
  ticks: number; // sim ticks run so far
  damage: { attacker: number; defender: number }; // dealt by each side
  winner?: number | null; // set when it ends; null is neutral
  endedAt?: number; // Match Time
};

const other = (s: Side): Side => (s === "attacker" ? "defender" : "attacker");

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
    damage: { attacker: 0, defender: 0 },
    ...r,
    squads,
    ticks: Math.max(r?.ticks ?? 0, b.tick),
  };
}

/** A report after a tick's volleys: damage to the side firing, kills off. */
export function reportVolleys(
  r: BattleReport,
  tick: number,
  volleys: Volley[],
): BattleReport {
  const squads = new Map(r.squads);
  const damage = { ...r.damage };
  for (const v of volleys) {
    const target = squads.get(v.target);
    if (!target) continue;
    damage[other(target.side)] += v.shieldDmg + v.armorDmg + v.hpDmg;
    squads.set(v.target, {
      ...target,
      count: Math.max(0, target.count - v.kills),
    });
  }
  return { ...r, squads, damage, ticks: Math.max(r.ticks, tick) };
}
