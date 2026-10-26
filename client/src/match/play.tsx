import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import { GalaxyScene } from "../scene/galaxy";
import { BattlePanel } from "./battle";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { laneTimes } from "./route";
import type { PlanetView, QueueItem, UnitSlot } from "./store";
import { useMatchNow } from "./time";

export function PlayScreen(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const mapId = useStore(conn.store, (s) => s.view?.map);
  const map = mapId ? content.maps.get(mapId) : undefined;
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!map || !container.current) return;
    const scene = new GalaxyScene(
      container.current,
      map,
      { store: conn.store, local: conn.local },
      {
        lanes: laneTimes(map, content.rules),
        sendStack: (from, stack, to) => sendStack(conn, from, stack, to),
        moveArmy: (army, to) => conn.reorderArmy(army, to, toStackAt(conn, to)),
      },
    );
    return () => scene.dispose();
  }, [map, conn, content]);

  if (!map) return <p>Loading the galaxy…</p>;
  return (
    <>
      <Hud conn={conn} content={content} />
      <Players conn={conn} content={content} />
      <div style={{ display: "flex", height: "80vh", minHeight: 480 }}>
        <div ref={container} style={{ flex: 1, minWidth: 0 }} />
        <PlanetPanel conn={conn} content={content} />
        <ArmyPanel conn={conn} content={content} />
        <BattlePanel conn={conn} content={content} />
      </div>
    </>
  );
}

/** Arriving units join your own Planet's Rally Stack, otherwise Stack 1. */
function toStackAt(conn: MatchConnection, to: string) {
  const view = conn.store.getState().view;
  const target = view?.planets.get(to);
  return target && target.owner === view?.you ? target.rallyStack : 0;
}

/** Sends a whole Stack to another Planet as an Army. */
function sendStack(
  conn: MatchConnection,
  from: string,
  stack: number,
  to: string,
) {
  const units =
    conn.store.getState().view?.planets.get(from)?.stacks[stack] ?? [];
  if (units.length === 0 || from === to) return;
  conn.orderArmy(
    from,
    units.map((u) => ({ stack, ...u })),
    to,
    toStackAt(conn, to),
  );
}

/** The selected Army: its units and where it's headed. */
function ArmyPanel(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const id = useStore(conn.local, (s) => s.selectedArmy);
  const army = useStore(conn.store, (s) =>
    id === null ? undefined : s.view?.armies.get(id),
  );
  const you = useStore(conn.store, (s) => s.view?.you);
  const map = useStore(conn.store, (s) => s.view?.map);
  if (!army) return null;
  const planet = (p: string) =>
    content.maps.get(map ?? "")?.planets.find((mp) => mp.id === p)?.name ?? p;
  return (
    <aside style={{ width: 280, padding: "0 12px", overflowY: "auto" }}>
      <h3>Army</h3>
      <p>
        {army.waiting
          ? `In orbit at ${planet(army.to)}`
          : `${planet(army.from)} → ${planet(army.to)}`}
        {army.owner === you &&
          army.destination !== army.to &&
          `, headed for ${planet(army.destination)}`}
      </p>
      <ul>
        {army.units.map((u) => (
          <li key={u.unit}>
            {content.units.get(u.unit)?.name ?? u.unit} × {u.count}
          </li>
        ))}
      </ul>
      {army.owner === you && (
        <p>Drag it to a Planet on the map to re-order it.</p>
      )}
    </aside>
  );
}

/** Your Resources, Command Points and the countdown to the next Payday. */
function Hud(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const economy = useStore(conn.store, (s) => s.view?.economy);
  const now = useMatchNow(conn.local);
  const [lastNet, setLastNet] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    const onPayday = (e: Event) =>
      setLastNet((e as CustomEvent<Map<string, number>>).detail);
    conn.events.addEventListener("payday", onPayday);
    return () => conn.events.removeEventListener("payday", onPayday);
  }, [conn]);

  if (!economy) return null;
  const name = (id: string) => content.resources.get(id)?.name ?? id;
  const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);
  const secs = Math.max(0, Math.ceil((economy.paydayEnd - now) / 1000));

  return (
    <header style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {[...economy.resources].map(([id, amount]) => (
        <span key={id} style={amount < 0 ? { color: "crimson" } : undefined}>
          {name(id)}: {amount}
          {lastNet?.has(id) && ` (${signed(lastNet.get(id) ?? 0)})`}
        </span>
      ))}
      <span>
        Command Points: {economy.commandPointsUsed} / {economy.commandPointsCap}
      </span>
      <span>Next Payday in {secs} s</span>
    </header>
  );
}

/**
 * Every player's Planet count and whether they're out, plus any running
 * win-hold countdown: all public.
 */
