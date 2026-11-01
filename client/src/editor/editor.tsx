import { cn } from "cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lane, MapPlanet, Position, Stack } from "../gen/content";
import {
  type EditorMap,
  garrisonOf,
  type ListPlanet,
  newMap,
  place,
  removeLane,
  removePlanet,
  SLOTS_PER_STACK,
  setGarrison,
  setStart,
  toggleLane,
  updateLane,
  updatePlanet,
} from "./map";

// The dev-only galaxy map editor (editor.html), served with the endpoints in
// client/map-editor.plugin.ts. Mouse and keyboard; no touch.

type Data = {
  planets: ListPlanet[];
  planetTypes: { id: string; name: string }[];
  units: Unit[];
  laneTypes: Record<string, number>;
  maps: string[];
};
type Unit = {
  id: string;
  name: string;
  faction: string;
  commandPoints: number;
};
type Selection = { planet: string } | { lane: number } | null;
type Check = { kind: "idle" | "busy" | "ok" | "bad"; text: string };

/** Tag colours, in the order a Planet's first matching tag picks. */
const TAGS: [string, string, string][] = [
  ["halo-ring", "Halo ring", "#f0a93b"],
  ["homeworld", "Homeworld", "#f0c27a"],
  ["forerunner-world", "Forerunner", "#a98cf0"],
  ["covenant-world", "Covenant", "#e0604f"],
  ["jiralhanae-colony", "Jiralhanae", "#e8b34a"],
  ["human-colony", "Human colony", "#5fb3e8"],
  ["independent-colony", "Independent", "#8fb8f5"],
  ["sol", "Sol", "#7fdca0"],
];
const UNTAGGED = "#7d8a95";
const colourOf = (tags: string[] = []) =>
  TAGS.find(([t]) => tags.includes(t))?.[2] ?? UNTAGGED;

