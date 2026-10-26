import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";
import type { BattleAction, Combatant } from "./store";

type RoundEvent = { battle: number; round: number; actions: BattleAction[] };
type EndEvent = { battle: number; winner: number | null };

/** Where a Round's playback has got to: the first `shown` actions. */
type Playback = { round: number; actions: BattleAction[]; shown: number };

/**
 * The Battle you're watching, as both sides' Unit Slot grids with Shield,
 * Armor and HP bars. Each Round's actions play out in order across the Round
 * duration, on top of the View's roster as of the last completed Round.
 * Units are grouped by type, never shown one by one.
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
  const players = useStore(conn.store, (s) => s.view?.players);
  const [play, setPlay] = useState<Playback | null>(null);
  const [winner, setWinner] = useState<{ seat: number | null } | null>(null);
  const roundMs = battle?.roundMs ?? 3000;

  useEffect(() => {
    setPlay(null);
    setWinner(null);
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
    const onEnded = (e: Event) => {
      const d = (e as CustomEvent<EndEvent>).detail;
      if (d.battle === id) setWinner({ seat: d.winner });
    };
    conn.events.addEventListener("battleRound", onRound);
    conn.events.addEventListener("battleEnded", onEnded);
    return () => {
      for (const t of timers) clearTimeout(t);
      conn.events.removeEventListener("battleRound", onRound);
      conn.events.removeEventListener("battleEnded", onEnded);
    };
  }, [conn, id, roundMs]);

  if (id === null) return null;
  const close = () => conn.local.setState({ watching: null });
  const name = (seat: number | null) =>
    seat === null
      ? "Neutral"
      : players?.[seat]?.displayName || `Player ${seat + 1}`;

  if (!battle) {
    return (
      <aside style={panelStyle}>
        <h3>Battle over</h3>
        {winner && <p>{name(winner.seat)} won.</p>}
        <button type="button" onClick={close}>
          Close
        </button>
      </aside>
    );
  }

  // The View's roster is after the completed Rounds; the Round now playing
  // is the next one.
  const current = play?.round === battle.round + 1 ? play : null;
  const shown = current?.actions.slice(0, current.shown) ?? [];
  const roster = applyActions(battle.roster, shown);
  const last = shown.at(-1);

  return (
    <aside style={panelStyle}>
      <h3>
        Battle: {name(battle.attacker)} attacks {name(battle.defender)}
      </h3>
      <p>Round {current ? current.round : battle.round}</p>
      {(["attacker", "defender"] as const).map((side) => (
        <section key={side}>
          <h4>{side === "attacker" ? "Attackers" : "Defenders"}</h4>
          <UnitGrid
            roster={roster.filter((c) => c.side === side)}
            content={content}
            actor={last?.actor}
            target={last?.target}
          />
        </section>
      ))}
      <button type="button" onClick={close}>
        Close
      </button>
    </aside>
  );
}

const panelStyle = {
  width: 320,
  padding: "0 12px",
  overflowY: "auto",
} as const;

function applyActions(roster: Combatant[], actions: BattleAction[]) {
  const out = new Map(roster.map((c) => [c.id, { ...c }]));
  for (const a of actions) {
    const t = out.get(a.target);
    if (!t) continue;
    t.shield = Math.max(0, t.shield - a.shieldDmg);
    t.armor = Math.max(0, t.armor - a.armorDmg);
    t.hp = Math.max(0, t.hp - a.hpDmg);
  }
  return [...out.values()];
}

/**
 * One side's units as Unit Slots: one row per unit type with the living
 * count and the summed Shield, Armor and HP left out of the starting total.
 * The row of the unit acting or being hit is highlighted.
 */
function UnitGrid(props: {
  roster: Combatant[];
  content: ContentLookups;
  actor?: string;
  target?: string;
}) {
  const { roster, content } = props;
  const slots = new Map<string, Combatant[]>();
  for (const c of roster) slots.set(c.unit, [...(slots.get(c.unit) ?? []), c]);
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {[...slots].map(([unit, cs]) => {
        const def = content.units.get(unit) ?? content.buildings.get(unit);
        const stats = def?.combat;
        const alive = cs.filter((c) => c.hp > 0).length;
        const sum = (f: (c: Combatant) => number) =>
          cs.reduce((n, c) => n + f(c), 0);
        const ids = new Set(cs.map((c) => c.id));
        const background = ids.has(props.target ?? "")
          ? "#7f1d1d"
          : ids.has(props.actor ?? "")
            ? "#1e3a8a"
            : undefined;
        return (
          <li key={unit} style={{ background, padding: 2 }}>
            {def?.name ?? unit} × {alive}
            <Bar
              label="Shield"
              value={sum((c) => c.shield)}
              max={cs.length * (stats?.shield ?? 0)}
            />
            <Bar
              label="Armor"
              value={sum((c) => c.armor)}
              max={cs.length * (stats?.armor ?? 0)}
            />
            <Bar
              label="HP"
              value={sum((c) => c.hp)}
              max={cs.length * (stats?.hp ?? 0)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function Bar(props: { label: string; value: number; max: number }) {
  if (props.max <= 0) return null; // e.g. no Shield at all
  return (
    <meter
      aria-label={props.label}
      title={`${props.label} ${Math.round(props.value)} / ${Math.round(props.max)}`}
      min={0}
      max={props.max}
      value={props.value}
      style={{ display: "block", width: "100%", height: 6 }}
    />
  );
}
