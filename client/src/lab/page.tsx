import type { Session } from "@heroiclabs/nakama-js";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useHideHeader } from "../backdrop";
import type { ContentLookups } from "../content";
import {
  COMMAND_POST,
  classOf,
  commandPostHealth,
  DROP_DRAG,
  look3D,
  PadMenu,
  Reinforcements,
  statsOf,
} from "../match/battle";
import { SelectionStrip, useCommandKeys } from "../match/command";
import { LayoutMap } from "../match/layout";
import type { Side, Squad, SquadOrder, Volley } from "../match/store";
import {
  type BattlefieldDrawing,
  type BattlefieldLook,
  BattlefieldScene,
  type OverlayLine,
  POINT_NAMES,
} from "../scene/battlefield";
import { Battlefield3DScene } from "../scene/battlefield3d";
import { seatColour } from "../scene/galaxy";
import {
  LabConnection,
  type LabDecision,
  type LabSetup,
  type LabSide,
  type Thinking,
} from "./connection";
import { DuelsTab } from "./duels";
import { Segmented } from "./segmented";

// The Battle Lab (docs/specs/tactical-battle-spec.md#the-battle-lab): a dev
// page for setting up a Battle, running and stepping it, and seeing what each
// side's AI is thinking.

const SIDES = ["attacker", "defender"] as const;
const SPEEDS = [0.5, 1, 2, 4, 8];
const FORCE_COLOURS = [
  "#f0a93b",
  "#5fb3e8",
  "#7fdca0",
  "#b48cf0",
  "#f0c27a",
  "#e0735c",
];
const title = "font-display text-sm font-semibold tracking-[0.08em] text-ink-2";
const tag = "font-mono text-[11px] tracking-[0.08em] text-ink-3";
const button =
  "border-edge min-h-9 rounded-md border bg-transparent px-3 disabled:opacity-40";

type Fog = "none" | Side;

export function LabPage(props: { session: Session; content: ContentLookups }) {
  const { content } = props;
  useHideHeader();
  // Each mount opens its own Lab match and closes it on unmount (StrictMode
  // mounts twice in dev).
  const [conn, setConn] = useState<LabConnection | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const c = new LabConnection();
    let live = true;
    c.open(props.session).then(
      () => live && setConn(c),
      (e) =>
        live &&
        setFailed(
          `Couldn't open the Lab: ${e?.message ?? e}. Is the server running with HALO_DEV=1?`,
        ),
    );
    return () => {
      live = false;
      setConn(null);
      void c.close();
    };
  }, [props.session]);

  const [setup, setSetup] = useState<LabSetup>(() => defaultSetup(content));
  const [fog, setFog] = useState<Fog>("none");
  const [show, setShow] = useState({
    forces: true,
    targets: true,
    routes: true,
  });
  const [aiSide, setAiSide] = useState<0 | 1>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [editLayout, setEditLayout] = useState(false);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [tab, setTab] = useState<"battle" | "duels">("battle");
  // A new layout rebuilds the Battle on it, paused at the start.
  const relayout = (layout: LabSetup["layout"]) => {
    const next = { ...setup, layout };
    setSetup(next);
    conn?.setup(next);
  };

  if (!conn) {
    return (
      <p className="text-ink-2 p-8">{failed ?? "Opening the Battle Lab…"}</p>
    );
  }
  return (
    <div className="bg-ground text-ink flex h-screen flex-col text-sm">
      <Header
        conn={conn}
        content={content}
        setup={setup}
        tab={tab}
        onTab={setTab}
      />
      {tab === "duels" && (
        <DuelsTab
          conn={conn}
          content={content}
          onPlay={(a, b) => {
            conn.duel(a, b, 0);
            setTab("battle");
          }}
        />
      )}
      <div className={cn("flex min-h-0 flex-1", tab === "duels" && "hidden")}>
        <SetupPanel
          content={content}
          setup={setup}
          onChange={setSetup}
          onRun={() => conn.setup(setup)}
        />
        <main className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
          <div className="flex flex-wrap items-center gap-4">
            <fieldset
              aria-label="Fog"
              className="m-0 flex items-center gap-1.5 border-0 p-0"
            >
              <span className={tag}>FOG</span>
              <Segmented
                value={fog}
                options={[
                  ["none", "None"],
                  ["attacker", "Attacker's"],
                  ["defender", "Defender's"],
                ]}
                onChange={setFog}
              />
            </fieldset>
            <fieldset
              aria-label="Overlays"
              className="m-0 flex items-center gap-3 border-0 p-0"
            >
              <span className={tag}>SHOW</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={show.forces}
                  onChange={(e) =>
                    setShow({ ...show, forces: e.target.checked })
                  }
                />
                Task Forces
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={show.targets}
                  onChange={(e) =>
                    setShow({ ...show, targets: e.target.checked })
                  }
                />
                Targets
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={show.routes}
                  onChange={(e) =>
                    setShow({ ...show, routes: e.target.checked })
                  }
                />
                Routes
              </label>
            </fieldset>
            <Reinforce conn={conn} content={content} setup={setup} />
            <fieldset
              aria-label="View"
              className="m-0 flex items-center gap-1.5 border-0 p-0"
            >
              <span className={tag}>VIEW</span>
              <Segmented
                value={view}
                options={[
                  ["2d", "2D"],
                  ["3d", "3D"],
                ]}
                onChange={setView}
              />
            </fieldset>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={editLayout}
                onChange={(e) => setEditLayout(e.target.checked)}
              />
              Defender layout
            </label>
            {editLayout && (
              <button
                type="button"
                className="border-edge bg-raised min-h-7 rounded border px-2.5 text-xs"
                onClick={() => relayout({ sites: [], starts: new Map() })}
              >
                Reset layout
              </button>
            )}
          </div>
          {editLayout ? (
            <LabLayout
              conn={conn}
              content={content}
              setup={setup}
              onChange={relayout}
            />
          ) : (
            <Field
              conn={conn}
              content={content}
              fog={fog}
              show={show}
              selected={selected}
              onPick={setSelected}
              factions={[setup.sides[0].faction, setup.sides[1].faction]}
              view={view}
            />
          )}
          <Status conn={conn} content={content} />
        </main>
        <AiPanel
          conn={conn}
          content={content}
          side={aiSide}
          onSide={setAiSide}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}

