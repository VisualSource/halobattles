import { createStore } from "zustand/vanilla";

// Client-only state. Pending commands are keyed by seq; a control shows as
// pending while its kind is in here.

export type CommandKind =
  | "faction"
  | "ready"
  | "map"
  | "startingResources"
  | "start";

export type LocalState = { pending: Map<number, CommandKind> };

export const createLocalStore = () =>
  createStore<LocalState>(() => ({ pending: new Map() }));

export const isPending = (s: LocalState, kind: CommandKind) =>
  [...s.pending.values()].includes(kind);
