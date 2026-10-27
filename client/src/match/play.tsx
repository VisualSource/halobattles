import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useNotificationCenter } from "react-toastify/addons/use-notification-center";
import { useStore } from "zustand";
import { useHideHeader } from "../backdrop";
import type { ContentLookups } from "../content";
import { GalaxyScene, seatColour } from "../scene/galaxy";
import { BattlePanel } from "./battle";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";
import { inMatch } from "./phase";
import { laneTimes } from "./route";
import { useMatchContext } from "./screen";
import { formatAge, useMatchNow } from "./time";
import { notify } from "./toasts";
import {
  ArmyWindow,
  PlanetWindow,
  StacksWindow,
  sendStack,
  toStackAt,
  useDismiss,
} from "./windows";

const label = "font-mono text-[11px] text-ink-3 uppercase tracking-[0.08em]";
const popover =
  "absolute z-20 rounded-lg border border-edge bg-panel shadow-[0_12px_32px_#000a]";

export function PlayScreen(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const { matchId } = useMatchContext();
  // Leaving a Match in play is a final Forfeit. A reload only drops the
  // connection, which keeps the Seat for the Grace Period, so it isn't asked.
  useBlocker({
    shouldBlockFn: ({ next }) =>
      !inMatch(next.pathname, matchId) &&
      !confirm(
        "Leaving forfeits the Match: you'll be eliminated. Leave anyway?",
      ),
    enableBeforeUnload: false,
  });
  useHideHeader();
  usePlayNotes(conn, content);
  const mapId = useStore(conn.store, (s) => s.view?.map);
  const map = mapId ? content.maps.get(mapId) : undefined;
  const container = useRef<HTMLDivElement>(null);
  const [stacksOpen, setStacksOpen] = useState(true);

  useEffect(() => {
    if (!map || !container.current) return;
    const scene = new GalaxyScene(
      container.current,
      map,
      { store: conn.store, local: conn.local },
      {
        lanes: laneTimes(map, content.rules),
        sendStack: (from, stack, to, toStack) =>
          sendStack(conn, from, stack, to, toStack),
        moveArmy: (army, to, toStack) =>
          conn.reorderArmy(army, to, toStack ?? toStackAt(conn, to)),
      },
    );
    return () => scene.dispose();
  }, [map, conn, content]);

  if (!map) return <p className="p-8">Loading the galaxy…</p>;
  return (
    <div className="flex h-screen flex-col">
      <Hud conn={conn} content={content} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={container} className="size-full" />
        <Players conn={conn} content={content} />
        <PlanetWindow
          conn={conn}
          content={content}
          stacksOpen={stacksOpen}
          onOpenStacks={() => setStacksOpen(true)}
        />
        {stacksOpen && (
          <StacksWindow
            conn={conn}
            content={content}
            onClose={() => setStacksOpen(false)}
          />
        )}
        <ArmyWindow conn={conn} content={content} />
        <BattlePanel conn={conn} content={content} />
      </div>
    </div>
  );
}

/** A popover's open state; a click outside it or Escape closes it. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return { open, toggle: () => setOpen((o) => !o), ref };
}

/** "0:42" */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Your Resources and Command Points, the Payday countdown, the game mode,
 * any running win-hold countdown, notifications and Surrender.
 */
function Hud(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const local = useStore(conn.local);
  const now = useMatchNow(conn.local);
  const [lastNet, setLastNet] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    const onPayday = (e: Event) =>
      setLastNet((e as CustomEvent<Map<string, number>>).detail);
    conn.events.addEventListener("payday", onPayday);
    return () => conn.events.removeEventListener("payday", onPayday);
  }, [conn]);

  if (!view) return null;
  const { economy, winHold } = view;
  const span = economy.paydayEnd - economy.paydayStart;
  const done = span > 0 ? Math.min(1, (now - economy.paydayStart) / span) : 0;
  const ring = 2 * Math.PI * 12;
  const name = (seat: number) =>
    view.players[seat]?.displayName || `Player ${seat + 1}`;

  return (
    <header className="flex h-14 flex-none items-center gap-7 border-line border-b bg-bar px-5">
      <span className="font-bold font-display text-lg tracking-[0.06em]">
        HALO BATTLES
      </span>
      <span aria-hidden="true" className="h-7 w-px bg-line" />
      {[...economy.resources].map(([id, amount]) => {
        const net = lastNet?.get(id);
        return (
          <div key={id} className="flex flex-col gap-0.5">
            <span className={label}>
              {content.resources.get(id)?.name ?? id}
            </span>
            <span className={`font-mono ${amount < 0 ? "text-danger" : ""}`}>
              {amount}
              {amount < 0 ? (
                <span className="text-xs"> in debt</span>
              ) : (
                net !== undefined && (
                  <span
                    className={`text-xs ${net < 0 ? "text-danger" : "text-ok"}`}
                  >
                    {" "}
                    {net < 0 ? net : `+${net}`}
                  </span>
                )
              )}
            </span>
          </div>
        );
      })}
      <div className="flex flex-col gap-0.5">
        <span className={label}>Command Points</span>
        <span className="font-mono">
          {economy.commandPointsUsed}{" "}
          <span className="text-ink-3">/ {economy.commandPointsCap}</span>
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <circle
            cx="15"
            cy="15"
            r="12"
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="4"
          />
          <circle
            cx="15"
            cy="15"
            r="12"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="4"
            strokeDasharray={`${done * ring} ${ring}`}
            transform="rotate(-90 15 15)"
          />
        </svg>
        <div className="flex flex-col gap-0.5">
          <span className={label}>Next Payday</span>
          <span className="font-mono">{clock(economy.paydayEnd - now)}</span>
        </div>
      </div>
      <span className="flex-1" />
      {winHold.seat !== null && (
        <span className="rounded-md bg-danger-wash px-3 py-1.5 text-danger text-sm">
          {winHold.seat === view.you ? "You win" : `${name(winHold.seat)} wins`}{" "}
          in {Math.max(0, Math.ceil((winHold.ends - now) / 1000))} s
        </span>
      )}
      <Mode conn={conn} content={content} />
      <Notifications />
      {!view.players[view.you]?.eliminated && (
        <button
          type="button"
          disabled={isPending(local, "surrender")}
          onClick={() =>
            confirm("Surrender? You'll be eliminated.") && conn.surrender()
          }
          className="min-h-9 rounded-md bg-transparent px-3.5 text-danger"
        >
          Surrender
        </button>
      )}
    </header>
  );
}

