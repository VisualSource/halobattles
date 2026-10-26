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
};

export type UnitSlot = { unit: string; count: number };

/**
 * A building under construction. Only the first in a queue runs: it has
 * endsAt, or paused when it can't run (debt or Locked). Later items wait.
 */
export type QueueItem = {
  id: number;
  slot: number; // the Building Slot it will fill
  building: string;
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
};

/** The public part of every player. */
export type PlayerView = {
  seat: number;
  user: string;
  displayName: string;
  faction: string;
  planetCount: number;
};

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
  economy: Economy;
};

/** What changed since the last View: whole entities, plus removed ids. */
export type ViewDelta = {
  matchTime: number;
  players: PlayerView[]; // changed players only
  planets: PlanetView[];
  removedPlanets: string[];
  economy: Economy | null; // null when unchanged
};

export function applyDelta(view: View, d: ViewDelta): View {
  const players = [...view.players];
  for (const p of d.players) players[p.seat] = p;
  const planets = new Map(view.planets);
  for (const p of d.planets) planets.set(p.id, p);
  for (const id of d.removedPlanets) planets.delete(id);
  return {
    ...view,
    matchTime: d.matchTime,
    players,
    planets,
    economy: d.economy ?? view.economy,
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
