import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import { seatColour } from "../scene/galaxy";
import type { MatchConnection } from "./connection";
import {
  applyActions,
  type BattleAction,
  type BattleReport,
  type Combatant,
  type View,
} from "./store";
import { formatAge, useMatchNow } from "./time";
import { Floating, label, Tag, Tile, windowTitle } from "./windows";

type RoundEvent = { battle: number; round: number; actions: BattleAction[] };

/** Where a Round's playback has got to: the first `shown` actions. */
type Playback = { round: number; actions: BattleAction[]; shown: number };

const NEUTRAL = "#9ca3af";

const sideName = (view: View | null, seat: number | null) =>
  seat === null
    ? "Neutral"
    : view?.players[seat]?.displayName || `Player ${seat + 1}`;

/** Opens centred at the top of the map. */
const topCentre = (map: HTMLElement, self: HTMLElement) => ({
  x: Math.max(0, (map.clientWidth - self.offsetWidth) / 2),
  y: 16,
});

/**
 * The Battle you're watching, in a window: both sides' units grouped by
 * type, with Shield, Armor and HP bars. Each Round's actions play out in
 * order across the Round duration, on top of the View's roster as of the
 * last completed Round. Units are grouped by type, never shown one by one.
 */
export function BattlePanel(props: {
  conn: MatchConnection;
  content: ContentLookups;
}) {
  const { conn, content } = props;
  const id = useStore(conn.local, (s) => s.watching);
  const battle = useStore(conn.store, (s) =>
    id === null ? undefined : s.view?.battles.get(id),
  );
  const report = useStore(conn.local, (s) =>
    id === null ? undefined : s.reports.get(id),
  );
  const view = useStore(conn.store, (s) => s.view);
  const [play, setPlay] = useState<Playback | null>(null);
  const roundMs = battle?.roundMs ?? 3000;

  useEffect(() => {
    setPlay(null);
    let timers: ReturnType<typeof setTimeout>[] = [];
    const onRound = (e: Event) => {
      const r = (e as CustomEvent<RoundEvent>).detail;
      if (r.battle !== id) return;
      for (const t of timers) clearTimeout(t);
      setPlay({ round: r.round, actions: r.actions, shown: 0 });
      const step = roundMs / Math.max(1, r.actions.length);
      timers = r.actions.map((_, i) =>
        setTimeout(
          () =>
            setPlay((p) => (p?.round === r.round ? { ...p, shown: i + 1 } : p)),
          i * step,
        ),
      );
    };
    conn.events.addEventListener("battleRound", onRound);
    return () => {
      for (const t of timers) clearTimeout(t);
      conn.events.removeEventListener("battleRound", onRound);
    };
  }, [conn, id, roundMs]);

  if (id === null) return null;
  const close = () => conn.local.setState({ watching: null });
  const planetName = (p: string) =>
    content.maps.get(view?.map ?? "")?.planets.find((mp) => mp.id === p)
      ?.name ?? p;

  if (!battle) {
    if (report?.winner !== undefined) {
      return (
        <Report
          conn={conn}
          content={content}
          report={report}
          view={view}
          planetName={planetName(report.planet)}
          onClose={close}
        />
      );
    }
    // Ended, but this client never saw it play: nothing to report.
    return (
      <Floating
        label="Battle"
        start={topCentre}
        remember="battle"
        onClose={close}
        className="w-100"
        title={<h2 className={windowTitle}>Battle over</h2>}
      >
        <p className="p-4">It has ended.</p>
      </Floating>
    );
  }

  // The View's roster is after the completed Rounds; the Round now playing
  // is the next one.
  const current = play?.round === battle.round + 1 ? play : null;
  const shown = current?.actions.slice(0, current.shown) ?? [];
  const roster = applyActions(battle.roster, shown);
  const last = shown.at(-1);
  const unitOf = new Map(battle.roster.map((c) => [c.id, c.unit]));
  const name = (unit: string | undefined) =>
    content.units.get(unit ?? "")?.name ??
    content.buildings.get(unit ?? "")?.name ??
    unit ??
    "?";
  const done = current
    ? current.shown / Math.max(1, current.actions.length)
    : 0;

  return (
    <Floating
      label="Battle"
      start={topCentre}
      remember="battle"
      onClose={close}
      className="w-200"
      title={
        <>
          <h2 className={windowTitle}>
            {sideName(view, battle.attacker)} attacks{" "}
            {planetName(battle.planet)}
          </h2>
          <Tag className="bg-accent-wash text-accent">Locked</Tag>
        </>
      }
      tools={
        <span className="mr-2 font-mono">
          <span className={label}>Round </span>
          {current ? current.round : battle.round}
          <span className="text-ink-3"> / {content.rules.roundCap}</span>
        </span>
      }
    >
      <div className="h-0.75 bg-well">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${done * 100}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-5 p-4">
        {(["attacker", "defender"] as const).map((side) => {
          const seat = side === "attacker" ? battle.attacker : battle.defender;
          const faction = seat === null ? "" : view?.players[seat]?.faction;
          return (
            <section key={side} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{
                    background: seat === null ? NEUTRAL : seatColour(seat),
                  }}
                />
                <h3 className="font-semibold">
                  {side === "attacker" ? "Attackers" : "Defenders"}
                </h3>
                <span className="text-ink-3 text-sm">
                  {sideName(view, seat)}
                  {faction &&
                    ` · ${content.factions.get(faction)?.name ?? faction}`}
                </span>
              </div>
              <UnitGrid
                roster={roster.filter((c) => c.side === side)}
                content={content}
                name={name}
                actor={last?.actor}
                target={last?.target}
              />
            </section>
          );
        })}
      </div>
      <div className="mx-4 flex flex-col gap-1.5 rounded-md bg-well px-3.5 py-3 text-sm">
        <span className={label}>This Round</span>
        {shown.length === 0 ? (
          <span className="text-ink-3">Waiting for the next Round…</span>
        ) : (
          // The newest three, newest first; n is its place in the Round.
          shown
            .map((a, n) => ({ a, n }))
            .slice(-3)
            .reverse()
            .map(({ a, n }) => (
              <span
                key={n}
                className={n === shown.length - 1 ? "" : "text-ink-3"}
              >
                {a.hit ? (
                  <>
                    {name(unitOf.get(a.actor))} hits{" "}
                    {name(unitOf.get(a.target))} · rolled{" "}
                    <span className="font-mono">{a.roll}</span>,{" "}
                    <span className="font-mono">{damage(a)}</span>
                  </>
                ) : (
                  <>
                    {name(unitOf.get(a.actor))} misses{" "}
                    {name(unitOf.get(a.target))}
                  </>
                )}
                {a.killed && (
                  <span className="text-danger">
                    {" "}
                    · {name(unitOf.get(a.target))} down
                  </span>
                )}
              </span>
            ))
        )}
      </div>
      <p className="px-4 py-3 text-ink-3 text-sm">
        {planetName(battle.planet)} is Locked: its queues are paused and its
        Stacks are frozen until the Battle ends.
      </p>
    </Floating>
  );
}

