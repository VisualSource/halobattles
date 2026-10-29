import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useNotificationCenter } from "react-toastify/addons/use-notification-center";
import { useStore } from "zustand";
import { useHideHeader } from "../backdrop";
import type { ContentLookups } from "../content";
import { GalaxyScene, seatColour } from "../scene/galaxy";
import { BattlePanel } from "./battle";
import type { MatchConnection } from "./connection";
import { moneyOf, quote } from "./exchange";
import { isPending } from "./local";
import { inMatch } from "./phase";
import { laneTimes } from "./route";
import { useMatchContext } from "./screen";
import { ConfirmDialog } from "./status";
import { formatAge, useMatchNow, useWallNow } from "./time";
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
const chip =
  "ml-1.5 rounded px-1 py-px font-sans font-semibold text-[9px] text-accent-ink tracking-[0.1em]";

export function PlayScreen(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const { matchId } = useMatchContext();
  // Leaving a Match in play is a final Forfeit. A reload only drops the
  // connection, which keeps the Seat for the Grace Period, so it isn't asked.
  const leaving = useBlocker({
    shouldBlockFn: ({ next }) => !inMatch(next.pathname, matchId),
    enableBeforeUnload: false,
    withResolver: true,
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
      <ConfirmDialog
        open={leaving.status === "blocked"}
        eyebrow="LEAVE MATCH"
        title="Leave and Forfeit?"
        confirm="LEAVE"
        cancel="Stay"
        onConfirm={() => leaving.proceed?.()}
        onCancel={() => leaving.reset?.()}
      >
        Leaving a Match in play is final: you'll be eliminated, and your Planets
        turn neutral.
      </ConfirmDialog>
      <Hud conn={conn} content={content} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={container} className="size-full" />
        <Players conn={conn} />
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
  // The ref apart: the React Compiler treats any object holding one as a ref.
  return [{ open, toggle: () => setOpen((o) => !o) }, ref] as const;
}

/** "0:42" */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Your Resources against their caps with the next Payday's projected
 * change, the Exchange, Command Points, the Payday countdown, the game
 * mode, any running win-hold countdown, notifications and Surrender.
 */
function Hud(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const local = useStore(conn.local);
  const now = useMatchNow(conn.local);

  if (!view) return null;
  const { economy, winHold } = view;
  const span = economy.paydayEnd - economy.paydayStart;
  const done = span > 0 ? Math.min(1, (now - economy.paydayStart) / span) : 0;
  const ring = 2 * Math.PI * 12;
  const name = (seat: number) =>
    view.players[seat]?.displayName || `Player ${seat + 1}`;

  return (
    <header className="border-line bg-bar flex h-14 flex-none items-center gap-7 border-b px-5">
      <span className="font-display text-lg font-bold tracking-[0.06em]">
        HALO BATTLES
      </span>
      <span aria-hidden="true" className="bg-line h-7 w-px" />
      {[...economy.resources].map(([id, amount]) => {
        const name = content.resources.get(id)?.name ?? id;
        const cap = economy.caps.get(id);
        const net = economy.projected.get(id) ?? 0;
        const full = cap !== undefined && amount >= cap;
        const lost = cap === undefined ? 0 : Math.max(0, amount + net - cap);
        return (
          <div
            key={id}
            title={
              lost > 0
                ? `${lost} ${name} over the cap will be lost at the next Payday`
                : undefined
            }
            className={`-mx-2 flex flex-col gap-0.5 rounded-md border px-2 py-0.5 ${full ? "border-accent/40 bg-accent-wash" : "border-transparent"}`}
          >
            <span className={`${label} ${full ? "text-accent" : ""}`}>
              {name}
              {full && <span className={`${chip} bg-accent`}>Full</span>}
              {amount < 0 && <span className={`${chip} bg-danger`}>Debt</span>}
            </span>
            <span className="font-mono whitespace-nowrap">
              <span
                className={
                  amount < 0 ? "text-danger" : full ? "text-accent" : ""
                }
              >
                {amount}
              </span>
              {cap !== undefined && (
                <span className="text-ink-4"> / {cap}</span>
              )}
              {net !== 0 && (
                <span
                  className={`text-xs ${full && net > 0 ? "text-ink-4 line-through" : net < 0 ? "text-danger" : "text-ok"}`}
                >
                  {" "}
                  {net < 0 ? net : `+${net}`}
                </span>
              )}
            </span>
          </div>
        );
      })}
      <Exchange conn={conn} content={content} />
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
        <span className="bg-danger-wash text-danger rounded-md px-3 py-1.5 text-sm">
          {winHold.seat === view.you ? "You win" : `${name(winHold.seat)} wins`}{" "}
          in {Math.max(0, Math.ceil((winHold.ends - now) / 1000))} s
        </span>
      )}
      <Mode conn={conn} content={content} />
      <Notifications />
      {!view.players[view.you]?.eliminated && (
        <SurrenderButton conn={conn} pending={isPending(local, "surrender")} />
      )}
    </header>
  );
}