/** The defender's layout on the Lab's Battlefield, edited as in a Match; each change rebuilds the Battle. */
function LabLayout(props: {
  conn: LabConnection;
  content: ContentLookups;
  setup: LabSetup;
  onChange: (layout: LabSetup["layout"]) => void;
}) {
  const layout = useStore(props.conn.store, (s) => s.layout);
  if (!layout)
    return (
      <p className="text-ink-3 flex-1 p-4">
        Run a Battle to lay out its defender.
      </p>
    );
  return (
    <div className="flex min-h-0 flex-1">
      <LayoutMap
        content={props.content}
        layout={{
          ...layout,
          setSites: props.setup.layout.sites,
          setStarts: props.setup.layout.starts,
        }}
        buildings={props.setup.sides[1].buildings}
        editable
        onChange={(sites, starts) => props.onChange({ sites, starts })}
      />
    </div>
  );
}

function defaultSetup(content: ContentLookups): LabSetup {
  const kit = (faction: string, defend: boolean): LabSide => {
    const f = content.factions.get(faction);
    const units = new Map<string, number>();
    for (const e of f?.startingKit.stacks.flat() ?? [])
      units.set(e.unit, (units.get(e.unit) ?? 0) + e.count);
    return {
      faction,
      units: [...units].map(([unit, count]) => ({ unit, count })),
      buildings: defend ? [...(f?.startingKit.buildings ?? [])] : [],
      command: false,
    };
  };
  const factions = playable(content);
  return {
    preset: "",
    archetype: "",
    plan: "",
    neutral: false,
    raid: false,
    seed: 1,
    sides: [
      kit(factions[0] ?? "", false),
      kit(factions[1] ?? factions[0] ?? "", true),
    ],
    layout: { sites: [], starts: new Map() },
  };
}

const playable = (content: ContentLookups) =>
  [...content.factions]
    .filter(([, f]) => !f.hidden)
    .map(([id]) => id)
    .sort();

const nameOf = (content: ContentLookups, id: string) =>
  (id === COMMAND_POST ? "Command Post" : undefined) ??
  content.units.get(id)?.name ??
  content.buildings.get(id)?.name ??
  id;

/** "1:05" */
const clock = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

