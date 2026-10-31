import { Feedback } from "@dnd-kit/dom";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { Building } from "../gen/content";
import { progress, seatColour } from "../scene/galaxy";
import { Tooltip } from "../ui/tooltip";
import {
  amounts,
  BuildingInfo,
  factsOf,
  RICHNESS,
  ROLES,
  type Role,
  RoleIcon,
  roleOf,
} from "./buildings";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { laneTimes } from "./route";
import { freeCell, moveSlot } from "./stacks";
import { ConfirmDialog } from "./status";
import type { PlanetView, QueueItem, UnitSlot, View } from "./store";
import { heldTechs, listed, needsTech } from "./tech";
import { THREAT_LEVELS, threat } from "./threat";
import { formatAge, useMatchNow } from "./time";

// The play screen's floating windows: the selected Planet, its Stacks, and
// the selected Army. Each can be dragged by its title bar.

export const label =
  "font-mono text-[11px] text-ink-3 uppercase tracking-[0.08em]";
const smallButton =
  "min-h-7 rounded border-edge bg-transparent px-2.5 text-xs disabled:cursor-default";

/** Up to three letters standing in for a unit or building icon. */
export const abbr = (name: string) =>
  name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();

const addInto = (into: Map<string, number>, a: Record<string, number>) => {
  for (const [r, n] of Object.entries(a)) into.set(r, (into.get(r) ?? 0) + n);
};

type Producer = {
  yield: Record<string, number>;
  extracts?: Record<string, number>;
};

/**
 * What a building makes at Payday on a Planet: its flat yield plus what it
 * extracts times the Planet's Richness, rounded down as the server does.
 */
const outputOf = (b: Producer, richness: Map<string, string>) => {
  const out = new Map<string, number>();
  addInto(out, b.yield);
  for (const [r, n] of Object.entries(b.extracts ?? {}))
    out.set(
      r,
      (out.get(r) ?? 0) +
        Math.floor(n * (RICHNESS[richness.get(r) ?? ""] ?? 0)),
    );
  return Object.fromEntries(out);
};

/**
 * A building's output on a Planet, with the Richness that scaled an
 * extractor's: "+90 Materials · rich ×1.5". "" when it makes nothing.
 */
const outputText = (
  content: ContentLookups,
  b: Producer,
  richness: Map<string, string>,
) => {
  const out = amounts(content, outputOf(b, richness));
  const levels = Object.keys(b.extracts ?? {}).map(
    (r) => richness.get(r) ?? "none",
  );
  if (!levels.length) return out && `+${out}`;
  return `+${out || "0"} · ${levels.map((l) => `${l} ×${RICHNESS[l] ?? 0}`).join(", ")}`;
};

/**
 * What queuing costs the viewer now, as the server charges it: each Planet
 * they own beyond the Ruleset's free ones adds its percent, rounded to the
 * nearest whole amount.
 */
const sprawled = (
  content: ContentLookups,
  view: View | null,
  cost: Record<string, number>,
) => {
  const { freePlanets, percent } = content.rules.sprawl;
  let owned = 0;
  for (const p of view?.planets.values() ?? [])
    if (p.owner === view?.you) owned++;
  const total = 100 + Math.max(0, owned - freePlanets) * percent;
  return Object.fromEntries(
    Object.entries(cost).map(([r, n]) => [
      r,
      Math.floor((n * total + 50) / 100),
    ]),
  );
};

const playerName = (view: View, seat: number | null) =>
  seat === null
    ? "Neutral"
    : view.players[seat]?.displayName || `Player ${seat + 1}`;

type Point = { x: number; y: number };

/** Where windows with a `remember` key were last left, for this page load. */
const remembered = new Map<string, Point>();

/**
 * A window over the map, dragged by its title bar and kept inside the map.
 * `start` is a point, or measures the map and the window once it's laid out.
 * With `remember`, it reopens where it was last left.
 */
