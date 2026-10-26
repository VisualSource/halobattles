import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import { GalaxyScene } from "../scene/galaxy";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import type { QueueItem } from "./store";
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
    const scene = new GalaxyScene(container.current, map, {
      store: conn.store,
      local: conn.local,
    });
    return () => scene.dispose();
  }, [map, conn]);

  if (!map) return <p>Loading the galaxy…</p>;
  return (
    <>
      <Hud conn={conn} content={content} />
      <div style={{ display: "flex", height: "80vh", minHeight: 480 }}>
        <div ref={container} style={{ flex: 1, minWidth: 0 }} />
        <PlanetPanel conn={conn} content={content} />
      </div>
    </>
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

/** Read-only details of the selected Planet. */
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
          <h4>Buildings</h4>
          <ol>
            {planet.buildings.map((b, i) => {
              const queued = planet.queue.find((q) => q.slot === i);
              const mine = planet.owner === view.you && !planet.locked;
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
          {planet.queue.length > 0 && (
            <>
              <h4>Construction</h4>
              <ol>
                {planet.queue.map((q) => (
                  <li key={q.id}>
                    {name(q.building)}
                    {q.paused && " (paused)"}{" "}
                    <button
                      type="button"
                      disabled={isPending(local, "cancel") || planet.locked}
                      onClick={() => conn.cancelQueueItem(q.id)}
                    >
                      Cancel
                    </button>
                    <Progress
                      item={q}
                      total={
                        (content.buildings.get(q.building)?.buildTime ?? 0) *
                        1000
                      }
                      offset={local.clockOffset}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
          {planet.stacks.map((stack, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the three Stacks are positional
            <section key={i}>
              <h4>Stack {i + 1}</h4>
              {stack.length === 0 ? (
                <p>(empty)</p>
              ) : (
                <ul>
                  {stack.map((u) => (
                    <li key={u.unit}>
                      {name(u.unit)} × {u.count}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </aside>
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