/** The Ruleset's name; it opens the win rules and the hold countdown. */
function Mode(props: { conn: MatchConnection; content: ContentLookups }) {
  const view = useStore(props.conn.store, (s) => s.view);
  const now = useMatchNow(props.conn.local);
  const pop = usePopover();
  const map = view && props.content.maps.get(view.map);
  if (!view || !map) return null;
  const mode = props.content.rulesets.get(view.ruleset)?.name ?? view.ruleset;
  const total = map.planets.length;
  // More than the share wins, so this many is enough.
  const needed = Math.floor(map.win.planetShare * total) + 1;
  const hold = view.winHold;
  const holder =
    hold.seat === null
      ? null
      : hold.seat === view.you
        ? "You"
        : view.players[hold.seat]?.displayName || `Player ${hold.seat + 1}`;

  return (
    <div ref={pop.ref} className="relative">
      <button
        type="button"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="flex min-h-9 items-center gap-2 rounded-md border-line bg-panel px-3"
      >
        <span className={label}>Mode</span>
        {mode}
      </button>
      {pop.open && (
        <div
          className={`${popover} top-11 right-0 flex w-75 flex-col gap-2.5 p-3.5 text-sm`}
        >
          <h2 className="font-display font-semibold text-base">{mode}</h2>
          <p className="text-ink-2">Win either way:</p>
          <p className="flex gap-2">
            <span className="font-mono text-accent">1</span>
            <span>
              Hold more than {Math.round(map.win.planetShare * 100)}% of the
              Planets (<b className="font-mono">{needed}</b> of {total}) for{" "}
              <b className="font-mono">{map.win.holdSeconds} s</b>.
            </span>
          </p>
          <p className="flex gap-2">
            <span className="font-mono text-accent">2</span>
            <span>Be the last player not eliminated.</span>
          </p>
          <p className="rounded-md bg-well px-2.5 py-2 text-ink-2">
            Losing your Capital eliminates you.
          </p>
          <p className="flex justify-between border-line border-t pt-2 text-ink-3">
            <span>Hold countdown</span>
            <span>
              {holder === null
                ? `nobody holds ${needed} yet`
                : `${holder}: ${Math.max(0, Math.ceil((hold.ends - now) / 1000))} s left`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Every toast so far, newest first, since toasts vanish after a while. */
function Notifications() {
  const { notifications, unreadCount, markAllAsRead, clear } =
    useNotificationCenter();
  const pop = usePopover();
  return (
    <div ref={pop.ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="relative flex h-9 w-10 items-center justify-center rounded-md border-line bg-panel p-0"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M4 13V8a5 5 0 0 1 10 0v5l1.5 1.5h-13zM7.5 16h3"
            fill="none"
            stroke="var(--color-ink-2)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 font-mono font-semibold text-[11px] text-accent-ink">
            {unreadCount}
          </span>
        )}
      </button>
      {pop.open && (
        <div className={`${popover} top-11 right-0 flex w-90 flex-col`}>
          <div className="flex items-center gap-1 border-line border-b px-3.5 py-2.5">
            <h2 className="flex-1 font-display font-semibold text-base">
              Notifications
            </h2>
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="min-h-7 border-0 bg-transparent text-accent text-xs"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={clear}
              className="min-h-7 border-0 bg-transparent text-ink-3 text-xs"
            >
              Clear
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="p-3.5 text-ink-3 text-sm">Nothing yet.</p>
          ) : (
            <ol className="max-h-105 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex gap-2.5 border-divider border-b px-3.5 py-2.5 ${n.read ? "text-ink-2" : "bg-highlight"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-1.5 flex-none rounded-full ${n.read ? "" : "bg-accent"}`}
                  />
                  <div className="min-w-0 flex-1">
                    {typeof n.content === "function" ? null : n.content}
                  </div>
                  <span className="font-mono text-[11px] text-ink-3">
                    {formatAge(Date.now() - n.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Every player's Planet count and whether they're out, all public. Closed by
 * default; it opens upward from the map's corner.
 */
function Players(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local);
  const pop = usePopover();
  if (!view) return null;
  const total = content.maps.get(view.map)?.planets.length ?? 0;
  return (
    <div ref={pop.ref} className="absolute bottom-4 left-4 z-10">
      <button
        type="button"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="flex min-h-9 items-center gap-2 rounded-md border-line bg-bar/95 px-3"
      >
        <span aria-hidden="true" className="flex gap-0.75">
          {view.players.map((p) => (
            <span
              key={p.seat}
              className="size-2 rounded-xs"
              style={{ background: seatColour(p.seat) }}
            />
          ))}
        </span>
        Players
      </button>
      {pop.open && (
        <ul
          className={`${popover} bottom-11 left-0 flex w-75 flex-col gap-1 p-3`}
        >
          {view.players.map((p) => (
            <li
              key={p.seat}
              className={`flex items-center gap-2 rounded px-1.5 py-1 ${p.seat === view.you ? "bg-highlight" : ""} ${p.eliminated ? "opacity-50" : ""}`}
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: seatColour(p.seat) }}
              />
              <span className="flex-1">
                {p.displayName || `Player ${p.seat + 1}`}
                {p.seat === view.you && (
                  <span className="text-ink-3"> (you)</span>
                )}
                {!p.eliminated && !p.connected && (
                  <span className="text-danger text-xs">
                    {" "}
                    offline · forfeits in{" "}
                    {Math.max(0, Math.ceil((p.graceEnds - now) / 1000))} s
                  </span>
                )}
              </span>
              <span className="font-mono text-sm">
                {p.eliminated ? "out" : `${p.planetCount} / ${total}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Toasts for what happens in play: Paydays, captures, Battles, eliminations. */
function usePlayNotes(conn: MatchConnection, content: ContentLookups) {
  useEffect(() => {
    const view = () => conn.store.getState().view;
    const planet = (id: string) =>
      content.maps.get(view()?.map ?? "")?.planets.find((p) => p.id === id)
        ?.name ?? id;
    const who = (seat: number | null) =>
      seat === null
        ? "Neutral"
        : seat === view()?.you
          ? "You"
          : view()?.players[seat]?.displayName || `Player ${seat + 1}`;
    const show = (id: string) => ({
      label: "Show",
      onClick: () => conn.local.setState({ selected: id }),
    });
    const detail = <T,>(e: Event) => (e as CustomEvent<T>).detail;

    const handlers: Record<string, (e: Event) => void> = {
      payday: (e) =>
        notify(
          "payday",
          [...detail<Map<string, number>>(e)]
            .map(
              ([r, n]) =>
                `${n < 0 ? n : `+${n}`} ${content.resources.get(r)?.name ?? r}`,
            )
            .join(" · "),
        ),
      captured: (e) => {
        const {
          planet: id,
          from,
          to,
        } = detail<{
          planet: string;
          from: number | null;
          to: number;
        }>(e);
        const you = view()?.you;
        const text =
          to === you
            ? `You took ${planet(id)}${from === null ? "" : ` from ${who(from)}`}`
            : from === you
              ? `${who(to)} took ${planet(id)} from you`
              : `${who(to)} took ${planet(id)}`;
        notify("captured", text, show(id));
      },
      battleStarted: (e) => {
        const { battle, planet: id } = detail<{
          battle: number;
          planet: string;
        }>(e);
        notify("battle", `Battle at ${planet(id)}`, {
          label: "Watch",
          // Only the two sides can watch; others just hear of it.
          onClick: () =>
            view()?.battles.has(battle)
              ? conn.local.setState({ watching: battle })
              : conn.local.setState({ selected: id }),
        });
      },
      battleEnded: (e) => {
        const { planet: id, winner } = detail<{
          planet: string;
          winner: number | null;
        }>(e);
        notify(
          "battle",
          `Battle at ${planet(id)} is over: ${who(winner)} won`,
          show(id),
        );
      },
      eliminated: (e) => {
        const { seat } = detail<{ seat: number }>(e);
        notify(
          "player",
          seat === view()?.you
            ? "You were eliminated"
            : `${who(seat)} was eliminated`,
        );
      },
    };
    for (const [type, fn] of Object.entries(handlers)) {
      conn.events.addEventListener(type, fn);
    }
    return () => {
      for (const [type, fn] of Object.entries(handlers)) {
        conn.events.removeEventListener(type, fn);
      }
    };
  }, [conn, content]);
}
