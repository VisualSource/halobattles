import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import { BattlefieldScene, POINT_NAMES } from "../scene/battlefield";
import { seatColour } from "../scene/galaxy";
import type { MatchConnection } from "./connection";
import {
  BATTLE_TICKS,
  type Battle,
  type BattleReport,
  type Side,
  type Squad,
  type View,
  type Volley,
} from "./store";
import { formatAge, useMatchNow } from "./time";
import { Floating, label, Tag, Tile, windowTitle } from "./windows";

type TickEvent = { battle: number; tick: number; volleys: Volley[] };

const NEUTRAL = "#9ca3af";
const SIDES: Side[] = ["attacker", "defender"];

const sideName = (view: View | null, seat: number | null) =>
  seat === null
    ? "Neutral"
    : view?.players[seat]?.displayName || `Player ${seat + 1}`;

const seatOf = (b: { attacker: number; defender: number | null }, s: Side) =>
  s === "attacker" ? b.attacker : b.defender;

const colourOf = (seat: number | null) =>
  seat === null ? NEUTRAL : seatColour(seat);

/** "1:05" */
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Opens centred at the top of the map. */
const topCentre = (map: HTMLElement, self: HTMLElement) => ({
  x: Math.max(0, (map.clientWidth - self.offsetWidth) / 2),
  y: 16,
});

/**
 * The Battle you're watching, in a window: the Control Points, the clock,
 * and each side's squads as your side sees them, grouped by unit type, with
 * the latest fire. Enemies outside your Sight don't show.
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
  const now = useMatchNow(conn.local);
  const [fire, setFire] = useState<Volley[]>([]);
  const [full, setFull] = useState(false);

  useEffect(() => {
    setFire([]);
    const onTick = (e: Event) => {
      const t = (e as CustomEvent<TickEvent>).detail;
      if (t.battle === id) setFire((f) => [...f, ...t.volleys].slice(-3));
    };
    conn.events.addEventListener("battleTick", onTick);
    return () => conn.events.removeEventListener("battleTick", onTick);
  }, [conn, id]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

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

  const rules = content.rules.battle;
  const seconds = battle.tick / BATTLE_TICKS;
  const unitOf = new Map(
    [...(report?.squads.values() ?? []), ...battle.squads].map((q) => [
      q.id,
      q.unit,
    ]),
  );
  const name = (unit: string | undefined) =>
    content.units.get(unit ?? "")?.name ??
    content.buildings.get(unit ?? "")?.name ??
    unit ??
    "?";
  const last = fire.at(-1);

  const title = (
    <>
      <h2 className={windowTitle}>
        {sideName(view, battle.attacker)} attacks {planetName(battle.planet)}
      </h2>
      <Tag className="bg-accent-wash text-accent">Locked</Tag>
    </>
  );
  // Both sides are deployed, waiting for the fighting to start.
  const startsIn = Math.max(0, Math.ceil((battle.started - now) / 1000));
  const tools = (
    <>
      <span className="mr-1 font-mono">
        {startsIn > 0 ? (
          <>
            <span className={label}>Starts in </span>
            {clock(startsIn)}
          </>
        ) : (
          <>
            {clock(seconds)}
            <span className="text-ink-3"> / {clock(rules.timeCap)}</span>
          </>
        )}
      </span>
      <button
        type="button"
        aria-label={full ? "Leave full screen" : "Full screen"}
        title={full ? "Leave full screen (Esc)" : "Full screen"}
        onClick={() => setFull(!full)}
        className="size-7 border-0 bg-transparent p-0 text-ink-3"
      >
        {full ? "⤡" : "⤢"}
      </button>
    </>
  );
  const timeBar = (
    <div className="h-0.75 flex-none bg-well">
      <div
        className="h-full bg-accent transition-[width] duration-200"
        style={{ width: `${Math.min(1, seconds / rules.timeCap) * 100}%` }}
      />
    </div>
  );
  const points = (
    <Points
      battle={battle}
      holdSeconds={rules.holdSeconds}
      captureSeconds={rules.captureSeconds}
    />
  );
  const sides = (
    <div className={`grid gap-4 p-4 ${full ? "grid-cols-1" : "grid-cols-2"}`}>
      {SIDES.map((side) => {
        const seat = seatOf(battle, side);
        const faction = seat === null ? "" : view?.players[seat]?.faction;
        return (
          <section key={side} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ background: colourOf(seat) }}
              />
              <h3 className="font-semibold">
                {side === "attacker" ? "Attackers" : "Defenders"}
              </h3>
              <span className="truncate text-ink-3 text-sm">
                {sideName(view, seat)}
                {faction &&
                  ` · ${content.factions.get(faction)?.name ?? faction}`}
              </span>
            </div>
            <UnitGrid
              squads={battle.squads.filter((q) => q.side === side)}
              name={name}
              actor={last?.actor}
              target={last?.target}
            />
          </section>
        );
      })}
    </div>
  );
  const latest = (
    <div className="mx-4 flex h-32 flex-none flex-col gap-1.5 overflow-hidden rounded-md bg-well px-3.5 py-3 text-sm">
      <span className={label}>Latest fire</span>
      {fire.length === 0 ? (
        <span className="text-ink-3">Nobody in range yet…</span>
      ) : (
        fire
          .map((v, n) => ({ v, n }))
          .reverse()
          .map(({ v, n }) => (
            <span
              key={`${battle.tick}-${n}`}
              className={`truncate ${n === fire.length - 1 ? "" : "text-ink-3"}`}
            >
              {v.actor ? name(unitOf.get(v.actor)) : "Unseen fire"} on{" "}
              {name(unitOf.get(v.target))} ·{" "}
              <span className="font-mono">
                {v.hits}/{v.shots}
              </span>{" "}
              hit, <span className="font-mono">{damage(v)}</span>
              {v.kills > 0 && (
                <span className="text-danger"> · {v.kills} down</span>
              )}
            </span>
          ))
      )}
    </div>
  );
  const map = (
    <BattlefieldView
      conn={conn}
      content={content}
      battle={battle.id}
      className={full ? "min-h-0 flex-1" : "mx-4 h-95 rounded-md"}
      banner={startsIn > 0 ? `The fighting starts in ${startsIn} s` : undefined}
    />
  );

  if (full) {
    return (
      <section
        aria-label="Battle"
        className="fixed inset-0 z-50 flex flex-col bg-void"
      >
        <div className="flex h-10 flex-none items-center gap-2.5 border-line border-b bg-bar pr-2 pl-3">
          {title}
          <span className="flex-1" />
          {tools}
          <button
            type="button"
            aria-label="Close Battle"
            onClick={close}
            className="size-7 border-0 bg-transparent p-0 text-ink-3"
          >
            ✕
          </button>
        </div>
        {timeBar}
        <div className="flex min-h-0 flex-1">
          {map}
          <aside className="flex w-105 flex-none flex-col overflow-y-auto border-line border-l bg-panel pb-4">
            {points}
            {sides}
            {latest}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <Floating
      label="Battle"
      start={topCentre}
      remember="battle"
      onClose={close}
      className="w-200"
      title={title}
      tools={tools}
    >
      {timeBar}
      {points}
      <div className="h-3" />
      {map}
      {sides}
      {latest}
      <p className="px-4 py-3 text-ink-3 text-sm">
        {planetName(battle.planet)} is Locked: its queues are paused and its
        Stacks are frozen until the Battle ends.
      </p>
    </Floating>
  );
}

/**
 * The Battlefield, drawn by a BattlefieldScene that follows the Battle in
 * the Match store and plays each tick's fire, without re-rendering React.
 */
