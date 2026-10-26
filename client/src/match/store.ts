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

export type MatchState = {
  lobby: Lobby | null;
  disconnected: boolean; // the socket dropped, e.g. the server restarted
};

export const createMatchStore = () =>
  createStore<MatchState>(() => ({ lobby: null, disconnected: false }));
