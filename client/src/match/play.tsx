import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
  type ReactNode,
  startTransition,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { useNotificationCenter } from "react-toastify/addons/use-notification-center";
import { useStore } from "zustand";
import { useHideHeader } from "../backdrop";
import type { ContentLookups } from "../content";
import { GalaxyScene, seatColour } from "../scene/galaxy";
import { planetIconsQuery } from "../scene/planet-icons";
import { BattlePanel } from "./battle";
import type { MatchConnection } from "./connection";
import { moneyOf, presets, quote } from "./exchange";
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
/** "18K", "1.4K" */
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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
        <PlanetList conn={conn} content={content} />
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

/**
 * Your Planets, Capital first, like Stellaris's outliner: a click selects
 * one, a double-click (or Enter) also centres the map on it.
 */
function PlanetList(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const view = useStore(conn.store, (s) => s.view);
  const selected = useStore(conn.local, (s) => s.selected);
  const [open, setOpen] = useState(true);
  const map = view ? content.maps.get(view.map) : undefined;
  const icons = useQuery(planetIconsQuery(map, 96)).data; // shown at 40px, sharp at 2x
  if (!view || !map) return null;
  const mine = map.planets
    .map((mp) => ({ mp, p: view.planets.get(mp.id) }))
    .filter(({ p }) => p?.owner === view.you)
    .sort(
      (a, b) =>
        Number(b.p?.capital) - Number(a.p?.capital) ||
        a.mp.name.localeCompare(b.mp.name),
    );
  const jump = (planet: string) =>
    conn.local.setState({ selected: planet, focus: { planet } });

  // One section morphs between the panel and a tab on the screen's right edge.
  const toggle = () => startTransition(() => setOpen(!open));

  return (
    <ViewTransition name="planet-list">
      <section
        aria-label="Your Planets"
        className={`border-edge bg-panel/95 absolute top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden border shadow-[0_12px_32px_#000a] ${open ? "right-4 h-[min(30rem,calc(100%-2rem))] w-72 rounded-lg" : "right-0 h-32 w-8 rounded-l-lg border-r-0"}`}
      >
        {open ? (
          <button
            type="button"
            aria-expanded
            title="Collapse"
            onClick={toggle}
            className="bg-bar border-line flex h-10 flex-none items-center gap-2 rounded-none border-0 border-b px-3 text-left"
          >
            <h2 className="font-display flex-1 text-base font-semibold">
              Planets
            </h2>
            <span className="text-ink-3 font-mono text-sm">{mine.length}</span>
            <span aria-hidden="true" className="text-ink-3">
              ›
            </span>
          </button>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            aria-label="Show Planets"
            title="Show Planets"
            onClick={toggle}
            className="text-ink-2 hover:bg-raised size-full rounded-none border-0 bg-transparent p-0 text-xl"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        {open && (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {mine.map(({ mp, p }) => {
              if (!p) return null;
              const units = p.stacks.flat().reduce((n, s) => n + s.count, 0);
              const building = p.queue.length;
              const training = p.unitQueue.length;
              return (
                <li key={mp.id}>
                  <button
                    type="button"
                    title="Double-click to jump to it"
                    aria-current={selected === mp.id}
                    onClick={() => conn.local.setState({ selected: mp.id })}
                    onDoubleClick={() => jump(mp.id)}
                    onKeyDown={(e) => e.key === "Enter" && jump(mp.id)}
                    className={`border-divider flex w-full items-center gap-2.5 rounded-none border-0 border-b px-3 py-2 text-left ${selected === mp.id ? "bg-highlight" : "hover:bg-item bg-transparent"}`}
                  >
                    <PlanetIcon url={icons?.get(mp.id)} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 truncate font-semibold">
                        {p.capital && (
                          <span title="Capital" className="text-host">
                            ★
                          </span>
                        )}
                        {mp.name}
                      </span>
                      <span className="text-ink-3 truncate text-xs">
                        {content.planetTypes.get(mp.type)?.name ?? mp.type}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5 font-mono text-xs">
                      {p.locked ? (
                        <span className="text-danger">In Battle</span>
                      ) : (
                        <span
                          className="text-ink-2"
                          title="Units in its Stacks"
                        >
                          {units} units
                        </span>
                      )}
                      {(building > 0 || training > 0) && (
                        <span
                          className="text-ok"
                          title="Queued: buildings, units"
                        >
                          {building > 0 && `⚒${building}`}
                          {building > 0 && training > 0 && " "}
                          {training > 0 && `⚔${training}`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </ViewTransition>
  );
}

/** A Planet's rendered icon, or a dim disc in its place until it's ready. */
function PlanetIcon(props: { url: string | undefined }) {
  return props.url ? (
    <img src={props.url} alt="" className="size-10 flex-none" />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-10 flex-none items-center justify-center"
    >
      <span className="bg-raised size-6 rounded-full" />
    </span>
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
      <Stockpile conn={conn} content={content} />
      <span
        title="Command Points in use, of your cap"
        className="flex flex-col items-center gap-0.5 font-mono leading-none"
      >
        <span className={`${label} flex h-4.5 items-center`}>CP</span>
        <span
          className={
            economy.commandPointsUsed >= economy.commandPointsCap
              ? "text-accent"
              : ""
          }
        >
          {economy.commandPointsUsed}
          <span className="text-ink-4">/{economy.commandPointsCap}</span>
        </span>
      </span>
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

// shortcut: the base Mod's Resources drawn here, since Mods can't ship assets
// yet; once they can, draw a Resource's own `icon` instead.
const resourceGlyphs: Record<string, ReactNode> = {
  "base:credits": (
    <>
      <circle cx="9" cy="9" r="7.5" fill="var(--color-res-credits)" />
      <circle
        cx="9"
        cy="9"
        r="4.5"
        fill="none"
        stroke="var(--color-bar)"
        strokeWidth="1.5"
      />
    </>
  ),
  "base:materials": (
    <>
      <path
        d="M9 1.5 15.5 6v6L9 16.5 2.5 12V6z"
        fill="var(--color-res-materials)"
      />
      <path
        d="M2.5 6 9 9l6.5-3M9 9v7.5"
        fill="none"
        stroke="var(--color-bar)"
        strokeWidth="1.2"
      />
    </>
  ),
  "base:alloys": (
    <>
      <path d="M4 8.5 6 4h6l2 4.5z" fill="var(--color-res-alloys)" />
      <path d="M1.5 15 3.5 10h11l2 5z" fill="var(--color-res-alloys)" />
    </>
  ),
};

/** A Resource's icon; one without its own shows its initial. */
function ResourceIcon(props: { id: string; name: string; size?: number }) {
  const size = props.size ?? 18;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      {resourceGlyphs[props.id] ?? (
        <>
          <circle cx="9" cy="9" r="7.5" fill="var(--color-ink-3)" />
          <text
            x="9"
            y="12.5"
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="var(--color-bar)"
          >
            {props.name[0]}
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Your Resources, each its icon over its amount and the next Payday's change, coloured in
 * debt or at its cap; the details are in its tooltip. Clicking one opens the
 * Exchange on it: trades for Credits and back at the Ruleset's rates. The
 * amount always counts the other Resource: how much to sell, or how much to buy.
 */
function Stockpile(props: { conn: MatchConnection; content: ContentLookups }) {
  const { conn, content } = props;
  const economy = useStore(conn.store, (s) => s.view?.economy);
  const pending = useStore(conn.local, (s) => isPending(s, "exchange"));
  const [pop, popRef] = usePopover();
  const rates = content.rules.exchange;
  const money = moneyOf(rates);
  const others = [...new Set(rates.flatMap((r) => [r.give, r.get]))].filter(
    (r) => r !== money,
  );
  const [other, setOther] = useState(others[0] ?? "");
  if (!economy) return null;

  const have = economy.resources;
  const name = (r: string) => content.resources.get(r)?.name ?? r;
  // Over its cap after this trade and the next Payday, so some is lost.
  const overCap = (r: string, gain: number) => {
    const cap = economy.caps.get(r);
    const after = (have.get(r) ?? 0) + gain + (economy.projected.get(r) ?? 0);
    return cap !== undefined && after > cap;
  };

  // Credits close it; another Resource switches to it, or closes it if it's showing.
  const openOn = (r: string) => {
    if (pop.open && (r === money || r === other)) return pop.toggle();
    if (r !== money) setOther(r);
    if (!pop.open) pop.toggle();
  };

  return (
    <div ref={popRef} className="relative flex items-center gap-1">
      {[...have].map(([id, amount]) => {
        const cap = economy.caps.get(id);
        const net = economy.projected.get(id) ?? 0;
        const full = cap !== undefined && amount >= cap;
        const lost = cap === undefined ? 0 : Math.max(0, amount + net - cap);
        const tip = [
          `${name(id)}: ${amount}${cap === undefined ? "" : ` of ${cap}`}`,
          `Next Payday: ${net < 0 ? net : `+${net}`}`,
          amount < 0 &&
            "In debt: you can't queue anything until it's paid off.",
          lost > 0 && `${lost} over the cap will be lost.`,
        ]
          .filter(Boolean)
          .join("\n");
        return (
          <button
            key={id}
            type="button"
            title={tip}
            aria-label={`${tip} Open the Exchange.`}
            aria-expanded={pop.open && other === id}
            disabled={!money}
            onClick={() => openOn(id)}
            className={`flex flex-col items-center gap-0.5 rounded border-0 px-2 py-1 font-mono leading-none whitespace-nowrap ${pop.open && other === id ? "bg-raised" : "bg-transparent"}`}
          >
            <ResourceIcon id={id} name={name(id)} />
            <span className="flex items-baseline gap-1">
              <span
                className={
                  amount < 0 ? "text-danger" : full ? "text-accent" : "text-ink"
                }
              >
                {compact.format(amount)}
              </span>
              {net !== 0 && (
                <span
                  className={`text-xs ${net < 0 ? "text-danger" : full ? "text-ink-4" : "text-ok"}`}
                >
                  {net < 0 ? compact.format(net) : `+${compact.format(net)}`}
                </span>
              )}
            </span>
          </button>
        );
      })}
      {pop.open && money && (
        <section
          aria-label="Exchange"
          className={`${popover} top-full left-0 mt-2 flex w-150 flex-col text-sm`}
        >
          <header className="border-line flex items-center gap-3 border-b px-3.5 py-2.5">
            <h2 className="font-display flex-1 text-base font-semibold">
              Exchange
            </h2>
            <span className={label}>any time, even in debt</span>
          </header>
          <div className="border-line flex flex-col gap-2 border-b px-3.5 py-3">
            <span className={label}>Select a resource</span>
            <div className="flex flex-wrap gap-2">
              {others.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={other === r}
                  onClick={() => setOther(r)}
                  className={`flex items-center gap-2 rounded px-2.5 py-1.5 font-mono text-[13px] ${other === r ? "border-accent bg-accent-wash text-ink" : "border-line bg-well text-ink-2"}`}
                >
                  <ResourceIcon id={r} name={name(r)} />
                  {have.get(r) ?? 0}
                  <span className="text-ink-4">/{economy.caps.get(r)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2">
            {(["buy", "sell"] as const).map((mode) => {
              const rate = quote(rates, money, mode, other, 0, have)?.rate;
              return (
                <div
                  key={mode}
                  className="border-line flex min-w-0 flex-col gap-2.5 px-3.5 pt-3 pb-3.5 even:border-l"
                >
                  <div className="border-line flex items-baseline justify-between border-b pb-1.5">
                    <h3 className="font-display text-[15px] font-semibold">
                      {mode === "buy" ? "Buy" : "Sell"}
                    </h3>
                    {rate && (
                      <span className="text-ink-3 flex items-center gap-1 font-mono text-xs">
                        {mode === "buy" ? rate.getAmount : rate.giveAmount}
                        <ResourceIcon id={other} name={name(other)} size={13} />
                        for {mode === "buy" ? rate.giveAmount : rate.getAmount}
                        <ResourceIcon id={money} name={name(money)} size={13} />
                      </span>
                    )}
                  </div>
                  <p className="text-ink-3 text-center text-xs">
                    Click an amount to {mode}
                  </p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5">
                    {rate &&
                      presets(
                        mode === "buy" ? rate.getAmount : rate.giveAmount,
                        economy.caps.get(other),
                      ).map((amount) => {
                        const q = quote(
                          rates,
                          money,
                          mode,
                          other,
                          amount,
                          have,
                        );
                        if (!q) return null;
                        const over =
                          mode === "buy"
                            ? overCap(other, q.get)
                            : overCap(money, q.get);
                        const sign = mode === "buy" ? 1 : -1;
                        return (
                          <button
                            key={amount}
                            type="button"
                            disabled={!q.affordable || pending}
                            onClick={() =>
                              conn.exchange(q.rate.give, q.rate.get, q.give)
                            }
                            title={
                              over
                                ? "Over the cap: the extra is lost at the next Payday"
                                : undefined
                            }
                            aria-label={`${mode === "buy" ? "Buy" : "Sell"} ${amount} ${name(other)} for ${mode === "buy" ? q.give : q.get} ${name(money)}${over ? ", over the cap" : ""}`}
                            className="border-edge bg-tile hover:enabled:bg-raised flex flex-col overflow-hidden rounded p-0 font-mono text-[13px] disabled:opacity-40"
                          >
                            <span className="flex justify-center pt-2.5 pb-2">
                              <ResourceIcon
                                id={other}
                                name={name(other)}
                                size={22}
                              />
                            </span>
                            <span
                              className={`border-line border-t py-0.5 ${over ? "text-accent" : sign > 0 ? "text-ok" : "text-danger"}`}
                            >
                              {sign > 0 ? "+" : "−"}
                              {amount}
                            </span>
                            <span
                              className={`border-line bg-well flex items-center justify-center gap-1 border-t py-0.5 ${sign > 0 ? "text-danger" : "text-ok"}`}
                            >
                              <ResourceIcon
                                id={money}
                                name={name(money)}
                                size={12}
                              />
                              {sign > 0 ? `−${q.give}` : `+${q.get}`}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
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
