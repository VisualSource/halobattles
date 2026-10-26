import type { GalaxyMap, Ruleset } from "../gen/content";

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

type Label = { ms: number; path: string[] };

// Element by element, in byte-wise order; ids are ASCII, so < on strings is.
function comparePaths(a: string[], b: string[]) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

const better = (a: Label, b: Label) =>
  a.ms < b.ms || (a.ms === b.ms && comparePaths(a.path, b.path) < 0);

/**
 * A port of the server's game.Route, for the route preview; the server's
 * route stays authoritative. The fastest route passes only through Planets
 * the player owns, so any other can only be the last. Both pass
 * testdata/routing.
 */
export function route(
  lanes: Lanes,
  owned: (planet: string) => boolean,
  from: string,
  to: string,
): Label | null {
  if (from === to) return { ms: 0, path: [from] };
  const best = new Map<string, Label>([[from, { ms: 0, path: [from] }]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [id, l] of best) {
      const c = cur === null ? undefined : best.get(cur);
      if (!done.has(id) && (!c || better(l, c))) cur = id;
    }
    if (cur === null) return null;
    const here = best.get(cur) as Label;
    if (cur === to) return here;
    done.add(cur);
    if (cur !== from && !owned(cur)) continue; // an attack ends here
    for (const [next, ms] of lanes.get(cur) ?? []) {
      const l = { ms: here.ms + ms, path: [...here.path, next] };
      const old = best.get(next);
      if (!done.has(next) && (!old || better(l, old))) best.set(next, l);
    }
  }
}