export function Floating(props: {
  label: string;
  title: ReactNode;
  start: Point | ((map: HTMLElement, self: HTMLElement) => Point);
  remember?: string;
  id?: string;
  onClose: () => void;
  tools?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // A known point is set on the first render, so a window measuring this one
  // in the same commit sees where it is.
  const [pos, setPos] = useState<Point | null>(
    () =>
      (props.remember && remembered.get(props.remember)) ||
      (typeof props.start === "function" ? null : props.start),
  );
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: placed once, on opening
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (pos || !el || !parent || typeof props.start !== "function") return;
    setPos(props.start(parent, el));
  }, []);

  const moveTo = (x: number, y: number) => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    // Keep enough of the title bar on the map to grab it again.
    const p = {
      x: Math.min(Math.max(x, 0), parent.clientWidth - 80),
      y: Math.min(Math.max(y, 0), parent.clientHeight - 40),
    };
    setPos(p);
    if (props.remember) remembered.set(props.remember, p);
  };

  return (
    <section
      ref={ref}
      id={props.id}
      aria-label={props.label}
      style={pos ? { left: pos.x, top: pos.y } : { visibility: "hidden" }}
      className={`border-edge bg-panel/95 absolute z-10 flex max-h-[calc(100%-32px)] flex-col rounded-lg border shadow-[0_12px_32px_#000a] ${props.className ?? ""}`}
    >
      <div
        onPointerDown={(e) => {
          if (!pos || (e.target as Element).closest("button, select")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) moveTo(e.clientX - d.dx, e.clientY - d.dy);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        className="border-line bg-bar flex h-10 flex-none cursor-move touch-none items-center gap-2.5 rounded-t-lg border-b pr-2 pl-3 select-none"
      >
        <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
          <g fill="var(--color-ink-4)">
            {[3, 8, 13].map((cy) => (
              <g key={cy}>
                <circle cx="2" cy={cy} r="1.4" />
                <circle cx="8" cy={cy} r="1.4" />
              </g>
            ))}
          </g>
        </svg>
        {props.title}
        <span className="flex-1" />
        {props.tools}
        <button
          type="button"
          aria-label={`Close ${props.label}`}
          onClick={props.onClose}
          className="text-ink-3 size-7 border-0 bg-transparent p-0"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto">{props.children}</div>
    </section>
  );
}

export const windowTitle = "font-display font-semibold text-lg";

export function Tag(props: { className: string; children: ReactNode }) {
  return (
    <span className={`rounded px-1.5 py-px text-[11px] ${props.className}`}>
      {props.children}
    </span>
  );
}

/** The Planet the selection points at: live, or as last seen. */
function useSelectedPlanet(conn: MatchConnection, content: ContentLookups) {
  const selected = useStore(conn.local, (s) => s.selected);
  const view = useStore(conn.store, (s) => s.view);
  const lastSeen = useStore(conn.local, (s) => s.lastSeen);
  if (!selected || !view) return null;
  const mapPlanet = content.maps
    .get(view.map)
    ?.planets.find((p) => p.id === selected);
  const live = view.planets.get(selected);
  const last = live ? undefined : lastSeen.get(selected);
  return {
    id: selected,
    view,
    name: mapPlanet?.name ?? selected,
    type: content.planetTypes.get(mapPlanet?.type ?? ""),
    live,
    last,
    planet: live ?? last?.planet,
    mine: live?.owner === view.you,
    // Orders need your own Planet, and none run while it's Locked.
    editable: live?.owner === view.you && !live.locked,
  };
}

/** The selected Planet: a banner, Buildings and Units tabs, and its queues. */
export function PlanetWindow(props: {
  conn: MatchConnection;
  content: ContentLookups;
  stacksOpen: boolean;
  onOpenStacks: () => void;
}) {
  const { conn, content } = props;
  const sel = useSelectedPlanet(conn, content);
  const [tab, setTab] = useState<"buildings" | "units">("buildings");
  if (!sel) return null;
  const { view, planet, mine } = sel;

  return (
    <Floating
      label={`Planet: ${sel.name}`}
      start={{ x: 16, y: 16 }}
      remember="planet"
      id={PLANET_WINDOW}
      onClose={() => conn.local.setState({ selected: null })}
      className={mine ? "w-195" : "w-150"}
      title={
        <>
          <h2 className={windowTitle}>{sel.name}</h2>
          {planet?.capital && (
            <Tag className="bg-host-wash text-host">
              {mine ? "Your Capital" : "Capital"}
            </Tag>
          )}
          {sel.last && (
            <Tag className="bg-idle-wash text-idle">
              Last seen <LastSeenAge conn={conn} seenAt={sel.last.seenAt} /> ago
            </Tag>
          )}
          {sel.live?.locked && (
            <Tag className="bg-accent-wash text-accent">Locked</Tag>
          )}
        </>
      }
      tools={
        planet && (
          <button
            type="button"
            aria-pressed={props.stacksOpen}
            onClick={props.onOpenStacks}
            className="border-edge bg-raised flex min-h-7 items-center gap-1.5 rounded px-2.5 text-xs"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <g fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5">
                <rect x="1" y="1" width="12" height="3" rx="1" />
                <rect x="1" y="5.5" width="12" height="3" rx="1" />
                <rect x="1" y="10" width="12" height="3" rx="1" />
              </g>
            </svg>
            Stacks
          </button>
        )
      }
    >
      <Banner sel={sel} content={content} />
      {!planet ? (
        <p className="text-ink-3 p-4">Outside your vision.</p>
      ) : (
        <>
          <Alerts conn={conn} content={content} sel={sel} />
          {/* A fixed height: switching tabs or opening the build list never resizes the window. */}
          <div className="flex h-86 min-h-0">
            <section
              className={`flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3.5 ${sel.last ? "opacity-60" : ""}`}
            >
              {tab === "units" && mine ? (
                <UnitsTab
                  conn={conn}
                  content={content}
                  planet={planet}
                  faction={view.players[view.you]?.faction ?? ""}
                />
              ) : (
                <BuildingsTab
                  conn={conn}
                  content={content}
                  planet={planet}
                  editable={sel.editable}
                  faction={view.players[view.you]?.faction ?? ""}
                />
              )}
            </section>
            {mine && (
              <BuildQueue conn={conn} content={content} planet={planet} />
            )}
          </div>
          {mine && (
            <div
              role="tablist"
              aria-label="Planet views"
              className="border-line bg-bar flex rounded-b-lg border-t"
            >
              {(["buildings", "units"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`h-10 flex-1 rounded-none border-0 border-t-2 capitalize ${tab === t ? "border-accent bg-panel text-ink" : "text-ink-3 border-transparent bg-transparent"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Floating>
  );
}

type Selected = NonNullable<ReturnType<typeof useSelectedPlanet>>;

/** Planet art, its facts, and on your own Planets what it makes and costs. */
function Banner(props: { sel: Selected; content: ContentLookups }) {
  const { sel, content } = props;
  const { planet, view, type } = sel;
  const owner = planet?.owner ?? null;
  const ring = !planet
    ? "var(--color-ink-4)"
    : owner === null
      ? "#9ca3af"
      : seatColour(owner);

  const richness = planet?.richness ?? new Map<string, string>();
  const produces = new Map<string, number>();
  const upkeep = new Map<string, number>();
  const madeBy: string[] = [];
  const paidBy: string[] = [];
  if (type) {
    addInto(produces, type.income);
    madeBy.push(`Planet ${amounts(content, type.income)}`);
  }
  for (const id of planet?.buildings ?? []) {
    const b = content.buildings.get(id);
    if (!b) continue;
    addInto(produces, outputOf(b, richness));
    addInto(upkeep, b.upkeep);
    if (outputText(content, b, richness))
      madeBy.push(`${b.name} ${outputText(content, b, richness)}`);
    if (b.refines)
      madeBy.push(
        `${b.name} refines ${amounts(content, b.refines.input)} → ${amounts(content, b.refines.output)}`,
      );
    if (amounts(content, b.upkeep))
      paidBy.push(`${b.name} ${amounts(content, b.upkeep)}`);
  }
  const garrison = new Map<string, number>();
  for (const st of planet?.stacks ?? [])
    for (const s of st)
      garrison.set(s.unit, (garrison.get(s.unit) ?? 0) + s.count);
  for (const [id, n] of garrison) {
    const u = content.units.get(id);
    if (!u?.upkeep || !amounts(content, u.upkeep)) continue;
    addInto(
      upkeep,
      Object.fromEntries(Object.entries(u.upkeep).map(([r, a]) => [r, a * n])),
    );
    paidBy.push(`${n} ${u.name} ${amounts(content, u.upkeep, n)}`);
  }
  const used = planet?.buildings.filter(Boolean).length ?? 0;

  return (
    <div className="border-line bg-well flex items-center gap-4 border-b px-3.5 py-3">
      <svg width="72" height="72" viewBox="0 0 84 84" aria-hidden="true">
        <circle
          cx="42"
          cy="42"
          r="40"
          fill="none"
          stroke={ring}
          strokeWidth="2"
        />
        <circle cx="42" cy="42" r="33" fill="var(--color-raised)" />
        <path
          d="M18 34c10-6 20 2 30-3s14-2 17 4M14 50c12 4 22-4 34 1s12 2 20-2"
          fill="none"
          stroke="var(--color-edge)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <dl className="grid grid-cols-[auto_auto] items-center gap-x-3.5 gap-y-1 text-sm">
        {!sel.mine && planet && (
          <>
            <dt className={label}>Owner</dt>
            <dd className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: ring }}
              />
              {playerName(view, owner)}
            </dd>
          </>
        )}
        <dt className={label}>Type</dt>
        <dd>{type?.name ?? "?"}</dd>
        <dt className={label}>Slots</dt>
        <dd className="font-mono">
          {used} / {type?.buildingSlots ?? planet?.buildings.length ?? "?"}
        </dd>
        <dt className={label}>Command</dt>
        <dd className="font-mono">+{type?.commandPointBonus ?? 0} CP</dd>
        {planet &&
          [...content.resources].map(([id, r], i) => {
            const level = richness.get(id) ?? "none";
            const pips = ["none", "poor", "normal", "rich"].indexOf(level);
            return (
              <Fragment key={id}>
                <dt className={label}>{i === 0 && "Richness"}</dt>
                <dd className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-18">{r.name}</span>
                  <span aria-hidden="true" className="flex gap-0.5">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={`h-2.5 w-1.5 rounded-[1px] ${n <= pips ? "bg-ok" : "bg-line"}`}
                      />
                    ))}
                  </span>
                  <span className="text-ink-3 text-xs">
                    {level === "none" ? "none" : `${level} ×${RICHNESS[level]}`}
                  </span>
                </dd>
              </Fragment>
            );
          })}
      </dl>
      <span className="flex-1" />
      {sel.mine && (
        <div className="grid w-90 grid-cols-2 gap-2">
          {/* With no upkeep it slides over into the Upkeep box's place: one column plus the gap. */}
          <div
            className={`border-ok-edge bg-ok-wash rounded-md border px-2.5 py-2 transition-transform duration-300 ${amounts(content, upkeep) ? "" : "translate-x-[calc(100%+0.5rem)]"}`}
          >
            <div className={`${label} text-ok`}>Produces / Payday</div>
            {/* One line each, cut short: wrapping as buildings come and go resized the window. */}
            <div
              title={amounts(content, produces)}
              className="mt-1 truncate font-mono text-sm"
            >
              {amounts(content, produces) || "Nothing"}
            </div>
            <div
              title={madeBy.join(" · ")}
              className="text-ink-2 mt-0.5 truncate text-[11px]"
            >
              {madeBy.join(" · ")}
            </div>
          </div>
          {amounts(content, upkeep) && (
            <div className="border-danger/40 bg-danger-wash rounded-md border px-2.5 py-2">
              <div className={`${label} text-danger`}>Upkeep / Payday</div>
              <div
                title={amounts(content, upkeep)}
                className="mt-1 truncate font-mono text-sm"
              >
                {amounts(content, upkeep)}
              </div>
              <div
                title={paidBy.join(" · ")}
                className="text-ink-2 mt-0.5 truncate text-[11px]"
              >
                {paidBy.join(" · ")}
              </div>
            </div>
          )}
        </div>
      )}
      {!sel.mine && planet && (
        <Threat content={content} planet={planet} last={!!sel.last} />
      )}
    </div>
  );
}

/** A Battle here, which pauses this Planet, or your own debt. */
function Alerts(props: {
  conn: MatchConnection;
  content: ContentLookups;
  sel: Selected;
}) {
  const { conn, content, sel } = props;
  const economy = useStore(conn.store, (s) => s.view?.economy);
  const battles = [...sel.view.battles.values()].filter(
    (b) => b.planet === sel.id,
  );
  const debts = sel.mine
    ? [...(economy?.resources ?? [])].filter(([, n]) => n < 0)
    : [];
  return (
    <>
      {sel.live?.locked && (
        <div className="border-line bg-accent-wash flex items-center gap-3 border-b px-3.5 py-2.5 text-sm">
          <span className="flex-1">
            <strong className="text-accent">Locked by a Battle.</strong> Its
            queues are paused and its Stacks are frozen until it ends.
          </span>
          {battles.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => conn.local.setState({ watching: b.id })}
              className="border-edge bg-raised min-h-8 rounded-md px-3"
            >
              Watch Battle
            </button>
          ))}
        </div>
      )}
      {debts.length > 0 && (
        <div className="border-danger/40 bg-danger-wash text-danger border-b px-3.5 py-2.5 text-sm">
          <strong>
            In debt:{" "}
            {debts
              .map(([r, n]) => `${content.resources.get(r)?.name ?? r} ${n}`)
              .join(", ")}
            .
          </strong>{" "}
          You can't queue anything that costs it until it's paid off. Trade for
          it on the Exchange, or wait for Payday.
        </div>
      )}
    </>
  );
}

const THREAT_LOOK = [
  "border-ok-edge bg-ok-wash text-ok",
  "border-host/40 bg-host-wash text-host",
  "border-accent/40 bg-accent-wash text-accent",
  "border-danger/40 bg-danger-wash text-danger",
];

/** How well a Planet that isn't yours is defended, as you see it now or last saw it. */
function Threat(props: {
  content: ContentLookups;
  planet: PlanetView;
  last: boolean;
}) {
  const { score, level, top } = threat(props.content, props.planet);
  const bands = props.content.rules.threatBands;
  const look = THREAT_LOOK[level] ?? THREAT_LOOK[0];
  return (
    <div
      title={`Defence score ${Math.round(score)}${level ? `: ${THREAT_LEVELS[level]} starts at ${bands[level - 1]}` : ""}`}
      className={`flex w-48 flex-col gap-1 rounded-md border px-2.5 py-2 ${look}`}
    >
      <span className="font-mono text-[11px] tracking-[0.08em] uppercase">
        Threat{props.last && " · as last seen"}
      </span>
      <span className="font-display text-lg leading-none font-bold tracking-[0.04em]">
        {THREAT_LEVELS[level]}
      </span>
      <span aria-hidden="true" className="grid grid-cols-4 gap-0.75">
        {THREAT_LEVELS.map((l, i) => (
          <span
            key={l}
            className={`h-1.25 rounded-xs ${i <= level ? "bg-current" : "bg-line"}`}
          />
        ))}
      </span>
      <span className="text-ink-2 text-[11px]">
        {top
          ? `Mostly its ${top.count} ${top.name}${top.count > 1 ? "s" : ""}`
          : "No defenders"}
      </span>
    </div>
  );
}

/**
 * A Stack's or an Army's strength, on Threat's scale so it compares with a
 * target's: in its owner's colour if it's yours, else Threat's by level.
 */
function Strength(props: {
  content: ContentLookups;
  units: UnitSlot[];
  colour?: string;
}) {
  const { level, top } = threat(props.content, {
    stacks: [props.units],
    buildings: [],
  });
  const c = props.colour;
  const text = `${THREAT_LEVELS[level]} strength${top ? `: mostly its ${top.count} ${top.name}${top.count > 1 ? "s" : ""}` : ""}`;
  return (
    <Tooltip content={text} side="bottom">
      <button
        type="button"
        aria-label={text}
        className={`flex cursor-default items-center gap-1.5 rounded-[5px] border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase ${c ? "" : (THREAT_LOOK[level] ?? THREAT_LOOK[0])}`}
        style={
          c
            ? { color: c, borderColor: `${c}66`, backgroundColor: `${c}1a` }
            : {}
        }
      >
        <span aria-hidden="true" className="flex items-end gap-0.5">
          {THREAT_LEVELS.map((l, i) => (
            <span
              key={l}
              className={`w-1.25 rounded-[1px] ${i <= level ? "bg-current" : "bg-line"}`}
              style={{ height: 5 + 2 * i }}
            />
          ))}
        </span>
        {THREAT_LEVELS[level]}
      </button>
    </Tooltip>
  );
}

/** One card per Building Slot; an empty one of yours opens the build list. */
function BuildingsTab(props: {
  conn: MatchConnection;
  content: ContentLookups;
  planet: PlanetView;
  editable: boolean;
  faction: string;
}) {
  const { conn, content, planet, editable } = props;
  const local = useStore(conn.local);
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local); // ticks the countdowns
  // Tagged with its Planet so a different Planet starts without the build list open.
  const [pick, setPick] = useState<{ planet: string; slot: number } | null>(
    null,
  );
  const picking = pick?.planet === planet.id ? pick.slot : null;
  const setPicking = (slot: number | null) =>
    setPick(slot === null ? null : { planet: planet.id, slot });
  const refund = content.rules.sellRefundPercent / 100;
  // A fixed height, so the grid doesn't shift as buildings come and go.
  const card = "flex h-40 flex-col gap-2 rounded-md border border-l-3 p-2";
  // The Lab slot whose sale is being confirmed: it holds Techs.
  const [selling, setSelling] = useState<number | null>(null);
  const sellingTechs = (
    selling === null ? [] : (planet.labs.get(selling) ?? [])
  ).map((t) => content.techs.get(t)?.name ?? t);

  const held = view ? heldTechs(view) : new Set<string>();
  const details = (b: Building) => (
    <BuildingInfo
      content={content}
      building={b}
      richness={planet.richness}
      cost={sprawled(content, view, b.cost)}
      needs={needsTech(content, held, "buildings", b.id)}
    />
  );

  if (picking !== null && editable) {
    const buildable = [...content.buildings.values()].filter(
      (b) => b.faction === props.faction,
    );
    const groups = (Object.keys(ROLES) as Role[])
      .map((r) => ({ role: r, list: buildable.filter((b) => roleOf(b) === r) }))
      .filter((g) => g.list.length > 0);
    return (
      <>
        <div className="flex items-center justify-between">
          <span className={label}>Build in slot {picking + 1}</span>
          <button
            type="button"
            onClick={() => setPicking(null)}
            className={smallButton}
          >
            Back
          </button>
        </div>
        {/* A fixed height that scrolls, so the window keeps its size. */}
        <div className="flex h-105 flex-col gap-1 overflow-y-auto pr-1">
          {groups.map(({ role, list }) => (
            <Fragment key={role}>
              <span
                className="after:bg-line mt-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase after:h-px after:flex-1 first:mt-0"
                style={{ color: ROLES[role].colour }}
              >
                {ROLES[role].name}
              </span>
              {list.map((b) => {
                const needs = needsTech(content, held, "buildings", b.id);
                const blocked = needs.length > 0 || isPending(local, "build");
                return (
                  <Tooltip key={b.id} side="right" content={details(b)}>
                    <button
                      type="button"
                      // Not disabled, so it still takes focus and shows its popover.
                      aria-disabled={blocked}
                      onClick={() => {
                        if (blocked) return;
                        conn.queueBuilding(planet.id, picking, b.id);
                        setPicking(null);
                      }}
                      className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-md border border-l-3 py-1.5 pr-2.5 pl-2 text-left ${needs.length ? "border-edge border-dashed bg-transparent" : "border-line bg-item"} ${blocked ? "cursor-default" : ""}`}
                      style={{
                        borderLeftColor: ROLES[role].colour,
                        borderLeftStyle: "solid",
                      }}
                    >
                      <span className={blocked ? "opacity-55" : ""}>
                        <RoleIcon role={role} />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={`font-semibold ${blocked ? "opacity-55" : ""}`}
                        >
                          {b.name}
                        </span>
                        {needs.length > 0 ? (
                          <span className="text-accent text-[11px]">
                            Needs {needs.join(" or ")}
                          </span>
                        ) : (
                          <span className="text-ink-2 truncate text-xs">
                            {factsOf(content, b, planet.richness)
                              .map((f) => f.line)
                              .join(" · ")}
                          </span>
                        )}
                        <span
                          className={`text-ink-3 truncate font-mono text-[11px] ${blocked ? "opacity-55" : ""}`}
                        >
                          {amounts(content, sprawled(content, view, b.cost))}
                        </span>
                      </span>
                      <span
                        className={`flex flex-col items-end font-mono text-[11px] whitespace-nowrap ${blocked ? "opacity-55" : ""}`}
                      >
                        <span className="text-ink-3">{b.buildTime} s</span>
                        {amounts(content, b.upkeep) && (
                          <span className="text-danger">
                            −{amounts(content, b.upkeep)}
                          </span>
                        )}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </Fragment>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={selling !== null}
        eyebrow="SELL LAB"
        title={`Lose ${listed(sellingTechs)}?`}
        confirm="SELL"
        cancel="Keep it"
        onConfirm={() => {
          if (selling !== null) conn.sellBuilding(planet.id, selling);
          setSelling(null);
        }}
        onCancel={() => setSelling(null)}
      >
        Selling this Lab loses every Tech it holds. They come back as cards you
        can research again for {content.rules.tech.recoveryPercent}% of their
        cost.
      </ConfirmDialog>
      <span className={label}>Buildings</span>
      <div className="grid grid-cols-2 gap-2">
        {planet.buildings.map((id, i) => {
          const b = content.buildings.get(id);
          const building = planet.queue.find((q) => q.slot === i);
          const key = `${i}-${id}`;
          if (b) {
            const role = roleOf(b);
            return (
              <div
                key={key}
                className={`${card} border-line bg-item`}
                style={{ borderLeftColor: ROLES[role].colour }}
              >
                <BuildingFace
                  content={content}
                  building={b}
                  richness={planet.richness}
                  actions={
                    <>
                      <Tooltip content={details(b)}>
                        <button
                          type="button"
                          aria-label={`About ${b.name}`}
                          className="border-edge text-ink-3 flex size-5.5 flex-none cursor-help items-center justify-center rounded-full border bg-transparent p-0 font-serif text-xs italic"
                        >
                          i
                        </button>
                      </Tooltip>
                      {editable && (
                        <Tooltip
                          content={`Refunds ${amounts(content, b.cost, refund)}`}
                        >
                          <button
                            type="button"
                            disabled={isPending(local, "sell")}
                            onClick={() =>
                              planet.labs.get(i)?.length
                                ? setSelling(i)
                                : conn.sellBuilding(planet.id, i)
                            }
                            className={smallButton}
                          >
                            Sell
                          </button>
                        </Tooltip>
                      )}
                    </>
                  }
                  body={
                    b.techSlots ? (
                      <LabSlots
                        content={content}
                        holds={planet.labs.get(i) ?? []}
                        researching={
                          planet.owner === view?.you
                            ? (view?.research.projects ?? [])
                                .filter(
                                  (p) => p.planet === planet.id && p.slot === i,
                                )
                                .map((p) => p.tech)
                            : []
                        }
                        slots={b.techSlots}
                      />
                    ) : undefined
                  }
                />
              </div>
            );
          }
          if (building) {
            const def = content.buildings.get(building.building);
            const role = def ? roleOf(def) : "special";
            const label = building.paused
              ? "Paused"
              : building.started
                ? "Building"
                : "Queued";
            const left = building.endsAt
              ? building.endsAt - now
              : building.remaining;
            // shortcut: the refund is worked out from today's Sprawl, not what was paid (the View doesn't carry it); send QueueItem.Paid if they drift apart in play.
            const back = building.started
              ? content.rules.cancelRefundPercent / 100
              : 1;
            return (
              <div
                key={key}
                className={`${card} border-line bg-item relative overflow-hidden`}
                style={{ borderLeftColor: ROLES[role].colour }}
              >
                {/* What it'll be once built, dimmed under its progress. */}
                <div
                  aria-hidden="true"
                  className="flex min-h-0 flex-1 flex-col gap-2 opacity-30 saturate-60"
                >
                  {def && (
                    <BuildingFace
                      content={content}
                      building={def}
                      richness={planet.richness}
                    />
                  )}
                </div>
                <div className="from-ground/70 to-ground/90 absolute inset-0 flex flex-col justify-center gap-2 bg-linear-to-b px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="font-mono text-[13px] font-semibold tracking-[0.14em] uppercase"
                      style={{
                        color: building.paused
                          ? "var(--color-danger)"
                          : ROLES[role].colour,
                      }}
                    >
                      {label}
                      <span className="sr-only"> {def?.name}</span>
                    </span>
                    {building.started && (
                      <span className="text-ink-2 font-mono text-xs">
                        {Math.max(0, Math.ceil(left / 1000))} s left
                      </span>
                    )}
                  </div>
                  <Progress
                    item={building}
                    total={(def?.buildTime ?? 0) * 1000}
                    offset={local.clockOffset}
                  />
                  {editable && (
                    <Tooltip
                      content={`Refunds ${amounts(content, sprawled(content, view, def?.cost ?? {}), back)}`}
                    >
                      <button
                        type="button"
                        disabled={isPending(local, "cancel")}
                        onClick={() => conn.cancelQueueItem(building.id)}
                        className={`${smallButton} self-center`}
                      >
                        Cancel
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          }
          return editable ? (
            <button
              key={key}
              type="button"
              onClick={() => setPicking(i)}
              className="border-edge text-ink-2 flex h-40 flex-col items-center justify-center gap-1 rounded-md border-dashed bg-transparent"
            >
              <span className="text-accent text-2xl">+</span>
              Build
            </button>
          ) : (
            <div
              key={key}
              className={`${card} border-edge text-ink-3 border-dashed`}
            >
              Empty
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * A building's card as it is when built: its role, name and any actions,
 * what it does on this Planet (or another body, such as a Lab's slots),
 * and its upkeep.
 */
function BuildingFace(props: {
  content: ContentLookups;
  building: Building;
  richness: Map<string, string>;
  actions?: ReactNode;
  body?: ReactNode;
}) {
  const { content, building: b } = props;
  const role = roleOf(b);
  return (
    <>
      <div className="flex items-center gap-2">
        <RoleIcon role={role} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-semibold">{b.name}</span>
          <span
            className="font-mono text-[10px] tracking-[0.08em] uppercase"
            style={{ color: ROLES[role].colour }}
          >
            {ROLES[role].name}
          </span>
        </span>
        {props.actions}
      </div>
      {props.body ?? (
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto text-[13px]">
          {factsOf(content, b, props.richness).map((f) => (
            <span key={f.line} className="flex flex-col">
              {f.line}
              {f.sub && (
                <span className="text-ink-3 text-[11.5px]">{f.sub}</span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="border-line border-t pt-1 font-mono text-[11px]">
        {amounts(content, b.upkeep) ? (
          <span className="text-danger">
            Upkeep {amounts(content, b.upkeep)} / Payday
          </span>
        ) : (
          <span className="text-ink-4">No upkeep</span>
        )}
      </div>
    </>
  );
}

/**
 * A Lab's Tech Slots: the Techs it holds, the Projects reserving one, then
 * the free ones. Other players see what it holds too.
 */
function LabSlots(props: {
  content: ContentLookups;
  holds: string[];
  researching: string[];
  slots: number;
}) {
  const name = (t: string) => props.content.techs.get(t)?.name ?? t;
  const free = Math.max(
    0,
    props.slots - props.holds.length - props.researching.length,
  );
  return (
    // Scrolls inside the card past what fits, rather than squashing each slot.
    <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      {props.holds.map((t) => (
        <li
          key={t}
          className="border-edge bg-tile flex-none truncate rounded border px-2 py-0.5 text-xs"
        >
          {name(t)}
        </li>
      ))}
      {props.researching.map((t) => (
        <li
          key={t}
          className="border-accent text-accent flex-none truncate rounded border px-2 py-0.5 text-xs"
        >
          {name(t)} · researching
        </li>
      ))}
      {Array.from({ length: free }, (_, n) => `free-${n}`).map((key) => (
        <li
          key={key}
          className="border-edge text-ink-4 flex-none rounded border border-dashed px-2 py-0.5 text-xs"
        >
          Free Tech Slot
        </li>
      ))}
    </ul>
  );
}

/** Every unit your Faction trains, grouped by the building that trains it. */
function UnitsTab(props: {
  conn: MatchConnection;
  content: ContentLookups;
  planet: PlanetView;
  faction: string;
}) {
  const { conn, content, planet, faction } = props;
  const local = useStore(conn.local);
  const view = useStore(conn.store, (s) => s.view);
  const trainers = [...content.buildings.values()].filter(
    (b) => b.faction === faction && b.trains?.length,
  );
  const busy = isPending(local, "train");
  const nameOf = (m: "unitClasses" | "weaponTypes", id: string) =>
    content[m].get(id)?.name ?? id;

  if (!trainers.some((b) => planet.buildings.includes(b.id))) {
    const names = trainers.map((b) => b.name);
    const list =
      names.length > 1
        ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`
        : (names[0] ?? "production building");
    return (
      <>
        <span className={label}>Units</span>
        <div className="border-edge flex flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-8 text-center">
          <span className="font-semibold">No unit production here</span>
          <span className="text-ink-3 text-sm">
            Build a {list} on this Planet to train units.
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className={label}>Units</span>
        <span className="text-ink-3 text-xs">
          Click to train · Shift-click for 5
        </span>
      </div>
      {trainers.map((b) => {
        const slots = planet.buildings.flatMap((id, i) =>
          id === b.id ? [i] : [],
        );
        // The least busy of this kind of building takes the order.
        const queued = (slot: number) =>
          planet.unitQueue.filter((q) => q.slot === slot).length;
        const slot = slots.sort((x, y) => queued(x) - queued(y))[0];
        return (
          <section key={b.id} className="flex flex-col gap-2">
            <span
              className={`text-xs ${slot === undefined ? "text-ink-3" : "text-ink-2"}`}
            >
              {b.name}
              {slot === undefined && " · not built here"}
            </span>
            <div
              className={`grid grid-cols-2 gap-2 ${slot === undefined ? "opacity-45" : ""}`}
            >
              {(b.trains ?? []).map((id) => {
                const u = content.units.get(id);
                if (!u) return null;
                const needs = view
                  ? needsTech(content, heldTechs(view), "units", id)
                  : [];
                return (
                  <button
                    key={id}
                    type="button"
                    title={
                      needs.length ? `Needs ${needs.join(" or ")}` : undefined
                    }
                    disabled={slot === undefined || busy || needs.length > 0}
                    onClick={(e) =>
                      slot !== undefined &&
                      conn.queueUnit(planet.id, slot, id, e.shiftKey ? 5 : 1)
                    }
                    className={`flex items-center gap-2.5 rounded-md p-2 text-left ${slot === undefined ? "border-dashed bg-transparent" : "bg-item"}`}
                  >
                    <Tile name={u.name} size="size-12" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{u.name}</span>
                      {needs.length > 0 && (
                        <span className="text-accent text-[11px]">
                          Needs {needs.join(" or ")}
                        </span>
                      )}
                      <span className="text-ink-3 text-[11px]">
                        {nameOf("unitClasses", u.combat.unitClass)} ·{" "}
                        {nameOf("weaponTypes", u.combat.weaponType)}
                      </span>
                      <span className="font-mono text-[11px]">
                        {amounts(content, sprawled(content, view, u.cost))} ·{" "}
                        {u.commandPoints} CP · {u.buildTime} s
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** One unit queue per production building. */
function BuildQueue(props: {
  conn: MatchConnection;
  content: ContentLookups;
  planet: PlanetView;
}) {
  const { conn, content, planet } = props;
  const groups = [
    // Construction shows on its Building Slot's card instead.
    ...planet.buildings.flatMap((id, slot) => {
      const b = content.buildings.get(id);
      return b?.trains?.length
        ? [
            {
              title: b.name,
              items: planet.unitQueue.filter((q) => q.slot === slot),
            },
          ]
        : [];
    }),
  ];
  return (
    <section className="border-line flex w-62 flex-none flex-col gap-2.5 overflow-y-auto border-l p-3.5">
      <span className={label}>Build Queue</span>
      {groups.every((g) => g.items.length === 0) && (
        <p className="text-ink-3 text-sm">Nothing queued.</p>
      )}
      {groups.map(
        (g, i) =>
          g.items.length > 0 && (
            // biome-ignore lint/suspicious/noArrayIndexKey: groups follow the Building Slots
            <div key={i} className="flex flex-col gap-1.5">
              <span className="text-ink-3 text-xs">{g.title}</span>
              <ol className="flex flex-col gap-1.5">
                {g.items.map((q) => (
                  <QueueRow key={q.id} conn={conn} content={content} item={q} />
                ))}
              </ol>
            </div>
          ),
      )}
    </section>
  );
}

/** A queue item's state in a word or two: time left, paused, waiting. */
function queueStatus(q: QueueItem, now: number) {
  if (q.paused) return "paused";
  if (q.endsAt > 0 && q.endsAt <= now) return "no room in any Stack";
  if (q.endsAt > 0) return `${Math.ceil((q.endsAt - now) / 1000)} s`;
  return "queued";
}

function QueueRow(props: {
  conn: MatchConnection;
  content: ContentLookups;
  item: QueueItem;
}) {
  const { conn, content, item: q } = props;
  const local = useStore(conn.local);
  const def = q.unit
    ? content.units.get(q.unit)
    : content.buildings.get(q.building);
  const name = def?.name ?? (q.unit || q.building);
  const now = useMatchNow(conn.local); // ticks the countdown
  const status = queueStatus(q, now);
  return (
    <li
      className={`border-line flex items-center gap-2 rounded-md border p-1.5 ${q.endsAt || q.paused ? "bg-item" : "text-ink-3"}`}
    >
      <Tile name={name} size="size-9" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex gap-2 text-sm">
          <span className="flex-1 truncate">{name}</span>
          <span
            className={`font-mono text-xs ${q.paused || status.startsWith("no") ? "text-danger" : "text-ink-3"}`}
          >
            {status}
          </span>
        </div>
        {(q.endsAt > 0 || q.started) && (
          <Progress
            item={q}
            total={(def?.buildTime ?? 0) * 1000}
            offset={local.clockOffset}
          />
        )}
      </div>
      <button
        type="button"
        aria-label={`Cancel ${name}`}
        disabled={isPending(local, "cancel")}
        onClick={() => conn.cancelQueueItem(q.id)}
        className="text-ink-3 size-6 border-0 bg-transparent p-0"
      >
        ✕
      </button>
    </li>
  );
}

const PLANET_WINDOW = "planet-window";

/** Opens beside the Planet window, on whichever side has room. */
const besidePlanet = (map: HTMLElement, self: HTMLElement): Point => {
  const planet = document.getElementById(PLANET_WINDOW);
  if (!planet) return { x: map.clientWidth - self.offsetWidth - 16, y: 16 };
  const right = planet.offsetLeft + planet.offsetWidth + 8;
  const x =
    right + self.offsetWidth <= map.clientWidth
      ? right
      : Math.max(0, planet.offsetLeft - self.offsetWidth - 8);
  return { x, y: planet.offsetTop };
};

/** A click outside the element, or Escape, calls close while open. */
export function useDismiss<T extends HTMLElement>(
  open: boolean,
  close: () => void,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onEvent = (e: Event) => {
      const outside =
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node);
      if (outside) close();
    };
    document.addEventListener("pointerdown", onEvent);
    document.addEventListener("keydown", onEvent);
    return () => {
      document.removeEventListener("pointerdown", onEvent);
      document.removeEventListener("keydown", onEvent);
    };
  }, [open, close]);
  return ref;
}

/**
 * The selected Planet's three Stacks, one under another, each a grid of
 * Unit Slot cells. Your own slots drag to any cell of any Stack; right-click
 * one to split it.
 */
export function StacksWindow(props: {
  conn: MatchConnection;
  content: ContentLookups;
  onClose: () => void;
}) {
  const { conn, content } = props;
  const sel = useSelectedPlanet(conn, content);
  const local = useStore(conn.local);
  const stacks = sel?.planet?.stacks;
  // After a drop, and until the server answers it, the grid shows the move.
  // Tagged with the Stacks it moved, so the server's next Stacks replace it.
  const [move, setMove] = useState<{
    from: typeof stacks;
    to: UnitSlot[][];
  } | null>(null);
  const moved = move && move.from === stacks ? move.to : null;
  const setMoved = (to: UnitSlot[][]) => setMove({ from: stacks, to });
  useEffect(() => {
    const reset = () => setMove(null);
    conn.events.addEventListener("rejected", reset);
    return () => conn.events.removeEventListener("rejected", reset);
  }, [conn]);
  const [menu, setMenu] = useState<{
    stack: number;
    slot: UnitSlot;
    x: number;
    y: number;
  } | null>(null);
  if (!sel?.planet) return null;
  const { planet, editable } = sel;
  const shown = moved ?? planet.stacks;
  const unitName = (id: string) => content.units.get(id)?.name ?? id;
  const limitOf = (id: string) => content.units.get(id)?.slotLimit ?? 0;

  return (
    <Floating
      label={`${sel.name}: Stacks`}
      start={besidePlanet}
      onClose={props.onClose}
      className="w-84"
      title={
        <>
          <h2 className={windowTitle}>{sel.name}</h2>
          <span className={label}>Stacks{sel.last && " · last seen"}</span>
        </>
      }
    >
      {editable && (
        <p className="text-ink-4 mx-3 mt-2 text-xs">
          Drag a slot to any cell, in this Stack or another. Right-click one to
          split it in half or move it. Drag a Stack's pile on the map onto a
          Planet to send it.
        </p>
      )}
      <DragDropProvider
        // No drop animation: the grid already shows the slot in its new cell,
        // and animating the old element there slid it in from the wrong row.
        plugins={(defaults) => [
          ...defaults.filter((p) => p !== Feedback),
          Feedback.configure({ dropAnimation: null }),
        ]}
        onDragEnd={(e) => {
          const { source, target } = e.operation;
          if (e.canceled || !source || !target) return;
          // Slot ids are "stack/cell", cell ids "stack:cell".
          const [fs = -1, fc = -1] = String(source.id).split("/").map(Number);
          const [ts = -1, tc = -1] = String(target.id).split(":").map(Number);
          const from = { stack: fs, cell: fc };
          const to = { stack: ts, cell: tc };
          const slot = planet.stacks[fs]?.find((u) => u.cell === fc);
          if (!slot || (fs === ts && fc === tc)) return;
          setMoved(moveSlot(planet.stacks, from, to, limitOf(slot.unit)));
          conn.moveUnits(planet.id, from, to, slot.unit, slot.count);
        }}
      >
        <div
          className={`flex flex-col gap-2.5 p-3 ${sel.last ? "opacity-60" : ""}`}
        >
          {shown.map((stack, i) => {
            const rally = sel.mine && planet.rallyStack === i;
            return (
              <section
                // biome-ignore lint/suspicious/noArrayIndexKey: the three Stacks are positional
                key={i}
                aria-label={`Stack ${i + 1}`}
                className={`bg-panel flex flex-col gap-1.5 rounded-lg border p-2 ${rally ? "border-accent" : "border-edge"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap">
                    Stack {i + 1}
                  </span>
                  {rally && (
                    <Tag className="bg-accent-wash text-accent">Rally</Tag>
                  )}
                  <span className="flex-1" />
                  {sel.mine && !rally && (
                    <button
                      type="button"
                      disabled={isPending(local, "rally")}
                      onClick={() => conn.setRallyStack(planet.id, i)}
                      className={`${smallButton} text-ink-3`}
                    >
                      Make Rally
                    </button>
                  )}
                  {stack.length > 0 && (
                    <Strength
                      content={content}
                      units={stack}
                      colour={
                        sel.mine ? seatColour(sel.view.you ?? 0) : undefined
                      }
                    />
                  )}
                </div>
                <ul className="grid grid-cols-5 gap-1.25">
                  {Array.from(
                    { length: content.rules.unitSlotsPerStack },
                    (_, c) => {
                      const u = stack.find((s) => s.cell === c);
                      return (
                        <GridCell
                          // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                          key={c}
                          stack={i}
                          cell={c}
                          editable={editable}
                        >
                          {u && (
                            <DraggableSlot
                              key={u.unit}
                              stack={i}
                              slot={u}
                              name={unitName(u.unit)}
                              disabled={!editable || isPending(local, "move")}
                              onMenu={(x, y) =>
                                setMenu({ stack: i, slot: u, x, y })
                              }
                            />
                          )}
                        </GridCell>
                      );
                    },
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </DragDropProvider>
      {menu && editable && (
        <SlotMenu
          {...menu}
          name={unitName(menu.slot.unit)}
          free={freeCell(
            planet.stacks[menu.stack] ?? [],
            content.rules.unitSlotsPerStack,
          )}
          onClose={() => setMenu(null)}
          onMove={(to, count) => {
            conn.moveUnits(
              planet.id,
              { stack: menu.stack, cell: menu.slot.cell },
              to,
              menu.slot.unit,
              count,
            );
            setMenu(null);
          }}
        />
      )}
    </Floating>
  );
}

/** One cell of a Stack's grid, and a place to drop a slot. */
function GridCell(props: {
  stack: number;
  cell: number;
  editable: boolean;
  children: ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `${props.stack}:${props.cell}`,
    accept: "slot",
    disabled: !props.editable,
  });
  return (
    <li
      ref={ref}
      className={`h-12 rounded ${props.children ? "" : "border-line border border-dashed"} ${isDropTarget ? "outline-accent outline-2" : ""}`}
    >
      {props.children}
    </li>
  );
}

/** A full Unit Slot you can drag, and right-click (or Shift+F10) for its menu. */
function DraggableSlot(props: {
  stack: number;
  slot: UnitSlot;
  name: string;
  disabled: boolean;
  onMenu: (x: number, y: number) => void;
}) {
  const { ref, isDragging } = useDraggable({
    id: `${props.stack}/${props.slot.cell}`,
    type: "slot",
    disabled: props.disabled,
  });
  return (
    <UnitSlotTile
      ref={ref}
      slot={props.slot}
      name={props.name}
      draggable={!props.disabled}
      dragging={isDragging}
      onContextMenu={(e) => {
        e.preventDefault();
        if (props.disabled) return;
        // A keyboard-opened menu has no pointer position: use the slot's.
        const r = e.currentTarget.getBoundingClientRect();
        props.onMenu(e.clientX || r.left, e.clientY || r.bottom);
      }}
    />
  );
}

const menuItem =
  "flex min-h-8 w-full items-center rounded border-0 bg-transparent px-2.5 text-left text-sm hover:bg-raised focus:bg-raised focus:outline-none disabled:text-ink-4";

/**
 * A Unit Slot's right-click menu, like a file manager's. Split puts half
 * the units in a new slot in the first free cell of the same Stack; Move to
 * sends the whole slot to another Stack. Arrow keys move between items.
 */
function SlotMenu(props: {
  stack: number;
  slot: UnitSlot;
  name: string;
  free: number; // the first free cell of this Stack, or -1
  x: number;
  y: number;
  onMove: (to: { stack: number; cell: number }, count: number) => void;
  onClose: () => void;
}) {
  const { slot } = props;
  const ref = useDismiss<HTMLDivElement>(true, props.onClose);
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")
      ?.focus();
  }, [ref]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${props.name} ×${slot.count}`}
      style={{ left: props.x, top: props.y }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const items = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            "[role=menuitem]:not(:disabled)",
          ),
        ];
        const at = items.indexOf(document.activeElement as HTMLElement);
        const step = e.key === "ArrowDown" ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
      }}
      className="border-edge bg-panel fixed z-30 flex w-48 flex-col rounded-md border p-1 shadow-[0_12px_32px_#000a]"
    >
      <button
        type="button"
        role="menuitem"
        disabled={slot.count < 2 || props.free < 0}
        onClick={() =>
          props.onMove(
            { stack: props.stack, cell: props.free },
            Math.floor(slot.count / 2),
          )
        }
        className={menuItem}
      >
        Split
      </button>
      <hr className="border-line my-1" />
      {[0, 1, 2]
        .filter((k) => k !== props.stack)
        .map((k) => (
          <button
            key={k}
            type="button"
            role="menuitem"
            onClick={() => props.onMove({ stack: k, cell: -1 }, slot.count)}
            className={menuItem}
          >
            Move to Stack {k + 1}
          </button>
        ))}
    </div>
  );
}

/** A full Unit Slot: the unit and its count. */
function UnitSlotTile({
  ref,
  ...props
}: {
  ref?: (el: Element | null) => void;
  slot: UnitSlot;
  name: string;
  draggable?: boolean;
  dragging?: boolean;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const { slot } = props;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: @dnd-kit makes a draggable slot a focusable button, so Shift+F10 opens its menu
    <div
      ref={ref}
      title={`${props.name} × ${slot.count}`}
      onContextMenu={props.onContextMenu}
      className={`border-edge bg-tile flex h-12 flex-col justify-between rounded border px-1.5 py-1 leading-tight ${props.draggable ? "cursor-grab" : ""} ${props.dragging ? "ring-accent opacity-60 ring-2" : ""}`}
    >
      <span className="text-ink-3 font-mono text-[11px]">
        {abbr(props.name)}
      </span>
      <span className="self-end font-mono text-[13px]">×{slot.count}</span>
    </div>
  );
}

/** Arriving units join your own Planet's Rally Stack, otherwise Stack 1. */
export function toStackAt(conn: MatchConnection, to: string) {
  const view = conn.store.getState().view;
  const target = view?.planets.get(to);
  return target && target.owner === view?.you ? target.rallyStack : 0;
}

/** Sends a whole Stack to another Planet as an Army. */
export function sendStack(
  conn: MatchConnection,
  from: string,
  stack: number,
  to: string,
  toStack = toStackAt(conn, to),
) {
  const units =
    conn.store.getState().view?.planets.get(from)?.stacks[stack] ?? [];
  if (units.length === 0 || from === to) return;
  conn.orderArmy(
    from,
    units.map((u) => ({ stack, ...u })),
    to,
    toStack,
  );
}

/** Opens at the bottom left, above the Players button. */
const bottomLeft = (map: HTMLElement, self: HTMLElement) => ({
  x: 16,
  y: Math.max(16, map.clientHeight - self.offsetHeight - 64),
});

/**
 * The selected Army: every stop on its route with when it gets there and
 * what it does there, then its units. Other players' Armies show only the
 * hop they're on.
 */
export function ArmyWindow(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const id = useStore(conn.local, (s) => s.selectedArmy);
  const view = useStore(conn.store, (s) => s.view);
  const lastSeen = useStore(conn.local, (s) => s.lastSeen);
  const now = useMatchNow(conn.local);
  const army = id === null ? undefined : view?.armies.get(id);
  const map = view && content.maps.get(view.map);
  if (!army || !view || !map) return null;
  const planet = (p: string) =>
    map.planets.find((mp) => mp.id === p)?.name ?? p;
  // As the player knows it: live, else as last seen, else neutral.
  const ownerOf = (p: string) => {
    const live = view.planets.get(p);
    return live ? live.owner : (lastSeen.get(p)?.planet.owner ?? null);
  };
  const mine = army.owner === view.you;
  const lanes = laneTimes(map, content.rules);
  const route = mine ? [army.to, ...army.path] : [army.to];
  let at = army.waiting ? now : army.arrives;
  const stops = route.map((p, i) => {
    if (i > 0) at += lanes.get(route[i - 1] ?? "")?.get(p) ?? 0;
    const owner = ownerOf(p);
    const last = i === route.length - 1;
    const enemy = owner !== null && owner !== army.owner;
    const does = !mine
      ? ""
      : enemy
        ? last
          ? "attacks"
          : "attacks · stops here"
        : last
          ? owner === army.owner
            ? "lands"
            : "attacks"
          : "passes";
    return { id: p, owner, at, does, fight: does.startsWith("attacks") };
  });

  return (
    <Floating
      label="Army"
      start={bottomLeft}
      remember="army"
      onClose={() => conn.local.setState({ selectedArmy: null })}
      className="w-84"
      title={
        <>
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ background: seatColour(army.owner) }}
          />
          <h2 className={windowTitle}>
            {mine ? "Your Army" : `${playerName(view, army.owner)}'s Army`}
          </h2>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between">
          <span className={label}>{army.waiting ? "In orbit" : "Route"}</span>
          <Strength
            content={content}
            units={army.units}
            colour={mine ? seatColour(army.owner) : undefined}
          />
        </div>
        {/* About five stops tall, scrolling past that: the window keeps its size. */}
        <ol className="flex max-h-40 flex-col overflow-y-auto">
          {!army.waiting && (
            <RouteStop
              name={planet(army.from)}
              colour={dotColour(ownerOf(army.from))}
              note="left"
              done
              progress={progress(army, now)}
            />
          )}
          {stops.map((st, i) => (
            <RouteStop
              key={st.id} // a route never visits a Planet twice
              name={planet(st.id)}
              colour={dotColour(st.owner)}
              note={st.does}
              danger={st.fight}
              eta={
                army.waiting && i === 0
                  ? "here"
                  : `${Math.max(0, Math.ceil((st.at - now) / 1000))} s`
              }
              last={i === stops.length - 1}
              next={i === 0}
            />
          ))}
        </ol>
        <ul className="grid grid-cols-5 gap-1.25">
          {army.units.map((u) => (
            <li key={u.unit}>
              <UnitSlotTile
                slot={u}
                name={content.units.get(u.unit)?.name ?? u.unit}
              />
            </li>
          ))}
        </ul>
        {mine && (
          <p className="text-ink-4 text-xs">
            Drag the Army onto a Planet to re-order it. It finishes this Lane
            first.
          </p>
        )}
      </div>
    </Floating>
  );
}

const dotColour = (owner: number | null) =>
  owner === null ? "#9ca3af" : seatColour(owner);

/**
 * One Planet on an Army's route, joined to the next by a line. The line out
 * of the Planet it just left fills, in the route's yellow, as it travels.
 */
function RouteStop(props: {
  name: string;
  colour: string;
  note: string;
  eta?: string;
  done?: boolean;
  danger?: boolean;
  progress?: number; // of the hop out of here, for the Planet just left
  last?: boolean;
  next?: boolean; // the stop the Army is heading to: kept in view
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // Scroll only the list, one stop above this one so the last is in view
    // too; scrollIntoView would scroll the map behind the window as well.
    const li = ref.current;
    const list = li?.parentElement;
    if (props.next && li && list) {
      list.scrollTop = Math.max(
        0,
        li.offsetTop - list.offsetTop - li.offsetHeight,
      );
    }
  }, [props.next]);
  return (
    <li ref={ref} className={`flex gap-2.5 ${props.done ? "text-ink-3" : ""}`}>
      <div className="flex w-2.5 flex-none flex-col items-center">
        <span
          aria-hidden="true"
          className="mt-1.5 size-2.5 flex-none rounded-full"
          style={{ background: props.colour }}
        />
        {!props.last && (
          <span aria-hidden="true" className="bg-line relative w-0.5 flex-1">
            {props.progress !== undefined && (
              <span
                className="absolute inset-x-0 top-0 bg-[#facc15]"
                style={{ height: `${props.progress * 100}%` }}
              />
            )}
          </span>
        )}
      </div>
      <div className="flex min-h-8 flex-1 items-start gap-2 pb-2 text-sm">
        <span className="flex-1">
          {props.name}
          {props.note && (
            <span
              className={`ml-1.5 text-xs ${props.danger ? "text-danger" : "text-ink-3"}`}
            >
              {props.note}
            </span>
          )}
        </span>
        {props.eta && (
          <span className="text-ink-3 font-mono text-xs">{props.eta}</span>
        )}
      </div>
    </li>
  );
}

export function Tile(props: { name: string; size: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`text-ink-3 flex flex-none items-center justify-center rounded border font-mono text-[11px] ${props.size} ${props.dashed ? "border-edge border-dashed" : "border-edge bg-tile"}`}
    >
      {abbr(props.name)}
    </span>
  );
}

/** How long ago a last-seen copy was seen, ticking once a second. */
function LastSeenAge(props: { conn: MatchConnection; seenAt: number }) {
  return <>{formatAge(useMatchNow(props.conn.local) - props.seenAt)}</>;
}

/**
 * A queue item's progress. A running item animates once from where it is
 * now to 100% over its remaining time; a paused or waiting one is frozen.
 */
function Progress(props: { item: QueueItem; total: number; offset: number }) {
  const { item, total, offset } = props;
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const left = item.endsAt
      ? item.endsAt - (performance.now() + offset)
      : item.remaining;
    const from =
      total > 0 ? Math.min(100, Math.max(0, 100 - (left / total) * 100)) : 100;
    el.style.width = `${from}%`;
    if (!item.endsAt) return;
    const a = el.animate([{ width: `${from}%` }, { width: "100%" }], {
      duration: Math.max(0, left),
      fill: "forwards",
    });
    return () => a.cancel();
  }, [item.endsAt, item.remaining, total, offset]);

  return (
    <div className="bg-well h-1 rounded-sm">
      <div
        ref={bar}
        className={`h-full rounded-sm ${item.paused ? "bg-ink-4" : "bg-ok"}`}
      />
    </div>
  );
}