function Header(props: {
  conn: LabConnection;
  content: ContentLookups;
  setup: LabSetup;
  tab: "battle" | "duels";
  onTab: (tab: "battle" | "duels") => void;
}) {
  const { conn, content, setup } = props;
  const st = useStore(conn.store);
  const [log, setLog] = useState<{
    map: string;
    battles: { label: string; data: unknown }[];
  } | null>(null);
  const [pick, setPick] = useState(0);
  const fighting = (st.tick - st.setupTicks) / st.rate;
  const name = (f: string) => content.factions.get(f)?.name ?? f;

  async function loadLog(file: File) {
    let map = "";
    const battles: { label: string; data: unknown }[] = [];
    for (const line of (await file.text()).split("\n")) {
      if (!line.trim()) continue;
      let l: { kind: string; time: number; data: Record<string, unknown> };
      try {
        l = JSON.parse(line);
      } catch {
        continue; // a line cut off by a server still writing, or killed
      }
      if (l.kind === "match") map = String(l.data.map);
      if (l.kind === "battle") {
        const d = l.data;
        battles.push({
          label: `${Math.round(l.time / 1000)} s · ${d.planet} · Seat ${d.attacker} attacks ${Number(d.defender) < 0 ? "neutral" : `Seat ${d.defender}`} · winner ${d.winner}`,
          data: d,
        });
      }
    }
    setLog({ map, battles });
    setPick(0);
  }

  return (
    <header className="border-line bg-bar flex flex-wrap items-center gap-4 border-b px-5 py-2.5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-lg font-bold tracking-[0.06em]">
          BATTLE LAB
        </span>
        <span className="border-accent text-accent rounded border px-1.5 font-mono text-[11px]">
          DEV
        </span>
      </div>
      <Segmented
        value={props.tab}
        options={[
          ["battle", "Battle"],
          ["duels", "Duels"],
        ]}
        onChange={props.onTab}
      />
      <span aria-hidden="true" className="bg-line h-6 w-px" />
      <span className="text-ink-3">
        {name(setup.sides[0].faction)} attacks {name(setup.sides[1].faction)} ·
        seed <span className="text-ink font-mono">{setup.seed}</span>
        {st.archetype && ` · ${st.archetype}`}
        {st.generator && ` · ${st.generator}`}
      </span>
      <span className="flex-1" />
      <fieldset
        aria-label="Run controls"
        className="m-0 flex items-center gap-1.5 border-0 p-0"
      >
        <button
          type="button"
          disabled={!st.field}
          onClick={() => conn.control({ restart: true })}
          className={button}
        >
          Restart
        </button>
        <button
          type="button"
          disabled={!st.field || st.over}
          onClick={() => conn.control({ paused: !st.paused })}
          className="bg-accent text-accent-ink min-h-9 min-w-16 rounded-md border-0 font-semibold disabled:opacity-40"
        >
          {st.paused ? "Run" : "Pause"}
        </button>
        <button
          type="button"
          disabled={!st.field || st.over}
          onClick={() => conn.control({ step: 1 })}
          className={cn(button, "bg-raised")}
        >
          Step +1
        </button>
        <Segmented
          value={st.speed}
          options={SPEEDS.map((s) => [s, s === 0.5 ? "½×" : `${s}×`])}
          onChange={(speed) => conn.control({ speed })}
        />
      </fieldset>
      <div className="flex flex-col items-end font-mono leading-tight">
        <span>
          {st.tick < st.setupTicks
            ? `setup ${clock((st.setupTicks - st.tick) / st.rate)}`
            : clock(fighting)}
          <span className="text-ink-4">
            {" "}
            / {clock(content.rules.battle.timeCap)}
          </span>
        </span>
        <span className="text-ink-3 text-[11px]">
          tick {st.tick}
          {st.over &&
            (st.reason === "draw"
              ? " · over: a draw"
              : ` · over: ${st.winner} wins (${st.reason})`)}
        </span>
      </div>
      <label className={cn(button, "flex cursor-pointer items-center")}>
        Load replay…
        <input
          type="file"
          accept=".jsonl,application/x-ndjson,application/json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadLog(f);
            e.target.value = "";
          }}
        />
      </label>
      {log && (
        <div className="flex w-full items-center gap-2">
          <span className={tag}>REPLAY · {log.map}</span>
          <select
            aria-label="Battle from the log"
            value={pick}
            onChange={(e) => setPick(Number(e.target.value))}
            className="min-h-8 min-w-0 flex-1 rounded-md px-2"
          >
            {log.battles.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a log's Battles in order
              <option key={i} value={i}>
                {b.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={log.battles.length === 0}
            onClick={() => conn.replay(log.map, log.battles[pick]?.data)}
            className={cn(button, "bg-raised")}
          >
            Replay it
          </button>
          <button type="button" onClick={() => setLog(null)} className={button}>
            Close
          </button>
        </div>
      )}
      {st.error && <p className="text-danger w-full">{st.error}</p>}
    </header>
  );
}