const field = "flex items-center gap-1.5";
const label = "font-mono text-[11px] text-ink-3 uppercase tracking-[0.08em]";

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export function Editor() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [map, setMap] = useState<EditorMap>(newMap);
  const [dirty, setDirty] = useState(false);
  // The map id last opened or saved: saving under any other id that exists
  // would overwrite that map, so it asks first.
  const [opened, setOpened] = useState("");
  const [sel, setSel] = useState<Selection>(null);
  const [tool, setTool] = useState<"select" | "lane">("select");
  const [laneFrom, setLaneFrom] = useState<string | null>(null);
  const [view, setView] = useState({ x: -300, y: -300, k: 1 });
  const [check, setCheck] = useState<Check>({
    kind: "idle",
    text: "Not saved yet",
  });

  useEffect(() => {
    fetch("/__editor/data")
      .then(json<Data>)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const edit = useCallback((f: (m: EditorMap) => EditorMap) => {
    setMap(f);
    setDirty(true);
  }, []);

  const open = async (id: string) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSel(null);
    setLaneFrom(null);
    setDirty(false);
    setOpened(id);
    if (!id) return setMap(newMap());
    try {
      setMap(await fetch(`/__editor/maps/${id}`).then(json<EditorMap>));
      setCheck({ kind: "idle", text: `Opened ${id}` });
    } catch (e) {
      setCheck({ kind: "bad", text: String(e) });
    }
  };

  const save = async () => {
    if (
      map.id !== opened &&
      data?.maps.includes(map.id) &&
      !confirm(`A map called ${map.id} already exists. Overwrite it?`)
    )
      return;
    setCheck({ kind: "busy", text: "Saving and checking…" });
    // Clean from now: an edit during the check (up to 2 minutes) marks it dirty again.
    setDirty(false);
    try {
      const r = await fetch(`/__editor/maps/${map.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(map),
      }).then(json<{ file: string; ok: boolean; output: string }>);
      setOpened(map.id);
      setData(
        (d) =>
          d &&
          (d.maps.includes(map.id)
            ? d
            : { ...d, maps: [...d.maps, map.id].sort() }),
      );
      setCheck({
        kind: r.ok ? "ok" : "bad",
        text: `Saved ${r.file} · ${r.output}`,
      });
    } catch (e) {
      setDirty(true); // not saved after all
      setCheck({ kind: "bad", text: String(e) });
    }
  };

  const remove = useCallback(() => {
    if (!sel) return;
    edit((m) =>
      "planet" in sel ? removePlanet(m, sel.planet) : removeLane(m, sel.lane),
    );
    setSel(null);
  }, [sel, edit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not while typing, nor from the side panel's buttons: Backspace there mustn't delete the Planet.
      if ((e.target as HTMLElement).closest("input, select, textarea, aside"))
        return;
      const pan = (
        {
          ArrowLeft: [-60, 0],
          ArrowRight: [60, 0],
          ArrowUp: [0, -60],
          ArrowDown: [0, 60],
        } as Record<string, [number, number]>
      )[e.key];
      if (pan) {
        e.preventDefault();
        setView((v) => ({
          ...v,
          x: v.x + pan[0] / v.k,
          y: v.y + pan[1] / v.k,
        }));
      } else if (e.key === "Delete" || e.key === "Backspace") remove();
      else if (e.key === "Escape") {
        setLaneFrom(null);
        setSel(null);
      } else if (e.key === "v") {
        setTool("select");
        setLaneFrom(null);
      } else if (e.key === "l") setTool("lane");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remove]);

  if (error)
    return (
      <p className="text-danger p-6">
        The editor's data didn't load ({error}). Open it from the client dev
        server: pnpm -C client dev, then /editor.html.
      </p>
    );
  if (!data) return <p className="text-ink-3 p-6">Loading…</p>;

  const laneTypes = Object.keys(data.laneTypes);
  const starts = map.starts.length;
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-line bg-bar flex h-13 flex-none items-center gap-3 border-b px-3.5">
        <h1 className="font-display mr-1 text-base font-bold tracking-widest">
          MAP EDITOR
        </h1>
        <label className={field}>
          <span className={label}>Open</span>
          <select
            value={data.maps.includes(map.id) && !dirty ? map.id : ""}
            onChange={(e) => open(e.target.value)}
          >
            <option value="">(new map)</option>
            {data.maps.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className={label}>Id</span>
          <input
            className="w-32"
            value={map.id}
            pattern="[a-z0-9_-]+"
            onChange={(e) => edit((m) => ({ ...m, id: e.target.value }))}
          />
        </label>
        <label className={field}>
          <span className={label}>Name</span>
          <input
            className="w-40"
            value={map.name}
            onChange={(e) => edit((m) => ({ ...m, name: e.target.value }))}
          />
        </label>
        <NumberField
          label="Min players"
          value={map.minPlayers}
          min={1}
          onChange={(v) => edit((m) => ({ ...m, minPlayers: v }))}
        />
        <NumberField
          label="Win share"
          value={map.win.planetShare}
          step={0.01}
          min={0.5}
          max={1}
          onChange={(v) =>
            edit((m) => ({ ...m, win: { ...m.win, planetShare: v } }))
          }
        />
        <NumberField
          label="Hold s"
          value={map.win.holdSeconds}
          min={0}
          onChange={(v) =>
            edit((m) => ({ ...m, win: { ...m.win, holdSeconds: v } }))
          }
        />
        <span className="flex-1" />
        <span className="text-ink-3 text-sm">
          {map.planets.length} Planets · {map.lanes.length} Lanes · {starts}{" "}
          starts{dirty && " · unsaved"}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!/^[a-z0-9_-]+$/.test(map.id) || check.kind === "busy"}
          className="bg-accent text-accent-ink font-display h-8 rounded border-0 px-4 font-bold tracking-wider"
        >
          SAVE
        </button>
      </header>
      <main className="flex min-h-0 flex-1">
        <PlanetList planets={data.planets} placed={map.planets} />
        <Canvas
          map={map}
          list={data.planets}
          laneTypes={data.laneTypes}
          view={view}
          setView={setView}
          sel={sel}
          setSel={setSel}
          tool={tool}
          setTool={(t) => {
            setTool(t);
            setLaneFrom(null);
          }}
          laneFrom={laneFrom}
          setLaneFrom={setLaneFrom}
          edit={edit}
          newLaneType={laneTypes[0] ?? "fast"}
        />
        <Side
          map={map}
          sel={sel}
          planetTypes={data.planetTypes}
          units={data.units}
          laneTypes={laneTypes}
          edit={edit}
          remove={remove}
        />
      </main>
      <footer className="border-line bg-bar flex h-10 flex-none items-center gap-2.5 border-t px-3.5 text-sm">
        <span className={label}>Check</span>
        <span
          title={check.text}
          className={cn(
            "truncate",
            check.kind === "ok" && "text-ok",
            check.kind === "bad" && "text-danger",
            (check.kind === "idle" || check.kind === "busy") && "text-ink-3",
          )}
        >
          {check.text.replace(/\s+/g, " ")}
        </span>
      </footer>
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className={field}>
      <span className={label}>{props.label}</span>
      <input
        type="number"
        className="w-18"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(e) =>
          e.target.value !== "" && props.onChange(Number(e.target.value))
        }
      />
    </label>
  );
}

function PlanetList(props: { planets: ListPlanet[]; placed: MapPlanet[] }) {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const placed = useMemo(
    () => new Set(props.placed.map((p) => p.id)),
    [props.placed],
  );
  const shown = props.planets.filter(
    (p) =>
      (tags.size === 0 ||
        p.tags.some((t) => tags.has(t)) ||
        (tags.has("") && p.tags.length === 0)) &&
      p.name.toLowerCase().includes(q.toLowerCase()),
  );
  const toggle = (t: string) =>
    setTags((s) => {
      const n = new Set(s);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });
  return (
    <aside
      aria-label="Planets"
      className="border-line bg-panel flex w-65 flex-none flex-col border-r"
    >
      <div className="border-line flex flex-col gap-2 border-b p-3">
        <input
          aria-label="Search Planets"
          placeholder={`Search ${props.planets.length} Planets`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {[...TAGS, ["", "No tag", UNTAGGED] as [string, string, string]].map(
            ([t, name, c]) => (
              <button
                key={t}
                type="button"
                aria-pressed={tags.has(t)}
                onClick={() => toggle(t)}
                className={cn(
                  "flex h-6 items-center gap-1.5 rounded-full bg-transparent px-2 text-xs",
                  tags.has(t) ? "border-ink-3 bg-raised" : "border-edge",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: c }}
                />
                {name}
              </button>
            ),
          )}
        </div>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1.5">
        {shown.map((p) => {
          const on = placed.has(p.id);
          return (
            <li
              key={p.id}
              draggable={!on}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
              title={on ? "Placed" : "Drag onto the map"}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-[13px]",
                on ? "text-ink-4" : "hover:bg-item cursor-grab",
              )}
            >
              <span
                className="size-2 flex-none rounded-full"
                style={{ background: colourOf(p.tags) }}
              />
              <span className="flex-1 truncate">{p.name}</span>
              {on && <span className="text-ok">✓</span>}
            </li>
          );
        })}
      </ul>
      <div className="border-line text-ink-3 border-t px-3 py-2 text-xs">
        {props.placed.length} / {props.planets.length} placed · showing{" "}
        {shown.length}
      </div>
    </aside>
  );
}

function Canvas(props: {
  map: EditorMap;
  list: ListPlanet[];
  laneTypes: Record<string, number>;
  view: { x: number; y: number; k: number };
  setView: React.Dispatch<
    React.SetStateAction<{ x: number; y: number; k: number }>
  >;
  sel: Selection;
  setSel: (s: Selection) => void;
  tool: "select" | "lane";
  setTool: (t: "select" | "lane") => void;
  laneFrom: string | null;
  setLaneFrom: (id: string | null) => void;
  edit: (f: (m: EditorMap) => EditorMap) => void;
  newLaneType: string;
}) {
  const { map, view, setView, sel, tool, laneFrom, edit } = props;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<
    | { pan: { x: number; y: number; vx: number; vy: number } }
    | { planet: string }
    | null
  >(null);
  const tagsOf = useMemo(
    () => new Map(props.list.map((p) => [p.id, p.tags])),
    [props.list],
  );
  const k = view.k;

  const toMap = (e: { clientX: number; clientY: number }): Position => {
    const r = svg.current?.getBoundingClientRect();
    return {
      x: (e.clientX - (r?.left ?? 0)) / k + view.x,
      y: (e.clientY - (r?.top ?? 0)) / k + view.y,
    };
  };

  // Wheel zoom about the cursor; a non-passive listener so the page doesn't scroll.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const nk = Math.min(
          6,
          Math.max(0.1, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
        );
        const mx = (e.clientX - r.left) / v.k + v.x;
        const my = (e.clientY - r.top) / v.k + v.y;
        return {
          k: nk,
          x: mx - (e.clientX - r.left) / nk,
          y: my - (e.clientY - r.top) / nk,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const at = new Map(map.planets.map((p) => [p.id, p.position]));
  const fast = props.laneTypes.fast;
  const slow = props.laneTypes.slow;

  return (
    <div
      role="application"
      aria-label="Map"
      className="relative min-w-0 flex-1 bg-[radial-gradient(circle_at_40%_40%,#14202b_0,var(--color-ground)_65%)]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const p = props.list.find(
          (x) => x.id === e.dataTransfer.getData("text/plain"),
        );
        if (!p) return;
        edit((m) => place(m, p, toMap(e)));
        props.setSel({ planet: p.id });
      }}
    >
      <svg
        ref={svg}
        aria-label="Map canvas"
        className={cn("block size-full", tool === "lane" && "cursor-crosshair")}
        onPointerDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            drag.current = {
              pan: { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y },
            };
          } else if (e.button === 0 && e.target === svg.current) {
            props.setSel(null);
          }
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if ("pan" in d)
            setView((v) => ({
              ...v,
              x: d.pan.vx - (e.clientX - d.pan.x) / v.k,
              y: d.pan.vy - (e.clientY - d.pan.y) / v.k,
            }));
          else edit((m) => updatePlanet(m, d.planet, { position: toMap(e) }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <g transform={`scale(${k}) translate(${-view.x} ${-view.y})`}>
          {map.lanes.map((l, i) => {
            const a = at.get(l.from);
            const b = at.get(l.to);
            if (!a || !b) return null;
            const on = sel && "lane" in sel && sel.lane === i;
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: a Lane is its index in the file.
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  on ? "#f0a93b" : l.type === "slow" ? "#5a6672" : "#9aa7b2"
                }
                strokeWidth={(on ? 4 : 2.5) / k}
                strokeDasharray={
                  l.type === "slow" ? `${8 / k} ${6 / k}` : undefined
                }
                className="cursor-pointer"
                onPointerDown={(e) => {
                  if (e.button !== 0 || tool !== "select") return;
                  e.stopPropagation();
                  props.setSel({ lane: i });
                }}
              />
            );
          })}
          {map.planets.map((p) => {
            const on =
              (sel && "planet" in sel && sel.planet === p.id) ||
              laneFrom === p.id;
            const start = map.starts.includes(p.id);
            const r = (p.type === "capital" ? 14 : 10) / k;
            const c = colourOf(tagsOf.get(p.id));
            return (
              <g
                key={p.id}
                className={
                  tool === "select" ? "cursor-move" : "cursor-crosshair"
                }
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  if (tool === "lane") {
                    if (!laneFrom) props.setLaneFrom(p.id);
                    else {
                      edit((m) =>
                        toggleLane(m, laneFrom, p.id, props.newLaneType),
                      );
                      props.setLaneFrom(null);
                    }
                    return;
                  }
                  props.setSel({ planet: p.id });
                  drag.current = { planet: p.id };
                  svg.current?.setPointerCapture(e.pointerId);
                }}
              >
                {p.model === "ring" ? (
                  <ellipse
                    cx={p.position.x}
                    cy={p.position.y}
                    rx={r * 1.4}
                    ry={r * 0.6}
                    fill="none"
                    stroke={c}
                    strokeWidth={3 / k}
                  />
                ) : (
                  <circle
                    cx={p.position.x}
                    cy={p.position.y}
                    r={r}
                    fill="#1f3b5c"
                    stroke={c}
                    strokeWidth={2 / k}
                  />
                )}
                {on && (
                  <circle
                    cx={p.position.x}
                    cy={p.position.y}
                    r={r + 6 / k}
                    fill="none"
                    stroke="#f0a93b"
                    strokeWidth={2 / k}
                  />
                )}
                {start && (
                  <text
                    x={p.position.x}
                    y={p.position.y + 4 / k}
                    textAnchor="middle"
                    fontSize={11 / k}
                    fill="#f0c27a"
                  >
                    ★
                  </text>
                )}
                <text
                  x={p.position.x}
                  y={p.position.y + r + 14 / k}
                  textAnchor="middle"
                  fontSize={12 / k}
                  fill="#c3ccd4"
                >
                  {p.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute top-3 left-3 flex gap-1.5">
        {(["select", "lane"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tool === t}
            onClick={() => props.setTool(t)}
            title={
              t === "select"
                ? "Select and move (V)"
                : "Click two Planets to add or remove a Lane (L)"
            }
            className={cn(
              "h-8 px-3",
              tool === t
                ? "border-accent bg-accent-wash text-accent"
                : "bg-raised",
            )}
          >
            {t === "select"
              ? "Select · V"
              : `Lane · L${laneFrom ? ` (from ${laneFrom})` : ""}`}
          </button>
        ))}
      </div>
      <div className="text-ink-3 absolute bottom-3 left-3.5 flex flex-col gap-1 text-xs">
        <span className="font-mono">
          100 = {fast !== undefined && `${Math.round(100 * fast)} s fast`}
          {slow !== undefined && ` · ${Math.round(100 * slow)} s slow`}
        </span>
        <i
          className="border-ink-3 block h-1.5 border border-t-0"
          style={{ width: 100 * k }}
        />
      </div>
      <div className="text-ink-4 absolute right-3.5 bottom-3 text-right text-xs leading-normal">
        Drag a Planet from the list to place it
        <br />
        Wheel: zoom · Middle-drag or arrows: pan
        <br />
        Delete: remove · Esc: cancel
      </div>
    </div>
  );
}

function Side(props: {
  map: EditorMap;
  sel: Selection;
  planetTypes: { id: string; name: string }[];
  units: Unit[];
  laneTypes: string[];
  edit: (f: (m: EditorMap) => EditorMap) => void;
  remove: () => void;
}) {
  const { map, sel, edit } = props;
  const row = "flex items-center justify-between gap-2.5 text-[13px]";
  const lane = sel && "lane" in sel ? map.lanes[sel.lane] : undefined;
  const planet =
    sel && "planet" in sel
      ? map.planets.find((p) => p.id === sel.planet)
      : undefined;
  const num = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <aside
      aria-label="Selection"
      className="border-line bg-panel flex w-70 flex-none flex-col gap-3 border-l p-3.5"
    >
      {lane && sel && "lane" in sel ? (
        <>
          <h2 className="font-display m-0 text-[17px]">Lane</h2>
          <p className="text-ink-3 m-0 text-[13px]">
            {lane.from} → {lane.to}
          </p>
          <label className={row}>
            Type
            <select
              className="w-35"
              value={lane.type}
              onChange={(e) =>
                edit((m) => updateLane(m, sel.lane, { type: e.target.value }))
              }
            >
              {props.laneTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <LaneNumber
            label="Length"
            placeholder="straight line"
            value={lane.length}
            onChange={(v) =>
              edit((m) =>
                updateLane(m, sel.lane, { length: num(v) } as Partial<Lane>),
              )
            }
          />
          <LaneNumber
            label="Time (s)"
            placeholder="from length"
            value={lane.time}
            onChange={(v) =>
              edit((m) =>
                updateLane(m, sel.lane, { time: num(v) } as Partial<Lane>),
              )
            }
          />
          <p className="text-ink-3 m-0 text-[13px]">
            Leave both empty to use the distance on the map. Time overrides
            length × the Lane type's multiplier.
          </p>
          <div className="border-line border-t" />
          <button type="button" onClick={props.remove}>
            Remove Lane
          </button>
        </>
      ) : planet ? (
        <>
          <h2 className="font-display m-0 text-[17px]">{planet.name}</h2>
          <p className="text-ink-3 m-0 font-mono text-[13px]">
            {planet.id} · {planet.position.x}, {planet.position.y}
          </p>
          <label className={row}>
            Planet Type
            <select
              className="w-35"
              value={planet.type}
              onChange={(e) =>
                edit((m) =>
                  updatePlanet(m, planet.id, { type: e.target.value }),
                )
              }
            >
              {props.planetTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className={row}>
            Start
            <input
              type="checkbox"
              className="accent-accent"
              checked={map.starts.includes(planet.id)}
              onChange={(e) =>
                edit((m) => setStart(m, planet.id, e.target.checked))
              }
            />
          </label>
          <label className={row}>
            Halo ring
            <input
              type="checkbox"
              className="accent-accent"
              checked={planet.model === "ring"}
              onChange={(e) =>
                edit((m) =>
                  updatePlanet(m, planet.id, {
                    model: e.target.checked ? "ring" : undefined,
                  }),
                )
              }
            />
          </label>
          <div className={row}>
            Lanes{" "}
            <span className="font-mono">
              {
                map.lanes.filter(
                  (l) => l.from === planet.id || l.to === planet.id,
                ).length
              }
            </span>
          </div>
          {(planet.overrides || planet.battlefield) && (
            <p className="text-ink-3 m-0 text-[13px]">
              Has overrides from the file: kept on save, not editable here yet.
            </p>
          )}
          <Garrison
            key={planet.id}
            map={map}
            planet={planet.id}
            units={props.units}
            edit={edit}
          />
          <div className="border-line border-t" />
          <button type="button" onClick={props.remove}>
            Remove Planet
          </button>
        </>
      ) : (
        <>
          <h2 className="font-display m-0 text-[17px]">Nothing selected</h2>
          <p className="text-ink-3 m-0 text-[13px]">
            Click a Planet or a Lane to edit it. In Lane mode, click two Planets
            to add or remove the Lane between them.
          </p>
        </>
      )}
    </aside>
  );
}

function LaneNumber(props: {
  label: string;
  placeholder: string;
  value: number | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2.5 text-[13px]">
      {props.label}
      <input
        type="number"
        min={0}
        className="w-35"
        placeholder={props.placeholder}
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

/** A Planet's neutral starting units: up to three Stacks of Unit Slots. */
function Garrison(props: {
  map: EditorMap;
  planet: string;
  units: Unit[];
  edit: (f: (m: EditorMap) => EditorMap) => void;
}) {
  const { map, planet, units } = props;
  const [tab, setTab] = useState(0);
  const stacks = garrisonOf(map, planet);
  const stack = stacks[tab] ?? [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const factions = [...new Set(units.map((u) => u.faction))].sort();
  const all = stacks.flat();
  const set = (s: Stack) =>
    props.edit((m) =>
      setGarrison(
        m,
        planet,
        stacks.map((x, i) => (i === tab ? s : x)),
      ),
    );
  const slot = (j: number, patch: Partial<Stack[number]>) =>
    set(stack.map((e, i) => (i === j ? { ...e, ...patch } : e)));
  return (
    <section
      aria-label="Garrison"
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className={label}>Garrison</span>
        <button
          type="button"
          disabled={all.length === 0}
          onClick={() => props.edit((m) => setGarrison(m, planet, []))}
          className="h-6 px-2 text-xs"
        >
          Clear
        </button>
      </div>
      {map.starts.includes(planet) && (
        <p className="text-host m-0 text-xs">
          A start Planet: this garrison holds it only if no player takes the
          start.
        </p>
      )}
      <div role="tablist" className="flex gap-1">
        {stacks.map((s, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: a Stack is its position.
            key={i}
            type="button"
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={cn(
              "flex h-8 flex-1 flex-col items-center justify-center bg-transparent px-1 text-xs leading-tight",
              tab === i && "border-accent bg-accent-wash text-accent",
            )}
          >
            Stack {i + 1}
            <small className="text-ink-3 font-mono text-[10px]">
              {s.length} / {SLOTS_PER_STACK}
            </small>
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {stack.length === 0 ? (
          <p className="border-edge text-ink-3 m-0 rounded-md border border-dashed p-4 text-center text-[13px]">
            Stack {tab + 1} is empty.
          </p>
        ) : (
          stack.map((e, j) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a Unit Slot is its position.
              key={j}
              className="grid grid-cols-[18px_1fr_64px_24px] items-center gap-1.5"
            >
              <span className="text-ink-4 text-right font-mono text-[11px]">
                {j + 1}
              </span>
              <select
                aria-label={`Slot ${j + 1} unit`}
                value={e.unit}
                onChange={(ev) => slot(j, { unit: ev.target.value })}
              >
                {!byId.has(e.unit) && (
                  <option value={e.unit}>{e.unit} (unknown)</option>
                )}
                {factions.map((f) => (
                  <optgroup key={f} label={f.toUpperCase()}>
                    {units
                      .filter((u) => u.faction === f)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <input
                type="number"
                min={1}
                aria-label={`Slot ${j + 1} count`}
                value={e.count}
                onChange={(ev) =>
                  ev.target.value !== "" &&
                  slot(j, {
                    count: Math.max(1, Math.round(Number(ev.target.value))),
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove slot ${j + 1}`}
                onClick={() => set(stack.filter((_, i) => i !== j))}
                className="text-ink-3 size-6 border-0 bg-transparent p-0"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        disabled={stack.length >= SLOTS_PER_STACK || units.length === 0}
        onClick={() =>
          set([
            ...stack,
            { unit: stack.at(-1)?.unit ?? units[0]?.id ?? "", count: 1 },
          ])
        }
      >
        + Add unit
      </button>
      <div className="text-ink-3 flex justify-between text-xs">
        {all.length ? (
          <>
            <span>{all.reduce((n, e) => n + e.count, 0)} units</span>
            <span className="font-mono">
              {all.reduce(
                (n, e) => n + e.count * (byId.get(e.unit)?.commandPoints ?? 0),
                0,
              )}{" "}
              CP
            </span>
          </>
        ) : (
          <span>No garrison: the Planet starts empty.</span>
        )}
      </div>
    </section>
  );
}