function Players(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local);
  if (!view) return null;
  const map = content.maps.get(view.map);
  const total = map?.planets.length ?? 0;
  // More than the share wins, so this many is enough.
  const needed = Math.floor((map?.win.planetShare ?? 1) * total) + 1;
  const name = (seat: number) =>
    view.players[seat]?.displayName || `Player ${seat + 1}`;
  const hold = view.winHold;
  return (
    <section
      aria-label="Players"
      style={{ display: "flex", gap: 16, flexWrap: "wrap" }}
    >
      {view.players.map((p) => (
        <span key={p.seat} style={p.eliminated ? { opacity: 0.5 } : undefined}>
          {name(p.seat)}
          {p.seat === view.you && " (you)"}:{" "}
          {p.eliminated ? "eliminated" : `${p.planetCount} / ${total} Planets`}
        </span>
      ))}
      <span>
        {hold.seat === null
          ? `Hold ${needed} Planets to start the win countdown`
          : `${name(hold.seat)} wins in ${Math.max(0, Math.ceil((hold.ends - now) / 1000))} s`}
      </span>
    </section>
  );
}

const DRAG_TYPE = "application/x-halobattles-units";

/** The selected Planet: read-only, plus orders on your own. */
function PlanetPanel(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const selected = useStore(conn.local, (s) => s.selected);
  const view = useStore(conn.store, (s) => s.view);
  const local = useStore(conn.local);
  if (!selected || !view) return null;

  const mapPlanet = content.maps
    .get(view.map)
    ?.planets.find((p) => p.id === selected);
  const planet = view.planets.get(selected);
  const name = (id: string) =>
    content.units.get(id)?.name ?? content.buildings.get(id)?.name ?? id;
  const cost = (c: Record<string, number>) =>
    Object.entries(c)
      .map(([r, a]) => `${a} ${content.resources.get(r)?.name ?? r}`)
      .join(", ");
  const faction = view.players[view.you]?.faction;
  const buildable = [...content.buildings.values()].filter(
    (b) => b.faction === faction,
  );
  const mine = planet?.owner === view.you && !planet.locked;
  const ownerName = (seat: number | null) =>
    seat === null
      ? "Neutral"
      : view.players[seat]?.displayName || `Player ${seat + 1}`;

  return (
    <aside style={{ width: 280, padding: "0 12px", overflowY: "auto" }}>
      <h3>{mapPlanet?.name ?? selected}</h3>
      <p>{content.planetTypes.get(mapPlanet?.type ?? "")?.name}</p>
      {!planet ? (
        <p>Outside your vision.</p>
      ) : (
        <>
          <p>
            {ownerName(planet.owner)}
            {planet.capital && " · Capital"}
            {planet.locked && " · Locked"}
          </p>
          {[...view.battles.values()]
            .filter((b) => b.planet === planet.id)
            .map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => conn.local.setState({ watching: b.id })}
              >
                Watch Battle
              </button>
            ))}
          <h4>Buildings</h4>
          <ol>
            {planet.buildings.map((b, i) => {
              const queued = planet.queue.find((q) => q.slot === i);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: Building Slots are positional
                <li key={i}>
                  {b ? (
                    <>
                      {name(b)}{" "}
                      {mine && (
                        <button
                          type="button"
                          disabled={isPending(local, "sell")}
                          onClick={() => conn.sellBuilding(planet.id, i)}
                        >
                          Sell
                        </button>
                      )}
                    </>
                  ) : queued ? (
                    `Building ${name(queued.building)}…`
                  ) : mine ? (
                    <select
                      aria-label={`Build in slot ${i + 1}`}
                      value=""
                      disabled={isPending(local, "build")}
                      onChange={(e) =>
                        conn.queueBuilding(planet.id, i, e.target.value)
                      }
                    >
                      <option value="">Build…</option>
                      {buildable.map((bd) => (
                        <option key={bd.id} value={bd.id}>
                          {bd.name} ({cost(bd.cost)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    "(empty)"
                  )}
                </li>
              );
            })}
          </ol>
          {mine && (
            <QueueList
              title="Construction"
              conn={conn}
              content={content}
              items={planet.queue}
            />
          )}
          {mine &&
            planet.buildings.map((b, slot) => {
              const trains = content.buildings.get(b)?.trains ?? [];
              if (trains.length === 0) return null;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: Building Slots are positional
                <section key={slot}>
                  <TrainForm
                    building={name(b)}
                    units={trains.map((u) => ({
                      id: u,
                      label: `${name(u)} (${cost(content.units.get(u)?.cost ?? {})})`,
                    }))}
                    disabled={isPending(local, "train")}
                    onTrain={(unit, count) =>
                      conn.queueUnit(planet.id, slot, unit, count)
                    }
                  />
                  <QueueList
                    conn={conn}
                    content={content}
                    items={planet.unitQueue.filter((q) => q.slot === slot)}
                  />
                </section>
              );
            })}
          {planet.stacks.map((stack, i) => (
            <StackSection
              // biome-ignore lint/suspicious/noArrayIndexKey: the three Stacks are positional
              key={i}
              index={i}
              stack={stack}
              planet={planet}
              mine={mine}
              conn={conn}
              name={name}
              targets={(content.maps.get(view.map)?.planets ?? []).filter(
                (mp) => mp.id !== planet.id,
              )}
            />
          ))}
        </>
      )}
    </aside>
  );
}