function SetupPanel(props: {
  content: ContentLookups;
  setup: LabSetup;
  onChange: (s: LabSetup) => void;
  onRun: () => void;
}) {
  const { content, setup, onChange } = props;
  const factions = playable(content);
  const setSide = (i: 0 | 1, side: LabSide) =>
    onChange({
      ...setup,
      sides: (i === 0 ? [side, setup.sides[1]] : [setup.sides[0], side]) as [
        LabSide,
        LabSide,
      ],
    });
  return (
    <aside
      aria-label="Setup"
      className="border-line bg-panel flex w-80 flex-none flex-col gap-4 overflow-y-auto border-r p-4"
    >
      <section className="flex flex-col gap-2.5">
        <h2 className={title}>BATTLEFIELD</h2>
        <label className="flex flex-col gap-1">
          <span className="text-ink-3 text-xs">Terrain Preset</span>
          <select
            value={setup.preset}
            onChange={(e) => onChange({ ...setup, preset: e.target.value })}
            className="min-h-9 rounded-md px-2"
          >
            <option value="">
              The Ruleset's ({content.rules.battlefield.terrainPreset})
            </option>
            {[...content.terrainPresets.keys()].sort().map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-3 text-xs">Archetype</span>
          <select
            value={setup.archetype}
            onChange={(e) => onChange({ ...setup, archetype: e.target.value })}
            className="min-h-9 rounded-md px-2"
          >
            <option value="">From the preset</option>
            {["open", "river", "ridge", "ruins"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-3 text-xs">Layout</span>
          <select
            value={setup.plan}
            onChange={(e) => onChange({ ...setup, plan: e.target.value })}
            className="min-h-9 rounded-md px-2"
          >
            <option value="">Any: the seed picks</option>
            {[...content.layouts]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([id, l]) => (
                <option key={id} value={id}>
                  {l.name ?? id}
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={setup.neutral}
            onChange={(e) => onChange({ ...setup, neutral: e.target.checked })}
          />
          <span>Defender is a neutral garrison (its base)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={setup.raid}
            onChange={(e) => onChange({ ...setup, raid: e.target.checked })}
          />
          <span>Raid: the attacker is after the buildings</span>
        </label>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-ink-3 text-xs">Seed</span>
            <input
              type="number"
              min={0}
              value={setup.seed}
              onChange={(e) =>
                onChange({
                  ...setup,
                  seed: Math.max(0, Math.floor(e.target.valueAsNumber || 0)),
                })
              }
              className="min-h-9 rounded-md px-2 font-mono"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...setup,
                seed: Math.floor(Math.random() * 1_000_000),
              })
            }
            className={cn(button, "bg-raised")}
          >
            Random
          </button>
        </div>
      </section>
      {([0, 1] as const).map((i) => {
        const side = setup.sides[i];
        const units = [...content.units]
          .filter(([, u]) => u.faction === side.faction)
          .sort(([a], [b]) => (a < b ? -1 : 1));
        return (
          <section
            key={i}
            className="border-divider flex flex-col gap-2 border-t pt-3.5"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: seatColour(i) }}
              />
              <h2 className={cn(title, "flex-1")}>
                {i === 0 ? "ATTACKER" : "DEFENDER"}
              </h2>
              <Segmented
                value={side.command ? "you" : "ai"}
                options={[
                  ["ai", "AI"],
                  ["you", "You command"],
                ]}
                onChange={(v) => setSide(i, { ...side, command: v === "you" })}
              />
            </div>
            <select
              aria-label="Faction"
              value={side.faction}
              onChange={(e) =>
                setSide(i, { ...side, faction: e.target.value, units: [] })
              }
              className="min-h-9 rounded-md px-2"
            >
              {factions.map((f) => (
                <option key={f} value={f}>
                  {content.factions.get(f)?.name ?? f}
                </option>
              ))}
            </select>
            <ul className="flex flex-col gap-1">
              {side.units.map((u, k) => {
                const set = (count: number) =>
                  setSide(i, {
                    ...side,
                    units:
                      count > 0
                        ? side.units.map((x, j) =>
                            j === k ? { ...x, count } : x,
                          )
                        : side.units.filter((_, j) => j !== k),
                  });
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: rows can repeat a unit
                    key={k}
                    className="bg-item flex items-center gap-2 rounded-md py-1 pr-1.5 pl-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {nameOf(content, u.unit)}
                    </span>
                    <button
                      type="button"
                      aria-label="Fewer"
                      onClick={() => set(u.count - 1)}
                      className="border-edge size-7 rounded border bg-transparent p-0"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-mono">{u.count}</span>
                    <button
                      type="button"
                      aria-label="More"
                      onClick={() => set(u.count + 1)}
                      className="border-edge size-7 rounded border bg-transparent p-0"
                    >
                      +
                    </button>
                  </li>
                );
              })}
            </ul>
            <select
              aria-label="Add a unit"
              value=""
              onChange={(e) =>
                e.target.value &&
                setSide(i, {
                  ...side,
                  units: [...side.units, { unit: e.target.value, count: 1 }],
                })
              }
              className="text-ink-2 min-h-8 rounded-md border-dashed px-2"
            >
              <option value="">+ Unit</option>
              {units.map(([id, u]) => (
                <option key={id} value={id}>
                  {u.name}
                </option>
              ))}
            </select>
            {i === 1 && (
              <p className="text-ink-3 text-xs">
                Buildings:{" "}
                {side.buildings.length
                  ? side.buildings.map((b) => nameOf(content, b)).join(", ")
                  : "none"}{" "}
                (the Starting Kit's)
              </p>
            )}
            <p className="text-ink-3 text-xs">
              AI weights:{" "}
              {content.factions.get(side.faction)?.name ?? side.faction}'s
            </p>
          </section>
        );
      })}
      <span className="flex-1" />
      <button
        type="button"
        onClick={props.onRun}
        className="bg-accent text-accent-ink font-display min-h-11 flex-none rounded-lg border-0 font-bold tracking-[0.1em]"
      >
        RUN THIS SETUP
      </button>
    </aside>
  );
}

/** The Lab's overlays switched on. */
type Show = {
  forces: boolean;
  targets: boolean;
  routes: boolean;
};

