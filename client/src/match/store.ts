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

/** A Planet in vision. Planets outside vision aren't in the View. */
export type PlanetView = {
  id: string;
  owner: number | null; // a Seat index; null is neutral
  capital: boolean;
  locked: boolean;
  buildings: string[]; // one per Building Slot; "" is empty
  stacks: UnitSlot[][]; // the three Stacks
};

/** The public part of every player. */
export type PlayerView = {
  seat: number;
  user: string;
  displayName: string;
  faction: string;
  planetCount: number;
};

export type View = {
  matchTime: number; // ms since Start
  contentHash: string;
  ruleset: string;
  map: string;
  you: number; // your Seat
  players: PlayerView[]; // by Seat
  planets: Map<string, PlanetView>;
};

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
