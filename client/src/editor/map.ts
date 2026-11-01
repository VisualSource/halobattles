import type {
  GalaxyMap,
  Lane,
  MapPlanet,
  Position,
  Stack,
  Stacks,
} from "../gen/content";

// The map editor's edits, as pure functions on the map file's shape. Fields
// the editor doesn't edit (garrisons, overrides, battlefield, Lane length and
// time) pass through untouched, so saving keeps them.

/** A map while it's edited: unlike the file, it may have no Planets or starts yet. */
export type EditorMap = Omit<GalaxyMap, "planets" | "starts"> & {
  planets: MapPlanet[];
  starts: string[];
};

/** An entry in tools/map-editor/planets.json. */
export type ListPlanet = {
  id: string;
  name: string;
  tags: string[];
  url: string;
};

export const newMap = (): EditorMap => ({
  id: "new-map",
  name: "New map",
  planets: [],
  lanes: [],
  starts: [],
  minPlayers: 2,
  win: { planetShare: 0.51, holdSeconds: 120 },
});

const at = (p: Position): Position => ({
  x: Math.round(p.x),
  y: Math.round(p.y),
});
const joins = (l: Lane, a: string, b: string) =>
  (l.from === a && l.to === b) || (l.from === b && l.to === a);

/** Adds p at pos as a Standard Planet; a Halo ring is drawn as one. */
export function place(m: EditorMap, p: ListPlanet, pos: Position): EditorMap {
  if (m.planets.some((x) => x.id === p.id)) return m;
  const planet: MapPlanet = {
    id: p.id,
    name: p.name,
    type: "standard",
    position: at(pos),
    ...(p.tags.includes("halo-ring") && { model: "ring" as const }),
  };
  return { ...m, planets: [...m.planets, planet] };
}

export const updatePlanet = (
  m: EditorMap,
  id: string,
  patch: Partial<MapPlanet>,
): EditorMap => ({
  ...m,
  planets: m.planets.map((p) =>
    p.id === id
      ? withoutUndefined({
          ...p,
          ...patch,
          ...(patch.position && { position: at(patch.position) }),
        })
      : p,
  ),
});

/** Removes a Planet and everything that names it: its Lanes, start and garrison. */
export function removePlanet(m: EditorMap, id: string): EditorMap {
  const { [id]: _, ...garrisons } = m.garrisons ?? {};
  return withoutUndefined({
    ...m,
    planets: m.planets.filter((p) => p.id !== id),
    lanes: m.lanes.filter((l) => l.from !== id && l.to !== id),
    starts: m.starts.filter((s) => s !== id),
    garrisons: m.garrisons && garrisons,
  });
}

export const setStart = (m: EditorMap, id: string, on: boolean): EditorMap => ({
  ...m,
  starts: on
    ? m.starts.includes(id)
      ? m.starts
      : [...m.starts, id]
    : m.starts.filter((s) => s !== id),
});

/** Adds the Lane between a and b, or removes it if there is one. */
export function toggleLane(
  m: EditorMap,
  a: string,
  b: string,
  type: string,
): EditorMap {
  if (a === b) return m;
  return m.lanes.some((l) => joins(l, a, b))
    ? { ...m, lanes: m.lanes.filter((l) => !joins(l, a, b)) }
    : { ...m, lanes: [...m.lanes, { from: a, to: b, type }] };
}

/** Sets a Lane's fields; an undefined length or time goes back to the default. */
export const updateLane = (
  m: EditorMap,
  i: number,
  patch: Partial<Lane>,
): EditorMap => ({
  ...m,
  lanes: m.lanes.map((l, j) =>
    j === i ? withoutUndefined({ ...l, ...patch }) : l,
  ),
});

/** A Stack holds at most this many Unit Slots (docs/specs/game-design-spec.md). */
export const SLOTS_PER_STACK = 15;

/**
 * Sets a Planet's garrison from its three Stacks. Empty Stacks at the end are
 * dropped (an empty one before a filled one stays, keeping Stack order), and a
 * garrison with no units is removed, as is an empty garrisons object.
 */
export function setGarrison(
  m: EditorMap,
  id: string,
  stacks: Stack[],
): EditorMap {
  const kept = stacks.slice(0, 3);
  while (kept.length && kept[kept.length - 1]?.length === 0) kept.pop();
  const { [id]: _, ...rest } = m.garrisons ?? {};
  const garrisons = kept.length ? { ...rest, [id]: kept as Stacks } : rest;
  return withoutUndefined({
    ...m,
    garrisons: Object.keys(garrisons).length ? garrisons : undefined,
  });
}

/** A Planet's garrison as three Stacks, missing ones empty. */
export const garrisonOf = (m: EditorMap, id: string): Stack[] => {
  const g: Stack[] = m.garrisons?.[id] ?? [];
  return [0, 1, 2].map((i) => g[i] ?? []);
};

export const removeLane = (m: EditorMap, i: number): EditorMap => ({
  ...m,
  lanes: m.lanes.filter((_, j) => j !== i),
});

function withoutUndefined<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
}
