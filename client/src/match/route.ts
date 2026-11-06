import type { GalaxyMap, Ruleset } from "../gen/content";
import type { Army } from "./store";

/** Lane travel times in ms, both ways: from → to → ms. */
export type Lanes = Map<string, Map<string, number>>;

/**
 * Each Lane's travel time, as the server computes it: its explicit time, or
 * its length (by default the straight-line distance) times its Lane type's
 * multiplier. One length unit is 1 s.
 */
export function laneTimes(map: GalaxyMap, rules: Ruleset): Lanes {
  const pos = new Map(map.planets.map((p) => [p.id, p.position]));
  const lanes: Lanes = new Map();
  for (const l of map.lanes) {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    const length = l.length ?? (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0);
    const ms = Math.round(
      l.time !== undefined
        ? l.time * 1000
        : length * (rules.laneTypes[l.type] ?? 0) * 1000,
    );
    for (const [from, to] of [
      [l.from, l.to],
      [l.to, l.from],
    ] as const) {
      if (!lanes.has(from)) lanes.set(from, new Map());
      lanes.get(from)?.set(to, ms);
    }
  }
  return lanes;
}

/** A Planet's owner as routing sees it: a Teammate's as yours, null for none. */
export type Owner = (planet: string) => number | null;

/**
 * A hop's time for an Army of seat, as the server's hopTime: own times its
 * Lane's time between two of seat's Planets (#111).
 */
export function hopMs(
  lanes: Lanes,
  own: number,
  owner: Owner,
  seat: number,
  from: string,
  to: string,
) {
  const t = lanes.get(from)?.get(to) ?? 0;
  return owner(from) === seat && owner(to) === seat ? Math.round(t * own) : t;
}

/**
 * The Match Time an Army reaches its destination: this hop, then the rest of
 * its route, each hop timed by its owners now (the server judges each as it
 * sets off).
 */
export function arrival(
  lanes: Lanes,
  a: Army,
  now: number,
  own = 1,
  owner: Owner = () => null,
) {
  let at = a.waiting ? now : a.arrives;
  [a.to, ...a.path].forEach((p, i, stops) => {
    if (i > 0) at += hopMs(lanes, own, owner, a.owner, stops[i - 1] ?? "", p);
  });
  return at;
}

type Label = { enemies: number; neutrals: number; ms: number; path: string[] };

// Element by element, in byte-wise order; ids are ASCII, so < on strings is.
function comparePaths(a: string[], b: string[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

// Fewest enemy Planets, then fastest, then fewest neutrals, then lowest ids.
const better = (a: Label, b: Label) =>
  (a.enemies - b.enemies ||
    a.ms - b.ms ||
    a.neutrals - b.neutrals ||
    comparePaths(a.path, b.path)) < 0;

/**
 * A port of the server's game.Route, for the route preview; the server's
 * route stays authoritative. owner gives each Planet's owner as the player
 * knows it, null for neutral. The route goes straight through the player's
 * own Planets and neutral ones, and entering an enemy Planet ends the move
 * there, so it enters as few as it can, whatever the time; then it's the
 * fastest; then, on equal times, it passes the fewest neutrals. A hop
 * between two of your Planets takes own times its Lane's time. Both pass
 * testdata/routing.
 */
export function route(
  lanes: Lanes,
  owner: Owner,
  you: number,
  from: string,
  to: string,
  own = 1,
): { ms: number; path: string[] } | null {
  if (from === to) return { ms: 0, path: [from] };
  const best = new Map<string, Label>([
    [from, { enemies: 0, neutrals: 0, ms: 0, path: [from] }],
  ]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [id, l] of best) {
      const c = cur === null ? undefined : best.get(cur);
      if (!done.has(id) && (!c || better(l, c))) cur = id;
    }
    if (cur === null) return null;
    const here = best.get(cur) as Label;
    if (cur === to) return { ms: here.ms, path: here.path };
    done.add(cur);
    for (const next of lanes.get(cur)?.keys() ?? []) {
      const o = owner(next);
      const l = {
        enemies: here.enemies + (o !== null && o !== you ? 1 : 0),
        neutrals: here.neutrals + (o === null ? 1 : 0),
        ms: here.ms + hopMs(lanes, own, owner, you, cur, next),
        path: [...here.path, next],
      };
      const old = best.get(next);
      if (!done.has(next) && (!old || better(l, old))) best.set(next, l);
    }
  }
}
