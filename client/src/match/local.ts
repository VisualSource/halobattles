import { createStore } from "zustand/vanilla";

// Client-only state. Pending commands are keyed by seq; a control shows as
// pending while its kind is in here.

export type CommandKind =
  | "faction"
  | "ready"
  | "map"
  | "startingResources"
  | "start"
  | "build"
  | "cancel"
  | "sell"
  | "train"
  | "move"
  | "rally"
  | "order";

export type LocalState = {
  pending: Map<number, CommandKind>;
  selected: string | null; // the selected Planet's id
  selectedArmy: number | null;
  hovered: string | null; // the Planet under the pointer
  clockOffset: number; // Match Time = performance.now() + clockOffset
};

export const createLocalStore = () =>
  createStore<LocalState>(() => ({
    pending: new Map(),
    selected: null,
    selectedArmy: null,
    hovered: null,
    clockOffset: 0,
  }));

export type LocalStore = ReturnType<typeof createLocalStore>;

export const isPending = (s: LocalState, kind: CommandKind) =>
  [...s.pending.values()].includes(kind);
