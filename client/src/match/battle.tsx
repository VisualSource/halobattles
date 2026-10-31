import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import { BattlefieldScene, POINT_NAMES } from "../scene/battlefield";
import { seatColour } from "../scene/galaxy";
import { amounts } from "./buildings";
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
  const retreatSent = useStore(conn.local, (s) =>
    [...s.pending.values()].includes("retreat"),
  );
  const buildSent = useStore(conn.local, (s) =>
    [...s.pending.values()].includes("padTurret"),
  );
  // Tagged with its Battle, so watching another starts with no fire.
  const [shots, setShots] = useState<{ id: typeof id; fire: Volley[] }>({
    id,
    fire: [],
  });
  const fire = shots.id === id ? shots.fire : [];
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onTick = (e: Event) => {
      const t = (e as CustomEvent<TickEvent>).detail;
      if (t.battle === id)
        setShots((s) => ({
          id,
          fire: [...(s.id === id ? s.fire : []), ...t.volleys].slice(-3),
        }));
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
        className="text-ink-3 size-7 border-0 bg-transparent p-0"
      >
        {full ? "⤡" : "⤢"}
      </button>
    </>
  );
  const timeBar = (
    <div className="bg-well h-0.75 flex-none">
      <div
        className="bg-accent h-full transition-[width] duration-200"
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
  const mySide: Side = battle.attacker === view?.you ? "attacker" : "defender";
  const faction = view ? view.players[view.you]?.faction : undefined;
  // Your Faction's pad turret, if it has one: the cheapest.
  const turret = [...content.buildings.entries()]
    .filter(([, b]) => b.padTurret && b.combat && b.faction === faction)
    .sort(
      ([, a], [, b]) =>
        Object.values(a.cost).reduce((n, c) => n + c, 0) -
        Object.values(b.cost).reduce((n, c) => n + c, 0),
    )[0];
  const affords =
    !!turret &&
    Object.entries(turret[1].cost).every(
      ([r, n]) => (view?.economy.resources.get(r) ?? 0) >= n,
    );
  const pads = battle.pads.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-2 text-sm">
      <span className={label}>Pads</span>
      {battle.pads.map((p, i) => {
        const yours = p.owner === mySide;
        const state = p.turret
          ? "Turret up"
          : p.building
            ? `Building · ${Math.max(0, Math.ceil((p.readyAt - battle.tick) / BATTLE_TICKS))} s`
            : p.owner
              ? "Empty"
              : "Nobody's";
        return (
          <span
            key={`${p.x},${p.y}`}
            className="border-line flex items-center gap-1.5 rounded-md border py-0.5 pr-0.5 pl-2"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{
                background: p.owner
                  ? colourOf(seatOf(battle, p.owner))
                  : NEUTRAL,
              }}
            />
            <span className="font-mono">{i + 1}</span>
            <span className="text-ink-3 w-20 text-xs">{state}</span>
            <button
              type="button"
              disabled={
                !yours ||
                !!p.turret ||
                !!p.building ||
                !turret ||
                !affords ||
                buildSent
              }
              title={
                turret
                  ? `Build a ${turret[1].name} for ${amounts(content, turret[1].cost)}`
                  : "Your Faction has no pad turret"
              }
              onClick={() =>
                turret && conn.buildTurret(battle.planet, i, turret[0])
              }
              className="border-edge bg-raised min-h-7 w-14 rounded px-2 text-xs disabled:opacity-40"
            >
              Build
            </button>
          </span>
        );
      })}
      {turret && (
        <span className="text-ink-3 text-xs">
          {turret[1].name}: {amounts(content, turret[1].cost)}
        </span>
      )}
    </div>
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
              {battle.retreating[side] && (
                <Tag className="bg-danger-wash text-danger">Retreating</Tag>
              )}
              <span className="text-ink-3 truncate text-sm">
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
    <div className="bg-well mx-4 flex h-32 flex-none flex-col gap-1.5 overflow-hidden rounded-md px-3.5 py-3 text-sm">
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
  const running = battle.retreating[mySide];
  const counting = battle.retreatAt > 0 && !running;
  const countdown = Math.max(
    1,
    Math.ceil((battle.retreatAt - battle.tick) / BATTLE_TICKS),
  );
  const nowhere =
    mySide === "defender" &&
    ![...(view?.planets.values() ?? [])].some(
      (p) => p.owner === view?.you && p.id !== battle.planet,
    );
  const retreat = (
    <div className="border-line flex flex-none items-center gap-3 border-t px-4 py-3">
      <button
        type="button"
        disabled={retreatSent || running || (nowhere && !counting)}
        onClick={() => conn.retreat(battle.planet, counting)}
        className="border-edge bg-raised min-h-11 w-52 flex-none rounded-md px-4 text-sm disabled:opacity-50"
      >
        {running
          ? "Retreating…"
          : counting
            ? `Call off Retreat · ${countdown} s`
            : "Retreat"}
      </button>
      <p className="text-ink-3 text-sm">
        {running
          ? "Your squads are heading off the field, holding fire. Whatever gets away Retreats to your nearest Planet."
          : counting
            ? "Your side fights on until the countdown ends, then turns and runs."
            : nowhere
              ? "You have no other Planet to Retreat to."
              : `${planetName(battle.planet)} is Locked: its queues are paused and its Stacks are frozen until the Battle ends.`}
      </p>
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
        className="bg-void fixed inset-0 z-50 flex flex-col"
      >
        <div className="border-line bg-bar flex h-10 flex-none items-center gap-2.5 border-b pr-2 pl-3">
          {title}
          <span className="flex-1" />
          {tools}
          <button
            type="button"
            aria-label="Close Battle"
            onClick={close}
            className="text-ink-3 size-7 border-0 bg-transparent p-0"
          >
            ✕
          </button>
        </div>
        {timeBar}
        <div className="flex min-h-0 flex-1">
          {map}
          <aside className="border-line bg-panel flex w-105 flex-none flex-col overflow-y-auto border-l">
            {points}
            {pads}
            {sides}
            {latest}
            <span className="flex-1" />
            {retreat}
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
      {pads}
      <div className="h-3" />
      {map}
      {sides}
      {latest}
      <div className="h-3" />
      {retreat}
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
      className={`bg-void relative overflow-hidden ${props.className}`}
    >
      {!ready && (
        <p className="text-ink-3 flex h-full items-center justify-center text-sm">
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
    <div className="flex flex-wrap items-center gap-3 px-4 pt-3 text-sm">
      <span className={label}>Points</span>
      {battle.points.map((p, i) => (
        <span
          key={`${p.x},${p.y}`}
          className="border-line flex items-center gap-1.5 rounded-md border px-2 py-1"
          title={`Held by the ${p.owner}`}
        >
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ background: colourOf(seatOf(battle, p.owner)) }}
          />
          <span className="font-mono">{POINT_NAMES[i]}</span>
          <span className="text-ink-3 w-8 font-mono text-xs">
            {p.progress > 0
              ? `${Math.round((p.progress / BATTLE_TICKS / Math.max(props.captureSeconds, 0.2)) * 100)}%`
              : ""}
          </span>
        </span>
      ))}
      <span className="flex-1" />
      <span
        className={`font-mono whitespace-nowrap ${battle.holdPaused ? "text-accent" : "text-ink-3"}`}
        title={
          battle.holdPaused
            ? "A defender stands on a held point: the hold waits"
            : undefined
        }
      >
        Hold {clock(hold)} / {clock(props.holdSeconds)}
        {battle.holdPaused ? " · paused" : ""}
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
                    className="border-line bg-item grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-2.5"
                  >
                    <Tile
                      name={name(unit)}
                      size="size-11"
                      dashed={seat === null}
                    />
                    <div className="min-w-0">
                      <div className="truncate">{name(unit)}</div>
                      <div className="text-ink-3 font-mono text-xs">
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
              <dl className="bg-well mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md px-3 py-2.5 text-sm">
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
      <div className="border-line flex items-center gap-2 border-t px-4 py-3">
        <button
          type="button"
          onClick={() => conn.local.setState({ selected: r.planet })}
          className="border-edge bg-raised min-h-11 rounded-md px-4 text-sm"
        >
          Show {planetName}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={props.onClose}
          className="border-edge text-ink-2 min-h-11 rounded-md bg-transparent px-4 text-sm"
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
      <p className="border-line text-ink-3 flex h-40 items-center justify-center rounded-md border border-dashed text-sm">
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
              <div className="text-ink-3 font-mono text-xs">
                {left} of {started} left
              </div>
            </div>
            <Bar label="Left" color="bg-ok" value={left} max={started} />
          </li>
        );
      })}
    </ul>
  );
}

function Bar(props: {
  label: string;
  color: string;
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
      className="bg-well h-1.5 overflow-hidden rounded-sm"
    >
      <div
        className={`h-full ${props.color}`}
        style={{ width: `${(props.value / props.max) * 100}%` }}
      />
    </div>
  );
}