/** Surrender, after asking: it's a Forfeit. */
function SurrenderButton(props: { conn: MatchConnection; pending: boolean }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => setAsking(true)}
        className="text-danger min-h-9 rounded-md bg-transparent px-3.5"
      >
        Surrender
      </button>
      <ConfirmDialog
        open={asking}
        eyebrow="SURRENDER"
        title="Surrender this Match?"
        confirm="SURRENDER"
        cancel="Keep playing"
        onConfirm={() => {
          setAsking(false);
          props.conn.surrender();
        }}
        onCancel={() => setAsking(false)}
      >
        Surrendering is a Forfeit: you'll be eliminated, your Planets turn
        neutral, and your Armies are lost.
      </ConfirmDialog>
    </>
  );
}

/** The Ruleset's name; it opens the win rules and the hold countdown. */
function Mode(props: { conn: MatchConnection; content: ContentLookups }) {
  const view = useStore(props.conn.store, (s) => s.view);
  const now = useMatchNow(props.conn.local);
  const [pop, popRef] = usePopover();
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
    <div ref={popRef} className="relative">
      <button
        type="button"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="border-line bg-panel flex min-h-9 items-center gap-2 rounded-md px-3"
      >
        <span className={label}>Mode</span>
        {mode}
      </button>
      {pop.open && (
        <div
          className={`${popover} top-11 right-0 flex w-75 flex-col gap-2.5 p-3.5 text-sm`}
        >
          <h2 className="font-display text-base font-semibold">{mode}</h2>
          <p className="text-ink-2">Win either way:</p>
          <p className="flex gap-2">
            <span className="text-accent font-mono">1</span>
            <span>
              Hold more than {Math.round(map.win.planetShare * 100)}% of the
              Planets (<b className="font-mono">{needed}</b> of {total}) for{" "}
              <b className="font-mono">{map.win.holdSeconds} s</b>.
            </span>
          </p>
          <p className="flex gap-2">
            <span className="text-accent font-mono">2</span>
            <span>Be the last player not eliminated.</span>
          </p>
          <p className="bg-well text-ink-2 rounded-md px-2.5 py-2">
            Losing your Capital eliminates you.
          </p>
          <p className="border-line text-ink-3 flex justify-between border-t pt-2">
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

/**
 * Trades for Credits and back at the Ruleset's rates. The amount always
 * counts the other Resource: how much to sell, or how much to buy.
 */
function Exchange(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const economy = useStore(conn.store, (s) => s.view?.economy);
  const pending = useStore(conn.local, (s) => isPending(s, "exchange"));
  const [pop, popRef] = usePopover();
  const rates = content.rules.exchange;
  const money = moneyOf(rates);
  const others = [...new Set(rates.flatMap((r) => [r.give, r.get]))].filter(
    (r) => r !== money,
  );
  const [mode, setMode] = useState<"sell" | "buy">("sell");
  const [other, setOther] = useState(others[0] ?? "");
  const [qty, setQty] = useState<number | null>(null); // null: one step
  if (!economy || !money) return null;

  const have = economy.resources;
  const name = (r: string) => content.resources.get(r)?.name ?? r;
  const step = quote(rates, money, mode, other, 0, have)?.step ?? 1;
  const amount = qty ?? step;
  const q = quote(rates, money, mode, other, amount, have);
  const pick = (m: typeof mode, r: string) => {
    setMode(m);
    setOther(r);
    setQty(null);
  };
  const after = (r: string, d: number) => (have.get(r) ?? 0) + d;
  const cap = q && economy.caps.get(q.rate.get);
  const seg = (on: boolean) =>
    `min-h-8 flex-1 rounded-none border-0 ${on ? "bg-raised text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "bg-transparent text-ink-3"}`;
  const error = !q
    ? `${name(other)} can't be ${mode === "sell" ? "sold" : "bought"} here`
    : !q.inSteps
      ? `Amounts go in steps of ${q.step}`
      : !q.affordable
        ? `Not enough ${name(q.rate.give)}: you have ${have.get(q.rate.give) ?? 0}`
        : null;

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className={`min-h-9 rounded-md px-3 ${pop.open ? "border-accent bg-accent-wash text-accent" : "border-line bg-panel"}`}
      >
        ⇄ Exchange
      </button>
      {pop.open && (
        <div
          className={`${popover} top-11 left-0 flex w-85 flex-col gap-3 p-3.5 text-sm`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Exchange</h2>
            <span className="text-ink-3 text-xs">any time, even in debt</span>
          </div>
          <div className="border-edge flex overflow-hidden rounded-md border">
            {(["sell", "buy"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => pick(m, other)}
                className={seg(mode === m)}
              >
                {m === "sell" ? "Sell for" : "Buy with"} {name(money)}
              </button>
            ))}
          </div>
          <div className="border-edge flex overflow-hidden rounded-md border">
            {others.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={other === r}
                onClick={() => pick(mode, r)}
                className={seg(other === r)}
              >
                {name(r)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[2rem_1fr_2rem_auto] items-center gap-1.5">
            <button
              type="button"
              aria-label={`${step} fewer`}
              onClick={() => setQty(Math.max(step, amount - step))}
              className="border-edge bg-raised min-h-8 rounded-md p-0"
            >
              −
            </button>
            <input
              id="exchange-amount"
              inputMode="numeric"
              aria-label={`${name(other)} to ${mode}, in steps of ${step}`}
              value={amount}
              onChange={(e) => setQty(Number(e.target.value) || 0)}
              className="border-edge bg-well min-h-8 rounded-md border text-center font-mono"
            />
            <button
              type="button"
              aria-label={`${step} more`}
              onClick={() => setQty(amount + step)}
              className="border-edge bg-raised min-h-8 rounded-md p-0"
            >
              +
            </button>
            <button
              type="button"
              disabled={!q || q.max === 0}
              onClick={() => q && setQty(q.max)}
              className="border-edge bg-raised min-h-8 rounded-md px-3"
            >
              Max
            </button>
          </div>
          {q && (
            <div className="border-line bg-well grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border p-2.5">
              <div className="flex flex-col gap-0.5">
                <span className={label}>You give</span>
                <span
                  className={`font-mono text-lg ${q.affordable ? "" : "text-danger"}`}
                >
                  {q.give}
                </span>
                <span className="text-ink-3 text-xs">
                  {name(q.rate.give)} · {have.get(q.rate.give) ?? 0} →{" "}
                  {after(q.rate.give, -q.give)}
                </span>
              </div>
              <span aria-hidden="true" className="text-ink-4 text-lg">
                →
              </span>
              <div className="flex flex-col gap-0.5 text-right">
                <span className={label}>You get</span>
                <span className="text-ok font-mono text-lg">{q.get}</span>
                <span className="text-ink-3 text-xs">
                  {name(q.rate.get)} · {have.get(q.rate.get) ?? 0} →{" "}
                  {after(q.rate.get, q.get)}
                </span>
              </div>
            </div>
          )}
          {q && (
            <p className="text-ink-3 text-xs">
              Rate: {q.rate.giveAmount} {name(q.rate.give)} → {q.rate.getAmount}{" "}
              {name(q.rate.get)}.
            </p>
          )}
          {error ? (
            <p className="text-danger text-xs">{error}</p>
          ) : (
            q &&
            cap !== undefined &&
            cap !== null &&
            after(q.rate.get, q.get) > cap && (
              <p className="border-accent/40 bg-accent-wash text-accent rounded-md border px-2.5 py-2 text-xs">
                {name(q.rate.get)} go over their cap of {cap}. Whatever is still
                over it at the next Payday is lost.
              </p>
            )
          )}
          <button
            type="button"
            disabled={error !== null || pending}
            onClick={() => q && conn.exchange(q.rate.give, q.rate.get, q.give)}
            className="border-accent bg-accent text-accent-ink min-h-9 rounded-md font-semibold"
          >
            {mode === "sell" ? "Sell" : "Buy"} {amount} {name(other)}
          </button>
        </div>
      )}
    </div>
  );
}

/** Every toast so far, newest first, since toasts vanish after a while. */
function Notifications() {
  const { notifications, unreadCount, markAllAsRead, clear } =
    useNotificationCenter();
  const [pop, popRef] = usePopover();
  const now = useWallNow();
  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="border-line bg-panel relative flex h-9 w-10 items-center justify-center rounded-md p-0"
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
          <span className="bg-accent text-accent-ink absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 font-mono text-[11px] font-semibold">
            {unreadCount}
          </span>
        )}
      </button>
      {pop.open && (
        <div className={`${popover} top-11 right-0 flex w-90 flex-col`}>
          <div className="border-line flex items-center gap-1 border-b px-3.5 py-2.5">
            <h2 className="font-display flex-1 text-base font-semibold">
              Notifications
            </h2>
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="text-accent min-h-7 border-0 bg-transparent text-xs"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-ink-3 min-h-7 border-0 bg-transparent text-xs"
            >
              Clear
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="text-ink-3 p-3.5 text-sm">Nothing yet.</p>
          ) : (
            <ol className="max-h-105 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`border-divider flex gap-2.5 border-b px-3.5 py-2.5 ${n.read ? "text-ink-2" : "bg-highlight"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-1.5 flex-none rounded-full ${n.read ? "" : "bg-accent"}`}
                  />
                  <div className="min-w-0 flex-1">
                    {typeof n.content === "function" ? null : n.content}
                  </div>
                  <span className="text-ink-3 font-mono text-[11px]">
                    {formatAge(now - n.createdAt)}
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
 * Every player, and whether they're offline or out, all public. Closed by
 * default; it opens upward from the map's corner.
 */
function Players(props: { conn: MatchConnection }) {
  const { conn } = props;
  const view = useStore(conn.store, (s) => s.view);
  const now = useMatchNow(conn.local);
  const [pop, popRef] = usePopover();
  if (!view) return null;
  return (
    <div ref={popRef} className="absolute bottom-4 left-4 z-10">
      <button
        type="button"
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="border-line bg-bar/95 flex min-h-9 items-center gap-2 rounded-md px-3"
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
              {p.eliminated && <span className="font-mono text-sm">out</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Toasts for what happens in play: captures, Battles, eliminations. */
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
    /** A Battle you're a side of: it has a report, running or over. */
    const mine = (battle: number) =>
      conn.local.getState().reports.has(battle) ||
      !!view()?.battles.has(battle);

    // No Payday toast: the header shows each Payday's change already.
    const handlers: Record<string, (e: Event) => void> = {
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
          // Live while it runs, its report once it's over. Only the two
          // sides have either; others just hear of it.
          onClick: () =>
            mine(battle)
              ? conn.local.setState({ watching: battle })
              : conn.local.setState({ selected: id }),
        });
      },
      battleEnded: (e) => {
        const {
          battle,
          planet: id,
          winner,
        } = detail<{
          battle: number;
          planet: string;
          winner: number | null;
        }>(e);
        notify(
          "battle",
          `Battle at ${planet(id)} is over: ${who(winner)} won`,
          mine(battle)
            ? {
                label: "Report",
                onClick: () => conn.local.setState({ watching: battle }),
              }
            : show(id),
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
