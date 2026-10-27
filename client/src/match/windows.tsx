import { Feedback } from "@dnd-kit/dom";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import { progress, seatColour } from "../scene/galaxy";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { laneTimes } from "./route";
import { freeCell, moveSlot } from "./stacks";
import type { PlanetView, QueueItem, UnitSlot, View } from "./store";
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

type Amounts = Record<string, number> | Map<string, number>;

/** "300 Credits · 100 Materials", leaving out zeros. */
export function amounts(content: ContentLookups, a: Amounts, scale = 1) {
  const entries = a instanceof Map ? [...a] : Object.entries(a);
  return entries
    .filter(([, n]) => n !== 0)
    .map(
      ([r, n]) =>
        `${Math.floor(n * scale)} ${content.resources.get(r)?.name ?? r}`,
    )
    .join(" · ");
}

const addInto = (into: Map<string, number>, a: Record<string, number>) => {
  for (const [r, n] of Object.entries(a)) into.set(r, (into.get(r) ?? 0) + n);
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
      className={`absolute z-10 flex max-h-[calc(100%-32px)] flex-col rounded-lg border border-edge bg-panel/95 shadow-[0_12px_32px_#000a] ${props.className ?? ""}`}
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
        className="flex h-10 flex-none cursor-move touch-none select-none items-center gap-2.5 rounded-t-lg border-line border-b bg-bar pr-2 pl-3"
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
          className="size-7 border-0 bg-transparent p-0 text-ink-3"
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
      className={mine ? "w-195" : "w-140"}
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
            className="flex min-h-7 items-center gap-1.5 rounded border-edge bg-raised px-2.5 text-xs"
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
        <p className="p-4 text-ink-3">Outside your vision.</p>
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
              className="flex rounded-b-lg border-line border-t bg-bar"
            >
              {(["buildings", "units"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`h-10 flex-1 rounded-none border-0 border-t-2 capitalize ${tab === t ? "border-accent bg-panel text-ink" : "border-transparent bg-transparent text-ink-3"}`}
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
    addInto(produces, b.yield);
    addInto(upkeep, b.upkeep);
    if (amounts(content, b.yield))
      madeBy.push(`${b.name} ${amounts(content, b.yield)}`);
    if (amounts(content, b.upkeep))
      paidBy.push(`${b.name} ${amounts(content, b.upkeep)}`);
  }
  const used = planet?.buildings.filter(Boolean).length ?? 0;

  return (
    <div className="flex items-center gap-4 border-line border-b bg-well px-3.5 py-3">
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
      </dl>
      <span className="flex-1" />
      {sel.mine && (
        <div className="grid w-90 grid-cols-2 gap-2">
          {/* With no upkeep it slides over into the Upkeep box's place: one column plus the gap. */}
          <div
            className={`rounded-md border border-ok-edge bg-ok-wash px-2.5 py-2 transition-transform duration-300 ${amounts(content, upkeep) ? "" : "translate-x-[calc(100%+0.5rem)]"}`}
          >
            <div className={`${label} text-ok`}>Produces / Payday</div>
            <div className="mt-1 font-mono text-sm">
              {amounts(content, produces) || "Nothing"}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-2">
              {madeBy.join(" · ")}
            </div>
          </div>
          {amounts(content, upkeep) && (
            <div className="rounded-md border border-danger/40 bg-danger-wash px-2.5 py-2">
              <div className={`${label} text-danger`}>Upkeep / Payday</div>
              <div className="mt-1 font-mono text-sm">
                {amounts(content, upkeep)}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-2">
                {paidBy.join(" · ")}
              </div>
            </div>
          )}
        </div>
      )}
      {sel.last && (
        <p className="w-48 text-ink-3 text-xs">
          Out of your vision: this is what you saw last.
        </p>
      )}
    </div>
  );
}

/** A Battle here, or your own debt, both of which pause this Planet. */
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
        <div className="flex items-center gap-3 border-line border-b bg-accent-wash px-3.5 py-2.5 text-sm">
          <span className="flex-1">
            <strong className="text-accent">Locked by a Battle.</strong> Its
            queues are paused and its Stacks are frozen until it ends.
          </span>
          {battles.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => conn.local.setState({ watching: b.id })}
              className="min-h-8 rounded-md border-edge bg-raised px-3"
            >
              Watch Battle
            </button>
          ))}
        </div>
      )}
      {debts.length > 0 && (
        <div className="border-danger/40 border-b bg-danger-wash px-3.5 py-2.5 text-danger text-sm">
          <strong>
            In debt:{" "}
            {debts
              .map(([r, n]) => `${content.resources.get(r)?.name ?? r} ${n}`)
              .join(", ")}
            .
          </strong>{" "}
          Every queue is paused and you can't queue anything. Sell a building or
          wait for Payday.
        </div>
      )}
    </>
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
  const now = useMatchNow(conn.local); // ticks the countdowns
  const [picking, setPicking] = useState<number | null>(null);
  // A different Planet starts without the build list open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the Planet changing only
  useEffect(() => setPicking(null), [planet.id]);
  const refund = content.rules.sellRefundPercent / 100;
  const card = "flex flex-col gap-2 rounded-md border p-2";

  if (picking !== null && editable) {
    const buildable = [...content.buildings.values()].filter(
      (b) => b.faction === props.faction,
    );
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
        <div className="grid grid-cols-2 gap-2">
          {buildable.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={isPending(local, "build")}
              onClick={() => {
                conn.queueBuilding(planet.id, picking, b.id);
                setPicking(null);
              }}
              className="flex items-center gap-2.5 rounded-md border-edge bg-item p-2 text-left"
            >
              <Tile name={b.name} size="size-12" />
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{b.name}</span>
                <span className="text-[11px] text-ink-3">
                  {b.trains?.length
                    ? `Trains ${b.trains.map((u) => content.units.get(u)?.name ?? u).join(", ")}`
                    : amounts(content, b.yield)
                      ? `+${amounts(content, b.yield)}`
                      : b.combat
                        ? "Armed: fights in Battles"
                        : ""}
                </span>
                <span className="font-mono text-[11px]">
                  {amounts(content, b.cost)} · {b.buildTime} s
                </span>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <span className={label}>Buildings</span>
      <div className="grid grid-cols-2 gap-2">
        {planet.buildings.map((id, i) => {
          const b = content.buildings.get(id);
          const building = planet.queue.find((q) => q.slot === i);
          const key = `${i}-${id}`;
          if (b) {
            return (
              <div key={key} className={`${card} border-line bg-item`}>
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 font-semibold">{b.name}</span>
                  {editable && (
                    <button
                      type="button"
                      disabled={isPending(local, "sell")}
                      onClick={() => conn.sellBuilding(planet.id, i)}
                      title={`Refunds ${amounts(content, b.cost, refund)}`}
                      className={smallButton}
                    >
                      Sell
                    </button>
                  )}
                </div>
                <Tile name={b.name} size="size-14" />
                <div className="font-mono text-[11px] text-ink-3">
                  {[
                    amounts(content, b.yield) &&
                      `+${amounts(content, b.yield)}`,
                    amounts(content, b.upkeep) &&
                      `upkeep ${amounts(content, b.upkeep)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            );
          }
          if (building) {
            const def = content.buildings.get(building.building);
            return (
              <div key={key} className={`${card} border-edge border-dashed`}>
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 font-semibold">
                    {def?.name ?? building.building}{" "}
                    <span className="font-normal text-ink-3">· building</span>
                  </span>
                  {editable && (
                    <button
                      type="button"
                      disabled={isPending(local, "cancel")}
                      onClick={() => conn.cancelQueueItem(building.id)}
                      className={smallButton}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div className="flex items-end justify-between">
                  <Tile name={def?.name ?? "?"} size="size-14" dashed />
                  <span
                    className={`font-mono text-xs ${building.paused ? "text-danger" : "text-ink-3"}`}
                  >
                    {queueStatus(building, now)}
                  </span>
                </div>
                <Progress
                  item={building}
                  total={(def?.buildTime ?? 0) * 1000}
                  offset={local.clockOffset}
                />
              </div>
            );
          }
          return editable ? (
            <button
              key={key}
              type="button"
              onClick={() => setPicking(i)}
              className="flex min-h-30 flex-col items-center justify-center gap-1 rounded-md border-edge border-dashed bg-transparent text-ink-2"
            >
              <span className="text-2xl text-accent">+</span>
              Build
            </button>
          ) : (
            <div
              key={key}
              className={`${card} border-edge border-dashed text-ink-3`}
            >
              Empty
            </div>
          );
        })}
      </div>
    </>
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
        <div className="flex flex-col items-center gap-1.5 rounded-md border border-edge border-dashed px-4 py-8 text-center">
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
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={slot === undefined || busy}
                    onClick={(e) =>
                      slot !== undefined &&
                      conn.queueUnit(planet.id, slot, id, e.shiftKey ? 5 : 1)
                    }
                    className={`flex items-center gap-2.5 rounded-md p-2 text-left ${slot === undefined ? "border-dashed bg-transparent" : "bg-item"}`}
                  >
                    <Tile name={u.name} size="size-12" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{u.name}</span>
                      <span className="text-[11px] text-ink-3">
                        {nameOf("unitClasses", u.combat.unitClass)} ·{" "}
                        {nameOf("weaponTypes", u.combat.weaponType)}
                      </span>
                      <span className="font-mono text-[11px]">
                        {amounts(content, u.cost)} · {u.commandPoints} CP ·{" "}
                        {u.buildTime} s
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
    <section className="flex w-62 flex-none flex-col gap-2.5 overflow-y-auto border-line border-l p-3.5">
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
      className={`flex items-center gap-2 rounded-md border border-line p-1.5 ${q.endsAt || q.paused ? "bg-item" : "text-ink-3"}`}
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
        className="size-6 border-0 bg-transparent p-0 text-ink-3"
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
  const [moved, setMoved] = useState<UnitSlot[][] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the server's Stacks replace the local move
  useEffect(() => setMoved(null), [stacks]);
  useEffect(() => {
    const reset = () => setMoved(null);
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
  const targets = (content.maps.get(sel.view.map)?.planets ?? []).filter(
    (p) => p.id !== planet.id,
  );
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
        <p className="mx-3 mt-2 text-ink-4 text-xs">
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
                className={`flex flex-col gap-1.5 rounded-lg border bg-panel p-2 ${rally ? "border-accent" : "border-edge"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap font-semibold text-sm">
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
                  {editable && (
                    // Shown even when empty, so emptying a Stack doesn't shift the window.
                    <select
                      aria-label={`Send Stack ${i + 1} to`}
                      value=""
                      disabled={!stack.length || isPending(local, "order")}
                      onChange={(e) =>
                        sendStack(conn, planet.id, i, e.target.value)
                      }
                      className="min-h-7 max-w-24 text-xs"
                    >
                      <option value="">Send…</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
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
      className={`h-12 rounded ${props.children ? "" : "border border-line border-dashed"} ${isDropTarget ? "outline-2 outline-accent" : ""}`}
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
      className="fixed z-30 flex w-48 flex-col rounded-md border border-edge bg-panel p-1 shadow-[0_12px_32px_#000a]"
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
      <hr className="my-1 border-line" />
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
function UnitSlotTile(props: {
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
      ref={props.ref}
      title={`${props.name} × ${slot.count}`}
      onContextMenu={props.onContextMenu}
      className={`flex h-12 flex-col justify-between rounded border border-edge bg-tile px-1.5 py-1 leading-tight ${props.draggable ? "cursor-grab" : ""} ${props.dragging ? "opacity-60 ring-2 ring-accent" : ""}`}
    >
      <span className="font-mono text-[11px] text-ink-3">
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
        <span className={label}>{army.waiting ? "In orbit" : "Route"}</span>
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
          <span aria-hidden="true" className="relative w-0.5 flex-1 bg-line">
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
          <span className="font-mono text-ink-3 text-xs">{props.eta}</span>
        )}
      </div>
    </li>
  );
}

export function Tile(props: { name: string; size: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded border font-mono text-[11px] text-ink-3 ${props.size} ${props.dashed ? "border-edge border-dashed" : "border-edge bg-tile"}`}
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
    <div className="h-1 rounded-sm bg-well">
      <div
        ref={bar}
        className={`h-full rounded-sm ${item.paused ? "bg-ink-4" : "bg-ok"}`}
      />
    </div>
  );
}
