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

export type Combatant = {
  id: string;
  side: "attacker" | "defender";
  unit: string; // a unit or building id
  shield: number;
  armor: number;
  hp: number;
};

export type BattleAction = {
  actor: string;
  target: string;
  weapon: string;
  shieldDmg: number;
  armorDmg: number;
  hpDmg: number;
  killed: boolean;
};

/** A Battle you're a side of, as it stands after the Rounds completed. */
export type Battle = {
  id: number;
  planet: string;
  attacker: number;
  defender: number | null; // null is neutral
  started: number; // Match Time of Round 1
  roundMs: number;
  round: number; // Rounds completed
  roster: Combatant[];
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
