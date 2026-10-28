import { createStore } from "zustand/vanilla";
import type { BattleReport, PlanetView } from "./store";

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
  | "order"
  | "surrender"
  | "retreat"
  | "padTurret";

export type LocalState = {
  pending: Map<number, CommandKind>;
  selected: string | null; // the selected Planet's id
  selectedArmy: number | null;
  hovered: string | null; // the Planet under the pointer
  watching: number | null; // the Battle open in the Battle panel
  /** Planets out of vision, as last seen. In memory only: lost on reload. */
  lastSeen: Map<string, LastSeen>;
  /** Your Battles, running and over, by id. In memory only: lost on reload. */
  reports: Map<number, BattleReport>;
  clockOffset: number; // Match Time = performance.now() + clockOffset
};

export const createLocalStore = () =>
  createStore<LocalState>(() => ({
    pending: new Map(),
    selected: null,
    selectedArmy: null,
    hovered: null,
    watching: null,
    lastSeen: new Map(),
    reports: new Map(),
    clockOffset: 0,
  }));

export type LocalStore = ReturnType<typeof createLocalStore>;

/** A Planet's details as last seen, and the Match Time they were. */
export type LastSeen = { planet: PlanetView; seenAt: number };

/**
 * The last-seen cache after a View change: Planets leaving vision are copied
 * in as they were last seen, and Planets in vision again are dropped, since
 * live data replaces the copy. Queues are left out of the copy: a Planet
 * you lost isn't yours to queue on.
 */
export function updateLastSeen(
  cache: Map<string, LastSeen>,
  before: Map<string, PlanetView> | undefined,
  left: string[],
  inVision: Iterable<string>,
  seenAt: number,
) {
  const next = new Map(cache);
  for (const id of left) {
    const p = before?.get(id);
    if (p) next.set(id, { planet: { ...p, queue: [], unitQueue: [] }, seenAt });
  }
  for (const id of inVision) next.delete(id);
  return next;
}

export const isPending = (s: LocalState, kind: CommandKind) =>
  [...s.pending.values()].includes(kind);