function BattlefieldView(props: {
  conn: MatchConnection;
  content: ContentLookups;
  battle: number;
  className: string;
  banner?: string; // shown over the map
}) {
  const { conn, content, battle: id } = props;
  const ref = useRef<HTMLDivElement>(null);
  const ready = useStore(conn.store, (s) => !!s.view?.battles.get(id)?.field);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ready re-runs it once the Battlefield arrives
  useEffect(() => {
    const view = conn.store.getState().view;
    const battle = view?.battles.get(id);
    if (!ref.current || !view || !battle?.field) return;
    const rules = content.rules.battle;
    const statsOf = (unit: string) =>
      content.units.get(unit)?.combat ?? content.buildings.get(unit)?.combat;
    const classOf = (unit: string) =>
      statsOf(unit)?.unitClass ?? rules.structure.unitClass;
    const flies = (sq: Squad) =>
      !!content.unitClasses.get(classOf(sq.unit))?.air;
    const scene = new BattlefieldScene(ref.current, battle.field, {
      terrainColour: (t) => content.terrains.get(t)?.colour ?? "#555555",
      sideColour: {
        attacker: colourOf(battle.attacker),
        defender: colourOf(battle.defender),
      },
      you: battle.attacker === view.you ? "attacker" : "defender",
      sight: (sq, height) =>
        (statsOf(sq.unit)?.sight ??
          rules.classDefaults[classOf(sq.unit)]?.sight ??
          0) + (flies(sq) ? 0 : rules.heightSight * height),
      flies,
      captureRadius: rules.captureRadius,
      captureTicks: rules.captureSeconds * BATTLE_TICKS,
    });
    scene.update(battle);
    const unsubscribe = conn.store.subscribe((s, prev) => {
      const next = s.view?.battles.get(id);
      if (next && next !== prev.view?.battles.get(id)) scene.update(next);
    });
    const onTick = (e: Event) => {
      const t = (e as CustomEvent<TickEvent>).detail;
      if (t.battle === id) scene.fire(t.volleys);
    };
    conn.events.addEventListener("battleTick", onTick);
    return () => {
      unsubscribe();
      conn.events.removeEventListener("battleTick", onTick);
      scene.dispose();
    };
  }, [conn, content, id, ready]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-void ${props.className}`}
    >
      {!ready && (
        <p className="flex h-full items-center justify-center text-ink-3 text-sm">
          Loading the Battlefield…
        </p>
      )}
      {props.banner && (
        <p className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 font-mono text-sm">
          {props.banner}
        </p>
      )}
    </div>
  );
}

/** Each Control Point's holder and capture progress, and the hold timer. */
function Points(props: {
  battle: Battle;
  holdSeconds: number;
  captureSeconds: number;
}) {
  const { battle } = props;
  const hold = battle.hold / BATTLE_TICKS;
  return (
    <div className="flex items-center gap-3 px-4 pt-3 text-sm">
      <span className={label}>Points</span>
      {battle.points.map((p, i) => (
        <span
          key={`${p.x},${p.y}`}
          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1"
          title={`Held by the ${p.owner}`}
        >
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ background: colourOf(seatOf(battle, p.owner)) }}
          />
          <span className="font-mono">{POINT_NAMES[i]}</span>
          <span className="w-8 font-mono text-ink-3 text-xs">
            {p.progress > 0
              ? `${Math.round((p.progress / BATTLE_TICKS / Math.max(props.captureSeconds, 0.2)) * 100)}%`
              : ""}
          </span>
        </span>
      ))}
      <span className="flex-1" />
      <span className="font-mono text-ink-3">
        Hold {clock(hold)} / {clock(props.holdSeconds)}
      </span>
    </div>
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
  const squads = [...r.squads.values()];
  const count = (side: Side, f: (q: Squad) => number) =>
    squads.filter((q) => q.side === side).reduce((n, q) => n + f(q), 0);
  const left = (side: Side) => count(side, (q) => q.count);
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
          <span className={label}>Lasted </span>
          {clock(r.ticks / BATTLE_TICKS)}
        </span>
      }
    >
      <div className="flex flex-col gap-1 px-4 pt-3.5">
        <p>{outcome}</p>
        <p className="text-ink-3 text-sm">
          Ended {formatAge(now - (r.endedAt ?? now))} ago · enemies you never
          saw aren't counted
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5 p-4">
        {SIDES.map((side) => {
          const seat = seatOf(r, side);
          const faction = seat === null ? "" : view?.players[seat]?.faction;
          const units = new Map<string, { started: number; left: number }>();
          for (const q of squads.filter((q) => q.side === side)) {
            const u = units.get(q.unit) ?? { started: 0, left: 0 };
            u.started += q.start;
            u.left += q.count;
            units.set(q.unit, u);
          }
          const started = count(side, (q) => q.start);
          return (
            <section key={side} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{ background: colourOf(seat) }}
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

/** "15 SH, 13 HP": the damage a volley did to each layer. */
function damage(v: Volley) {
  const layers: [number, string][] = [
    [v.shieldDmg, "SH"],
    [v.armorDmg, "AR"],
    [v.hpDmg, "HP"],
  ];
  const parts = layers
    .filter(([n]) => n > 0)
    .map(([n, l]) => `${Math.round(n)} ${l}`);
  return parts.join(", ") || "no damage";
}

/**
 * One side's squads in sight as rows, one per unit type: the living count
 * out of how many started. The row of the squad that fired last is outlined
 * in blue, the one it hit in red. The list scrolls inside a fixed height.
 */
function UnitGrid(props: {
  squads: Squad[];
  name: (unit: string) => string;
  actor?: number;
  target?: number;
}) {
  const units = new Map<string, Squad[]>();
  for (const q of props.squads)
    units.set(q.unit, [...(units.get(q.unit) ?? []), q]);
  if (units.size === 0) {
    return (
      <p className="flex h-40 items-center justify-center rounded-md border border-line border-dashed text-ink-3 text-sm">
        None in sight
      </p>
    );
  }
  return (
    <ul className="flex h-40 flex-col gap-2 overflow-y-auto">
      {[...units].map(([unit, qs]) => {
        const left = qs.reduce((n, q) => n + q.count, 0);
        const started = qs.reduce((n, q) => n + q.start, 0);
        const ids = new Set(qs.map((q) => q.id));
        const hit = ids.has(props.target ?? 0);
        const acting = ids.has(props.actor ?? 0);
        return (
          <li
            key={unit}
            className={`grid grid-cols-[44px_minmax(0,1fr)_120px] items-center gap-3 rounded-md border p-2.5 ${hit ? "border-danger bg-danger-wash" : acting ? "border-[#5fb4f0] bg-[#12212e]" : "border-line bg-item"}`}
          >
            <Tile name={props.name(unit)} size="size-11" />
            <div className="min-w-0">
              <div className="truncate">
                {props.name(unit)}{" "}
                {acting && (
                  <span className={`${label} text-[#5fb4f0]`}>firing</span>
                )}
                {hit && <span className={`${label} text-danger`}>hit</span>}
              </div>
              <div className="font-mono text-ink-3 text-xs">
                {left} of {started} left
              </div>
            </div>
            <Bar label="Left" colour="bg-ok" value={left} max={started} />
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
  if (props.max <= 0) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <meter>'s bar can't be coloured per layer across browsers
    <div
      role="meter"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      title={`${props.label} ${Math.round(props.value)} / ${Math.round(props.max)}`}
      className="h-1.5 overflow-hidden rounded-sm bg-well"
    >
      <div
        className={`h-full ${props.colour}`}
        style={{ width: `${(props.value / props.max) * 100}%` }}
      />
    </div>
  );
}
