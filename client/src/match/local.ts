import { createStore } from "zustand/vanilla";
import type { BattleReport, DefenceLayout, PlanetView } from "./store";

// Client-only state. Pending commands are keyed by seq; a control shows as
// pending while its kind is in here.

export type CommandKind =
  | "faction"
  | "ready"
  | "map"
  | "startingResources"
  | "start"
  | "bot"
  | "seat"
  | "teams"
  | "team"
  | "build"
  | "cancel"
  | "sell"
  | "train"
  | "move"
  | "rally"
  | "order"
  | "surrender"
  | "retreat"
  | "padTurret"
  | "exchange"
  | "research"
  | "courier"
  | "battleControl"
  | "battleCommand"
  | "battleOrder"
  | "layout"
  | "watch"
  | "truce";

export type LocalState = {
  pending: Map<number, CommandKind>;
  selected: string | null; // the selected Planet's id
  selectedArmy: number | null;
  /** The Tech the Move… picker is open for; army when it's already a Courier. */
  moving: { tech: string; army?: number } | null;
  hovered: string | null; // the Planet under the pointer
  watching: number | null; // the Battle open in the Battle panel
  /** The camera centres on this Planet; a new object each time, so asking again re-centres. */
  focus: { planet: string } | null;
  /** Planets out of vision, as last seen. In memory only: lost on reload. */
  lastSeen: Map<string, LastSeen>;
  /** Your Battles, running and over, by id. In memory only: lost on reload. */
  reports: Map<number, BattleReport>;
  clockOffset: number; // Match Time = performance.now() + clockOffset
  /** The last defence layout the server sent: the open Layout window's. */
  layout: DefenceLayout | null;
};

export const createLocalStore = () =>
  createStore<LocalState>(() => ({
    pending: new Map(),
    selected: null,
    selectedArmy: null,
    moving: null,
    hovered: null,
    watching: null,
    focus: null,
    lastSeen: new Map(),
    reports: new Map(),
    clockOffset: 0,
    layout: null,
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