/**
 * A finished Battle: who won and what it cost each side, per unit type, in
 * the same window and layout as the live view.
 */
function Report(props: {
  conn: MatchConnection;
  content: ContentLookups;
  report: BattleReport;
  view: View | null;
  planetName: string;
  onClose: () => void;
}) {
  const { conn, content, report: r, view, planetName } = props;
  const now = useMatchNow(conn.local);
  const you = view?.you;
  const won = r.winner === you;
  const left = (side: Combatant["side"]) =>
    r.roster.filter((c) => c.side === side && c.hp > 0).length;
  const enemy = (seat: number | null) =>
    seat === null ? "the neutral garrison" : sideName(view, seat);
  const outcome =
    r.attacker === you
      ? won
        ? `You took ${planetName} from ${enemy(r.defender)}. Your survivors moved in.`
        : `Your attack on ${planetName} failed. ${
            left("attacker") > 0
              ? `${left("attacker")} survivors are Retreating.`
              : "None survived."
          }`
      : won
        ? `You held ${planetName} against ${enemy(r.attacker)}.`
        : `${enemy(r.attacker)} took ${planetName} from you.`;
  const name = (unit: string) =>
    content.units.get(unit)?.name ?? content.buildings.get(unit)?.name ?? unit;

  return (
    <Floating
      label="Battle report"
      start={topCentre}
      remember="battle"
      onClose={props.onClose}
      className="w-200"
      title={
        <>
          <h2 className={windowTitle}>Battle of {planetName}</h2>
          <Tag
            className={
              won ? "bg-ok-wash text-ok" : "bg-danger-wash text-danger"
            }
          >
            {won ? "Victory" : "Defeat"}
          </Tag>
        </>
      }
      tools={
        <span className="mr-2 font-mono">
          <span className={label}>Rounds </span>
          {r.rounds}
          <span className="text-ink-3"> / {content.rules.roundCap}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-1 px-4 pt-3.5">
        <p>{outcome}</p>
        <p className="text-ink-3 text-sm">
          Ended {formatAge(now - (r.endedAt ?? now))} ago · lasted{" "}
          {Math.round((r.rounds * r.roundMs) / 1000)} s
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5 p-4">
        {(["attacker", "defender"] as const).map((side) => {
          const seat = side === "attacker" ? r.attacker : r.defender;
          const faction = seat === null ? "" : view?.players[seat]?.faction;
          const units = new Map<string, { started: number; left: number }>();
          for (const c of r.roster.filter((c) => c.side === side)) {
            const u = units.get(c.unit) ?? { started: 0, left: 0 };
            u.started++;
            if (c.hp > 0) u.left++;
            units.set(c.unit, u);
          }
          const started = r.roster.filter((c) => c.side === side).length;
          return (
            <section key={side} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{
                    background: seat === null ? NEUTRAL : seatColour(seat),
                  }}
                />
                <h3 className="font-semibold">
                  {side === "attacker" ? "Attackers" : "Defenders"}
                </h3>
                <span className="text-ink-3 text-sm">
                  {seat === you ? "You" : sideName(view, seat)}
                  {faction &&
                    ` · ${content.factions.get(faction)?.name ?? faction}`}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {[...units].map(([unit, u]) => (
                  <li
                    key={unit}
                    className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-item p-2.5"
                  >
                    <Tile
                      name={name(unit)}
                      size="size-11"
                      dashed={seat === null}
                    />
                    <div className="min-w-0">
                      <div className="truncate">{name(unit)}</div>
                      <div className="font-mono text-ink-3 text-xs">
                        {u.started} → {u.left} left
                      </div>
                    </div>
                    <span
                      className={`font-mono text-sm ${u.left < u.started ? "text-danger" : "text-ink-3"}`}
                    >
                      {u.left < u.started ? `−${u.started - u.left}` : "—"}
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md bg-well px-3 py-2.5 text-sm">
                <dt className="text-ink-3">Lost</dt>
                <dd className="font-mono">
                  {started - left(side)} of {started}
                </dd>
                <dt className="text-ink-3">Damage dealt</dt>
                <dd className="font-mono">
                  {Math.round(r.damage[side]).toLocaleString()}
                </dd>
              </dl>
            </section>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-line border-t px-4 py-3">
        <button
          type="button"
          onClick={() => conn.local.setState({ selected: r.planet })}
          className="min-h-11 rounded-md border-edge bg-raised px-4 text-sm"
        >
          Show {planetName}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={props.onClose}
          className="min-h-11 rounded-md border-edge bg-transparent px-4 text-ink-2 text-sm"
        >
          Close
        </button>
      </div>
    </Floating>
  );
}

/** "15 SH, 13 HP": the damage one hit did to each layer. */
function damage(a: BattleAction) {
  const layers: [number, string][] = [
    [a.shieldDmg, "SH"],
    [a.armorDmg, "AR"],
    [a.hpDmg, "HP"],
  ];
  const parts = layers
    .filter(([n]) => n > 0)
    .map(([n, l]) => `${Math.round(n)} ${l}`);
  return parts.join(", ") || "no damage";
}

/**
 * One side's units as rows, one per unit type: the living count out of how
 * many started, and the summed Shield, Armor and HP left. The row of the
 * unit acting is outlined in blue, the one being hit in red.
 */
function UnitGrid(props: {
  roster: Combatant[];
  content: ContentLookups;
  name: (unit: string) => string;
  actor?: string;
  target?: string;
}) {
  const { roster, content } = props;
  const slots = new Map<string, Combatant[]>();
  for (const c of roster) slots.set(c.unit, [...(slots.get(c.unit) ?? []), c]);
  return (
    <ul className="flex flex-col gap-2">
      {[...slots].map(([unit, cs]) => {
        const def = content.units.get(unit) ?? content.buildings.get(unit);
        const stats = def?.combat;
        const alive = cs.filter((c) => c.hp > 0).length;
        const sum = (f: (c: Combatant) => number) =>
          cs.reduce((n, c) => n + f(c), 0);
        const ids = new Set(cs.map((c) => c.id));
        const hit = ids.has(props.target ?? "");
        const acting = ids.has(props.actor ?? "");
        return (
          <li
            key={unit}
            className={`grid grid-cols-[44px_minmax(0,1fr)_160px] items-center gap-3 rounded-md border p-2.5 ${hit ? "border-danger bg-danger-wash" : acting ? "border-[#5fb4f0] bg-[#12212e]" : "border-line bg-item"}`}
          >
            <Tile name={props.name(unit)} size="size-11" />
            <div className="min-w-0">
              <div className="truncate">
                {props.name(unit)}{" "}
                {acting && (
                  <span className={`${label} text-[#5fb4f0]`}>acting</span>
                )}
                {hit && <span className={`${label} text-danger`}>hit</span>}
              </div>
              <div className="font-mono text-ink-3 text-xs">
                {alive} of {cs.length} left
              </div>
            </div>
            <div className="flex flex-col gap-1.25">
              <Bar
                label="SH"
                colour="bg-[#5fb4f0]"
                value={sum((c) => c.shield)}
                max={cs.length * (stats?.shield ?? 0)}
              />
              <Bar
                label="AR"
                colour="bg-idle"
                value={sum((c) => c.armor)}
                max={cs.length * (stats?.armor ?? 0)}
              />
              <Bar
                label="HP"
                colour="bg-ok"
                value={sum((c) => c.hp)}
                max={cs.length * (stats?.hp ?? 0)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Bar(props: {
  label: string;
  colour: string;
  value: number;
  max: number;
}) {
  if (props.max <= 0) return null; // e.g. no Shield at all
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <meter>'s bar can't be coloured per layer across browsers
    <div
      role="meter"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      title={`${props.label} ${Math.round(props.value)} / ${Math.round(props.max)}`}
      className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-1.5 font-mono text-[10px] text-ink-3"
    >
      {props.label}
      <div className="h-1.5 overflow-hidden rounded-sm bg-well">
        <div
          className={`h-full ${props.colour}`}
          style={{ width: `${(props.value / props.max) * 100}%` }}
        />
      </div>
    </div>
  );
}