/** The layout's lanes as they wind, each Task Force's line from its stage to its goal, and each target line. */
function overlays(
  thinking: (Thinking | null)[],
  squads: Squad[],
  show: Show,
  routes: { from: { x: number; y: number }; to: { x: number; y: number } }[],
): OverlayLine[] {
  const at = new Map(squads.map((s) => [s.id, s]));
  const out: OverlayLine[] = [];
  if (show.routes)
    for (const r of routes) out.push({ ...r, colour: "#facc15", dashed: true });
  for (const th of thinking) {
    for (const [i, tf] of (th?.forces ?? []).entries()) {
      const colour = FORCE_COLOURS[i % FORCE_COLOURS.length] ?? "#f0a93b";
      if (show.forces) {
        out.push({
          from: { x: tf.stage.X, y: tf.stage.Y },
          to: { x: tf.cell.X, y: tf.cell.Y },
          colour,
          dashed: true,
        });
      }
      const target = tf.firesOn ? at.get(tf.firesOn) : undefined;
      if (show.targets && target) {
        for (const m of tf.members) {
          const sq = at.get(m);
          if (sq) out.push({ from: sq, to: target, colour: "#f08a7a" });
        }
      }
    }
  }
  return out;
}

function Field(props: {
  conn: LabConnection;
  content: ContentLookups;
  fog: Fog;
  show: Show;
  selected: number | null;
  onPick: (id: number | null) => void;
  factions: [string, string]; // each side's, for its pad turrets
  view: "2d" | "3d"; // which drawing: the Battle window's is the 3D one
}) {
  const { conn, content } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [padMenu, setPadMenu] = useState<{
    pad: number;
    x: number;
    y: number;
    side: Side | null;
  } | null>(null);
  const scene = useRef<BattlefieldDrawing | null>(null);
  const field = useStore(conn.store, (s) => s.field);
  const battle = useStore(conn.store, (s) => s.battle);
  const thinking = useStore(conn.store, (s) => s.thinking);
  const routes = useStore(conn.store, (s) => s.routes);
  const { onPick } = props;
  // A side with no AI is yours to command from the map; with both, the one
  // picked to order.
  const commanded = useStore(conn.store, (s) => s.commanded);
  const [ordering, setOrdering] = useState<Side>("attacker");
  const both = commanded[0] && commanded[1];
  const commandSide: Side | null = !battle
    ? null
    : both
      ? ordering
      : commanded[0]
        ? "attacker"
        : commanded[1]
          ? "defender"
          : null;
  const [picked, setPicked] = useState<number[]>([]);
  const order = useCallback(
    (ids: number[], o: SquadOrder) =>
      commandSide && conn.order(commandSide, ids, o),
    [conn, commandSide],
  );
  useCommandKeys(!!commandSide, picked, scene, order);

  useEffect(() => {
    if (!ref.current || !field) return;
    const rules = content.rules.battle;
    const flies = (sq: Squad) =>
      !!content.unitClasses.get(classOf(content, sq.unit))?.air;
    const look: BattlefieldLook = {
      terrainColour: (t: string) =>
        content.terrains.get(t)?.colour ?? "#555555",
      sideColour: { attacker: seatColour(0), defender: seatColour(1) },
      you: null,
      sight: (sq, height) =>
        (statsOf(content, sq.unit)?.sight ??
          rules.classDefaults[classOf(content, sq.unit)]?.sight ??
          0) + (flies(sq) ? 0 : rules.heightSight * height),
      flies,
      padSight: rules.padSight,
      captureRadius: rules.captureRadius,
      captureTicks: rules.captureSeconds * 5,
    };
    const s: BattlefieldDrawing =
      props.view === "3d"
        ? new Battlefield3DScene(ref.current, field, {
            ...look,
            ...look3D(content),
          })
        : new BattlefieldScene(ref.current, field, look);
    s.onPick = onPick;
    s.onSelect = (ids) => {
      setPicked(ids);
      onPick(ids[0] ?? null); // the card shows the first
    };
    scene.current = s;
    const onVolleys = (e: Event) => s.fire((e as CustomEvent<Volley[]>).detail);
    conn.events.addEventListener("volleys", onVolleys);
    return () => {
      conn.events.removeEventListener("volleys", onVolleys);
      s.dispose();
      scene.current = null;
    };
  }, [conn, content, field, onPick, props.view]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: view: a new scene takes the Battle too
  useEffect(() => {
    if (battle) scene.current?.update(battle);
  }, [battle, props.view]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: field, view: a new scene takes the setting too
  useEffect(() => {
    scene.current?.setFog(props.fog === "none" ? false : props.fog);
  }, [props.fog, field, props.view]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: view: a new scene takes the overlays too
  useEffect(() => {
    scene.current?.overlay(
      overlays(thinking, battle?.squads ?? [], props.show, routes),
    );
  }, [thinking, battle, props.show, props.view, routes]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: field, view: a new scene takes the selection too
  useEffect(() => {
    scene.current?.select(props.selected);
  }, [props.selected, field, props.view]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: field, view: a new scene takes it too
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.onOrder = order;
    s.command(commandSide);
    // Tagged with the side it's for: one from before a change never shows.
    s.onPadMenu = (pad, x, y) => setPadMenu({ pad, x, y, side: commandSide });
  }, [commandSide, order, field, props.view]);

  return (
    <div className="border-line flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target for a Dropship dragged from the list; without a drag the AI sends it after landingDelay */}
      <div
        className="bg-void relative min-h-0 flex-1 overflow-hidden"
        onDragOver={(e) => {
          if (commandSide && e.dataTransfer.types.includes(DROP_DRAG))
            e.preventDefault();
        }}
        onDrop={(e) => {
          const drop = Number(e.dataTransfer.getData(DROP_DRAG));
          const point = scene.current?.pointAt(e.clientX, e.clientY);
          if (!commandSide || point == null) return;
          e.preventDefault();
          conn.land(commandSide, drop, point);
        }}
      >
        <div ref={ref} className="size-full" />
        {!field && (
          <p className="text-ink-3 absolute inset-0 flex items-center justify-center">
            Set up a Battle and press Run this setup, or load a replay.
          </p>
        )}
        {props.selected !== null && battle && (
          <SquadCard
            conn={conn}
            content={content}
            id={props.selected}
            onClose={() => onPick(null)}
          />
        )}
      </div>
      {padMenu && commandSide && padMenu.side === commandSide && battle && (
        <PadMenu
          at={padMenu}
          pad={battle.pads[padMenu.pad]}
          tick={battle.tick}
          tickRate={battle.tickRate}
          yours={battle.pads[padMenu.pad]?.owner === commandSide}
          turrets={[...content.buildings.entries()].filter(
            ([, b]) =>
              b.padTurret &&
              b.combat &&
              b.faction === props.factions[commandSide === "attacker" ? 0 : 1],
          )}
          afford={() => true} // the Lab's funds are the server's to check
          sent={false}
          content={content}
          onBuild={(id) => conn.build(commandSide, padMenu.pad, id)}
          onClose={() => setPadMenu(null)}
        />
      )}
      {battle &&
        SIDES.map((side) => (
          <Reinforcements
            key={side}
            title={side === "attacker" ? "Atk orbit" : "Def orbit"}
            battle={battle}
            side={side}
            commanding={side === commandSide}
            name={(u) => nameOf(content, u)}
          />
        ))}
      {both && battle && (
        <fieldset
          aria-label="Side to order"
          className="m-0 flex items-center gap-1.5 border-0 px-4 pt-2"
        >
          <span className={tag}>ORDERS</span>
          <Segmented
            value={ordering}
            options={[
              ["attacker", "Attacker"],
              ["defender", "Defender"],
            ]}
            onChange={setOrdering}
          />
          <span className="text-ink-3 text-xs">
            You command both: the map orders this side
          </span>
        </fieldset>
      )}
      {commandSide && (
        <SelectionStrip
          squads={battle?.squads ?? []}
          picked={picked}
          name={(u) => nameOf(content, u)}
          onAttackMove={() => scene.current?.armAttackMove()}
          onHold={() => order(picked, { kind: "hold" })}
        />
      )}
    </div>
  );
}

/** The selected squad: what it is, the goal it took and why, its Task Force. */
function SquadCard(props: {
  conn: LabConnection;
  content: ContentLookups;
  id: number;
  onClose: () => void;
}) {
  const battle = useStore(props.conn.store, (s) => s.battle);
  const thinking = useStore(props.conn.store, (s) => s.thinking);
  const sq = battle?.squads.find((s) => s.id === props.id);
  if (!sq) return null;
  const th = thinking[sq.side === "attacker" ? 0 : 1];
  const choice = th?.choices?.find((c) => c.squad === sq.id);
  const goal = choice && th?.goals?.[choice.goal];
  const tfIndex = th?.forces?.findIndex((f) => f.members.includes(sq.id)) ?? -1;
  const tf = tfIndex >= 0 ? th?.forces?.[tfIndex] : undefined;
  return (
    <div className="border-edge bg-panel absolute top-3 right-3 flex w-64 flex-col gap-1 rounded-lg border px-3 py-2.5 shadow-[0_12px_32px_#000a]">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ background: seatColour(sq.side === "attacker" ? 0 : 1) }}
        />
        <strong className="min-w-0 flex-1 truncate">
          {nameOf(props.content, sq.unit)} #{sq.id}
        </strong>
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          className="text-ink-3 size-6 border-0 bg-transparent p-0"
        >
          ✕
        </button>
      </div>
      <span className="text-ink-3">
        {sq.count} of {sq.start} left · at ({sq.x},{sq.y})
      </span>
      {goal ? (
        <>
          <span>
            Goal <strong className="text-accent">{goalText(goal)}</strong> ·
            score {choice.score.toFixed(2)}
          </span>
          <span className="text-ink-3 text-xs">Why: {choice.why}</span>
        </>
      ) : (
        <span className="text-ink-3">
          {th ? "No goal this pass (a role, or setup)." : "Commanded: no AI."}
        </span>
      )}
      {tf && (
        <span className="text-ink-3 text-xs">
          In TF {tfIndex + 1} · {tf.going ? "going in" : "gathering"} at (
          {tf.stage.X},{tf.stage.Y})
        </span>
      )}
    </div>
  );
}

const goalText = (g: {
  goal: string;
  cell: { X: number; Y: number };
  target?: number;
}) =>
  g.target ? `${g.goal} #${g.target}` : `${g.goal} (${g.cell.X},${g.cell.Y})`;

function Status(props: { conn: LabConnection; content: ContentLookups }) {
  const battle = useStore(props.conn.store, (s) => s.battle);
  if (!battle) return <div className="h-18 flex-none" />;
  const left = (side: Side) => {
    const qs = battle.squads.filter((q) => q.side === side && !q.building);
    const start = qs.reduce((n, q) => n + q.start, 0);
    return start ? qs.reduce((n, q) => n + q.count, 0) / start : 0;
  };
  return (
    <div className="flex h-18 flex-none gap-2.5">
      <div className="border-line bg-panel flex flex-1 flex-col gap-1 rounded-lg border px-3 py-2">
        <span className={tag}>OBJECTIVE</span>
        <span>
          {battle.points.map((p, i) => (
            <span key={`${p.x},${p.y}`} className="mr-3">
              <span
                style={{
                  color: p.owner
                    ? seatColour(p.owner === "attacker" ? 0 : 1)
                    : "var(--color-ink-4)",
                }}
              >
                ●
              </span>{" "}
              LZ {POINT_NAMES[i]}
              {p.progress > 0 && (
                <span className="text-ink-3"> ({p.taker} taking)</span>
              )}
            </span>
          ))}
          <span className="font-mono">
            Command Post{" "}
            {Math.round(
              commandPostHealth(
                battle,
                props.content.rules.battle.commandPost,
              ) * 100,
            )}
            %
          </span>
        </span>
      </div>
      <div className="border-line bg-panel flex flex-1 flex-col gap-1 rounded-lg border px-3 py-2">
        <span className={tag}>STRENGTH LEFT</span>
        {SIDES.map((side, i) => (
          <div key={side} className="flex items-center gap-2 text-xs">
            <span className="w-16 capitalize">{side}</span>
            <span className="bg-line h-2 flex-1 overflow-hidden rounded">
              <span
                className="block h-full"
                style={{
                  width: `${left(side) * 100}%`,
                  background: seatColour(i),
                }}
              />
            </span>
            <span className="w-9 text-right font-mono">
              {Math.round(left(side) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiPanel(props: {
  conn: LabConnection;
  content: ContentLookups;
  side: 0 | 1;
  onSide: (s: 0 | 1) => void;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const { conn, content, side } = props;
  const th = useStore(conn.store, (s) => s.thinking[side]);
  const log = useStore(conn.store, (s) => s.log);
  const [onlySelected, setOnlySelected] = useState(true);
  const filtered = log.filter(
    (d: LabDecision) =>
      d.side === side &&
      (!onlySelected || props.selected === null || d.squad === props.selected),
  );
  const goals = [...(th?.goals ?? [])].sort(
    (a, b) => b.squads - a.squads || b.value - a.value,
  );
  return (
    <aside
      aria-label="What the AI is thinking"
      className="border-line bg-panel flex w-90 flex-none flex-col border-l"
    >
      <div
        role="tablist"
        aria-label="AI side"
        className="border-line flex border-b"
      >
        {(["Attacker AI", "Defender AI"] as const).map((label, i) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={side === i}
            onClick={() => props.onSide(i as 0 | 1)}
            className={cn(
              "min-h-10 flex-1 rounded-none border-0 border-b-2 bg-transparent",
              side === i ? "border-accent" : "text-ink-3 border-transparent",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {!th ? (
        <p className="text-ink-3 p-4">
          No AI on this side: it's yours to command, or nothing is running.
        </p>
      ) : (
        <>
          <section className="border-divider flex max-h-56 flex-none flex-col gap-2 overflow-y-auto border-b px-3.5 py-3">
            <h2 className={title}>TASK FORCES</h2>
            {(th.forces ?? []).length === 0 && (
              <p className="text-ink-3">None formed.</p>
            )}
            {(th.forces ?? []).map((tf, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: two Task Forces can share a goal
                key={`${tf.goal}-${tf.cell.X}-${tf.cell.Y}-${tf.target}-${i}`}
                className="bg-item flex flex-col gap-0.5 rounded-md px-2.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-0.75 w-2.5"
                    style={{
                      background: FORCE_COLOURS[i % FORCE_COLOURS.length],
                    }}
                  />
                  <strong>TF {i + 1}</strong>
                  <span className="flex-1" />
                  <span className="text-ink-3 font-mono text-xs">
                    {tf.going ? "going in" : "gathering"}
                  </span>
                </div>
                <span className="text-ink-2">
                  {goalText(tf)}
                  {tf.firesOn ? ` · fires on #${tf.firesOn}` : ""}
                </span>
                <span className="text-ink-3 text-xs">
                  {tf.members.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => props.onSelect(m)}
                      className="text-accent mr-1.5 border-0 bg-transparent p-0"
                    >
                      #{m}
                    </button>
                  ))}
                  · stage ({tf.stage.X},{tf.stage.Y})
                </span>
              </div>
            ))}
          </section>
          <section className="border-divider flex max-h-56 flex-none flex-col gap-1.5 overflow-y-auto border-b px-3.5 py-3">
            <h2 className={title}>
              COMMANDER'S GOALS{" "}
              <span className="text-ink-3 font-sans text-xs font-normal tracking-normal">
                · tick {th.tick}
              </span>
            </h2>
            <table className="text-xs">
              <thead className="text-ink-3 text-left">
                <tr>
                  <th className="font-normal">Goal</th>
                  <th className="text-right font-normal">Worth</th>
                  <th className="text-right font-normal">Threat</th>
                  <th className="text-right font-normal">Squads</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={`${g.goal}-${g.cell.X}-${g.cell.Y}-${g.target}`}>
                    <td className="py-0.5">{goalText(g)}</td>
                    <td className="text-right font-mono">
                      {g.value.toFixed(2)}
                    </td>
                    <td className="text-right font-mono">
                      {g.threat.toFixed(0)}
                    </td>
                    <td className="text-right font-mono">{g.squads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <section className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 py-3">
        <div className="flex items-center gap-2">
          <h2 className={cn(title, "flex-1")}>DECISIONS</h2>
          <label className="text-ink-3 flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={(e) => setOnlySelected(e.target.checked)}
            />
            {props.selected === null
              ? "Selected squad only"
              : `#${props.selected} only`}
          </label>
        </div>
        <ol className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto font-mono text-xs">
          {filtered.map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows at the front
            <li key={`${d.tick}-${d.squad}-${i}`}>
              <button
                type="button"
                onClick={() => props.onSelect(d.squad)}
                className="bg-well grid w-full grid-cols-[40px_minmax(0,1fr)] gap-2 rounded border-0 px-1.5 py-1 text-left"
              >
                <span className="text-ink-4">{d.tick}</span>
                <span className="truncate">
                  #{d.squad} {nameOf(content, d.unit)} →{" "}
                  {d.target
                    ? `${d.goal} #${d.target}`
                    : `${d.goal} (${d.cell.X},${d.cell.Y})`}
                  {d.role ? ` (${d.role})` : ""}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <span className="text-ink-3 text-xs">
          Click a squad on the map, or a line here, to select it.
        </span>
      </section>
    </aside>
  );
}

/**
 * Sends a test Dropship for either side: it waits in orbit, then the AI
 * sends it after landingDelay, or you drag it onto a Landing Zone for a side
 * you command.
 */
function Reinforce(props: {
  conn: LabConnection;
  content: ContentLookups;
  setup: LabSetup;
}) {
  const { content } = props;
  const running = useStore(props.conn.store, (s) => !!s.battle && !s.over);
  const [side, setSide] = useState<0 | 1>(0);
  const ships = [...content.units].filter(([, u]) => u.carry);
  const [ship, setShip] = useState(ships[0]?.[0] ?? "");
  const faction = props.setup.sides[side].faction;
  const troops = [...content.units].filter(
    ([, u]) => !u.carry && u.faction === faction,
  );
  const [unit, setUnit] = useState("");
  const [count, setCount] = useState(4);
  const cargo = troops.some(([id]) => id === unit)
    ? unit
    : (troops[0]?.[0] ?? "");
  const select = "border-edge bg-well min-h-8 rounded-md px-2";
  return (
    <fieldset
      aria-label="Reinforce"
      className="m-0 flex items-center gap-1.5 border-0 p-0"
    >
      <span className={tag}>REINFORCE</span>
      <Segmented
        value={side}
        options={[
          [0, "Attacker"],
          [1, "Defender"],
        ]}
        onChange={setSide}
      />
      <select
        aria-label="Dropship"
        value={ship}
        onChange={(e) => setShip(e.target.value)}
        className={select}
      >
        {ships.map(([id, u]) => (
          <option key={id} value={id}>
            {u.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Troops"
        value={cargo}
        onChange={(e) => setUnit(e.target.value)}
        className={select}
      >
        {troops.map(([id, u]) => (
          <option key={id} value={id}>
            {u.name}
          </option>
        ))}
      </select>
      <input
        aria-label="How many"
        type="number"
        min={1}
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
        className={cn(select, "w-16")}
      />
      <button
        type="button"
        disabled={!running || !ship || !cargo}
        onClick={() =>
          props.conn.arrive(SIDES[side], ship, [{ unit: cargo, count }])
        }
        className="border-edge bg-raised min-h-8 rounded-md px-3 disabled:opacity-50"
      >
        Send
      </button>
    </fieldset>
  );
}