/**
 * One Stack's Unit Slots. Your own can be dragged onto another Stack, or
 * moved with the "Move to" picker (Shift-drop asks for a partial count),
 * and the Rally toggle picks where trained units go.
 */
function StackSection(props: {
  index: number;
  stack: UnitSlot[];
  planet: PlanetView;
  mine: boolean;
  conn: MatchConnection;
  name: (id: string) => string;
  targets: { id: string; name: string }[]; // every other Planet
}) {
  const { index: i, stack, planet, mine, conn, name, targets } = props;
  const local = useStore(conn.local);
  const moving = isPending(local, "move");
  const move = (from: number, unit: string, count: number) =>
    count > 0 && conn.moveUnits(planet.id, from, i, unit, count);
  const others = [0, 1, 2].filter((j) => j !== i);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for the mouse; the "Move to" picker is the keyboard path
    <section
      onDragOver={(e) => mine && e.preventDefault()}
      onDrop={(e) => {
        const data = e.dataTransfer.getData(DRAG_TYPE); // "" for anything else dropped
        if (!data) return;
        const d = JSON.parse(data);
        if (d.from === i) return;
        move(
          d.from,
          d.unit,
          e.shiftKey ? Number(prompt("How many?", `${d.count}`)) : d.count,
        );
      }}
    >
      <h4>
        Stack {i + 1}{" "}
        {mine && (
          <label>
            <input
              type="radio"
              name={`rally-${planet.id}`}
              checked={planet.rallyStack === i}
              disabled={isPending(local, "rally")}
              onChange={() => conn.setRallyStack(planet.id, i)}
            />{" "}
            Rally
          </label>
        )}
      </h4>
      {mine && stack.length > 0 && (
        // The keyboard path for dragging a Stack chip onto a Planet on the map.
        <select
          aria-label={`Send Stack ${i + 1} to`}
          value=""
          disabled={isPending(local, "order")}
          onChange={(e) => sendStack(conn, planet.id, i, e.target.value)}
        >
          <option value="">Send to…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      {stack.length === 0 ? (
        <p>(empty)</p>
      ) : (
        <ul>
          {stack.map((u) => (
            <li
              key={u.unit}
              draggable={mine && !moving}
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  DRAG_TYPE,
                  JSON.stringify({ from: i, ...u }),
                )
              }
              style={mine ? { cursor: "grab" } : undefined}
            >
              {name(u.unit)} × {u.count}{" "}
              {mine && (
                <select
                  aria-label={`Move ${name(u.unit)} to`}
                  value=""
                  disabled={moving}
                  onChange={(e) =>
                    conn.moveUnits(
                      planet.id,
                      i,
                      Number(e.target.value),
                      u.unit,
                      u.count,
                    )
                  }
                >
                  <option value="">Move to…</option>
                  {others.map((j) => (
                    <option key={j} value={j}>
                      Stack {j + 1}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One queue: each item with its progress and a cancel button. */
function QueueList(props: {
  title?: string;
  conn: MatchConnection;
  content: ContentLookups;
  items: QueueItem[];
}) {
  const { conn, content, items } = props;
  const local = useStore(conn.local);
  if (items.length === 0) return null;
  const now = performance.now() + local.clockOffset;
  return (
    <>
      {props.title && <h4>{props.title}</h4>}
      <ol>
        {items.map((q) => {
          const def = q.unit
            ? content.units.get(q.unit)
            : content.buildings.get(q.building);
          return (
            <li key={q.id}>
              {def?.name ?? (q.unit || q.building)}
              {q.paused && " (paused)"}
              {q.endsAt > 0 && q.endsAt <= now && " (no room in any Stack)"}{" "}
              <button
                type="button"
                disabled={isPending(local, "cancel")}
                onClick={() => conn.cancelQueueItem(q.id)}
              >
                Cancel
              </button>
              <Progress
                item={q}
                total={(def?.buildTime ?? 0) * 1000}
                offset={local.clockOffset}
              />
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Picks a unit and a count to train at one production building. */
function TrainForm(props: {
  building: string;
  units: { id: string; label: string }[];
  disabled: boolean;
  onTrain: (unit: string, count: number) => void;
}) {
  const [unit, setUnit] = useState(props.units[0]?.id ?? "");
  const [count, setCount] = useState(1);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onTrain(unit, count);
      }}
    >
      <h4>{props.building}</h4>
      <select
        aria-label="Unit"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
      >
        {props.units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>{" "}
      <input
        aria-label="Count"
        type="number"
        min={1}
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
        style={{ width: 48 }}
      />{" "}
      <button type="submit" disabled={props.disabled || !unit}>
        Train
      </button>
    </form>
  );
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
    <div style={{ height: 4, background: "#0002" }}>
      <div ref={bar} style={{ height: "100%", background: "seagreen" }} />
    </div>
  );
}
