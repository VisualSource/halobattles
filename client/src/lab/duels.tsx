import { cn } from "cn";
import { useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { DuelCell, LabConnection } from "./connection";
import { Segmented } from "./segmented";

// The Lab's Duels tab (docs/specs/tactical-battle-spec.md#the-duel-matrix):
// the duel matrix as a table, row against column, and any one duel played in
// the Battle tab.

const title = "font-display text-sm font-semibold tracking-[0.08em] text-ink-2";
const tag = "font-mono text-[11px] tracking-[0.08em] text-ink-3";
const SEEDS = [40, 100, 200];
const CLASSES = ["infantry", "vehicle", "aircraft"];
const TIER_NAMES: Record<string, string> = {
  counter: "Counter",
  advantage: "Advantage",
  normal: "Normal",
  disadvantage: "Disadvantage",
  none: "Can't hit",
};
type Show = "all" | "checked" | "missed";
type Kind = "win" | "even" | "missed" | "plain";

/** Whether a cell met what its tiers want (battle.DuelCell.Missed). */
export function kindOf(c: DuelCell): Kind {
  if (c.want === "win") return c.rate >= 0.8 ? "win" : "missed";
  if (c.want === "even")
    return c.rate >= 0.4 && c.rate <= 0.6 ? "even" : "missed";
  return "plain";
}

const CELL: Record<Kind, string> = {
  win: "bg-ok-wash text-ok",
  even: "bg-even-wash text-even",
  missed: "bg-danger-wash text-danger font-medium",
  plain: "text-ink-4",
};

export function DuelsTab(props: {
  conn: LabConnection;
  content: ContentLookups;
  onPlay: (a: string, b: string) => void;
}) {
  const { conn, content } = props;
  const matrix = useStore(conn.store, (s) => s.matrix);
  const [seeds, setSeeds] = useState(100);
  const [show, setShow] = useState<Show>("all");
  const [faction, setFaction] = useState("");
  const [sel, setSel] = useState<[string, string] | null>(null);

  const unit = (id: string) => content.units.get(id);
  const cls = (id: string) => unit(id)?.combat?.unitClass ?? "";
  const ids = [
    ...(matrix?.units ??
      [...content.units].filter(([, u]) => u.peerGroup).map(([id]) => id)),
  ].sort((x: string, y: string) => {
    const ux = unit(x);
    const uy = unit(y);
    const ci = (id: string) =>
      (CLASSES.indexOf(cls(id)) + CLASSES.length + 1) % (CLASSES.length + 1);
    return (
      ci(x) - ci(y) ||
      (ux?.commandPoints ?? 0) - (uy?.commandPoints ?? 0) ||
      (ux?.peerGroup ?? "").localeCompare(uy?.peerGroup ?? "") ||
      (ux?.faction ?? "").localeCompare(uy?.faction ?? "") ||
      x.localeCompare(y)
    );
  });
  const rows = ids.filter((id) => !faction || unit(id)?.faction === faction);
  const factions = [...new Set(ids.map((id) => unit(id)?.faction ?? ""))];
  const name = (id: string) => unit(id)?.name ?? id;
  const facName = (f: string) => content.factions.get(f)?.name ?? f;
  const cell = (a: string, b: string) => matrix?.cells.get(`${a}|${b}`);
  const newClass = (list: string[], i: number) =>
    i > 0 && cls(list[i] ?? "") !== cls(list[i - 1] ?? "");

  const all = [...(matrix?.cells.values() ?? [])];
  const count = (k: Kind) => all.filter((c) => kindOf(c) === k).length;
  const running = !!matrix && !matrix.done;

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="border-line bg-panel flex w-72 flex-none flex-col gap-3.5 overflow-auto border-r p-3.5">
        <h2 className={title}>DUEL MATRIX</h2>
        <label className="flex flex-col gap-1.5">
          <span className={tag}>SEEDS</span>
          <select
            value={seeds}
            onChange={(e) => setSeeds(Number(e.target.value))}
            className="min-h-8 rounded-md px-2"
          >
            {SEEDS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={tag}>BUDGET</span>
          <span>12 Command Points a side; peers in equal numbers</span>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={() => conn.duels(seeds)}
          className="bg-accent text-accent-ink min-h-9 rounded-md border-0 font-semibold disabled:opacity-40"
        >
          {running ? "Running…" : "Run matrix"}
        </button>
        <div className="flex flex-col gap-1.5">
          <div className="bg-well h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-ok-edge h-full"
              style={{
                width: `${matrix ? (100 * matrix.cells.size) / Math.max(matrix.total, 1) : 0}%`,
              }}
            />
          </div>
          <p className="text-ink-4 m-0 text-xs">
            {!matrix
              ? "Not run yet"
              : running
                ? `${matrix.cells.size} of ${matrix.total} pairs · ${Math.round(matrix.seconds)} s`
                : `${matrix.seeds} seeds · finished in ${Math.round(matrix.seconds)} s`}
          </p>
        </div>
        <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
          <dt className="text-ink-3">Units</dt>
          <dd className="m-0 text-right font-mono">{ids.length}</dd>
          <dt className="text-ink-3">Pairs fought</dt>
          <dd className="m-0 text-right font-mono">{all.length}</dd>
          <dt className="text-ink-3">Counters holding</dt>
          <dd className="text-ok m-0 text-right font-mono">{count("win")}</dd>
          <dt className="text-ink-3">Peers even</dt>
          <dd className="text-ok m-0 text-right font-mono">{count("even")}</dd>
          <dt className="text-ink-3">Missing their target</dt>
          <dd
            className={cn(
              "m-0 text-right font-mono",
              count("missed") ? "text-danger" : "text-ok",
            )}
          >
            {count("missed")}
          </dd>
        </dl>
        <h2 className={title}>KEY</h2>
        <div className="text-ink-2 grid gap-1.5">
          {(
            [
              [
                "win",
                92,
                "Should win (counter or triangle), and does: 80% or more",
              ],
              ["even", 52, "Peers, should be even, and are: 40–60%"],
              ["missed", 66, "Misses its target"],
              ["plain", 35, "No target: shown for reference"],
            ] as const
          ).map(([k, n, text]) => (
            <div key={k} className="flex items-center gap-2">
              <span
                className={cn(
                  "border-line h-[18px] w-[26px] flex-none rounded-sm border text-center font-mono text-[10px] leading-4",
                  CELL[k],
                )}
              >
                {n}
              </span>
              {text}
            </div>
          ))}
        </div>
        <p className="text-ink-4 m-0 text-xs">
          Each cell is the row unit's win rate against the column unit, over
          every seed fought once on each side. Units are grouped by Unit Class.
        </p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-center gap-4">
          <fieldset className="m-0 flex items-center gap-1.5 border-0 p-0">
            <span className={tag}>SHOW</span>
            <Segmented
              value={show}
              options={[
                ["all", "All pairs"],
                ["checked", "Checked pairs"],
                ["missed", "Misses only"],
              ]}
              onChange={setShow}
            />
          </fieldset>
          <fieldset className="m-0 flex items-center gap-1.5 border-0 p-0">
            <span className={tag}>FACTION</span>
            <Segmented
              value={faction}
              options={[
                ["", "All"],
                ...factions.map((f): [string, string] => [f, facName(f)]),
              ]}
              onChange={setFaction}
            />
          </fieldset>
        </div>
        <div className="border-line bg-well min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="border-separate border-spacing-0 tabular-nums">
            <thead>
              <tr>
                <th className="border-line bg-panel sticky top-0 left-0 z-30 h-32 border-b px-2.5 py-2 text-left align-bottom">
                  <span className={tag}>ROW vs COLUMN</span>
                </th>
                {ids.map((b, j) => (
                  <th
                    key={b}
                    scope="col"
                    className={cn(
                      "border-line bg-panel sticky top-0 z-20 h-32 border-b p-0 align-bottom",
                      newClass(ids, j) && "border-l-edge border-l",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex w-10 rotate-180 items-center py-2 text-xs font-medium whitespace-nowrap [writing-mode:vertical-rl]",
                        sel?.[1] === b ? "text-accent" : "text-ink-2",
                      )}
                    >
                      {name(b)}
                      <small className="text-ink-4 ml-1.5 font-mono text-[10px]">
                        {unit(b)?.commandPoints} CP
                      </small>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a}>
                  <th
                    scope="row"
                    className={cn(
                      "border-line bg-panel sticky left-0 z-10 h-[30px] border-r px-2.5 text-left text-xs font-medium whitespace-nowrap",
                      newClass(rows, i) && "border-t-edge border-t",
                      sel?.[0] === a ? "text-accent" : "text-ink-2",
                    )}
                  >
                    {name(a)}
                    <small className="text-ink-4 ml-1.5 font-mono text-[10px]">
                      {facName(unit(a)?.faction ?? "")
                        .slice(0, 4)
                        .toUpperCase()}
                    </small>
                  </th>
                  {ids.map((b, j) => {
                    const c = cell(a, b);
                    const k = c ? kindOf(c) : "plain";
                    const hidden =
                      (show === "checked" && k === "plain") ||
                      (show === "missed" && k !== "missed");
                    const picked = sel?.[0] === a && sel?.[1] === b;
                    return (
                      <td
                        key={b}
                        className={cn(
                          "p-0",
                          newClass(rows, i) && "border-t-edge border-t",
                          newClass(ids, j) && "border-l-edge border-l",
                        )}
                      >
                        {a === b ? (
                          <span className="block h-[30px] w-10 bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--color-divider)_4px_6px)]" />
                        ) : (
                          <button
                            type="button"
                            aria-pressed={picked}
                            aria-label={`${name(a)} against ${name(b)}${c ? `: wins ${Math.round(c.rate * 100)}%` : ""}`}
                            onClick={() => setSel([a, b])}
                            className={cn(
                              "hover:outline-ink-3 block h-[30px] w-10 rounded-none border-0 p-0 font-mono text-[11px] hover:outline hover:-outline-offset-1",
                              c && CELL[k],
                              !c && "bg-transparent",
                              !c?.want &&
                                (sel?.[0] === a || sel?.[1] === b) &&
                                "bg-raised",
                              hidden && "text-transparent",
                              picked &&
                                "outline-accent outline-2 -outline-offset-2",
                            )}
                          >
                            {c ? Math.round(c.rate * 100) : ""}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <aside className="border-line bg-panel flex w-80 flex-none flex-col gap-3.5 overflow-auto border-l p-3.5">
        <h2 className={title}>DUEL</h2>
        {sel ? (
          <Picked
            content={content}
            a={sel[0]}
            b={sel[1]}
            cell={cell(sel[0], sel[1])}
            back={cell(sel[1], sel[0])}
            seeds={matrix?.seeds}
          />
        ) : (
          <p className="text-ink-3 m-0">
            Pick a cell to see that duel and play it.
          </p>
        )}
        <button
          type="button"
          disabled={!sel}
          onClick={() => sel && props.onPlay(sel[0], sel[1])}
          className="bg-accent text-accent-ink min-h-9 rounded-md border-0 font-semibold disabled:opacity-40"
        >
          Play this duel in the Battle tab
        </button>
        <p className="text-ink-4 m-0 text-xs">
          Opens the Battle tab with this duel, seed 0 (the first the matrix
          fights), paused at the start, so you can step it and watch the fire.
        </p>
      </aside>
    </div>
  );
}

function Picked(props: {
  content: ContentLookups;
  a: string;
  b: string;
  cell?: DuelCell;
  back?: DuelCell;
  seeds?: number;
}) {
  const { content, a, b, cell, back } = props;
  const unit = (id: string) => content.units.get(id);
  const name = (id: string) => unit(id)?.name ?? id;
  const tier = (x: string, y: string) => {
    const t = unit(x)?.combat?.tiers?.[unit(y)?.combat?.unitClass ?? ""];
    return TIER_NAMES[t ?? "normal"] ?? t;
  };
  const card = (x: string, y: string, n?: number) => {
    const u = unit(x);
    return (
      <div className="border-line bg-well flex min-h-24 flex-col gap-0.5 rounded-md border p-2">
        <b className="font-semibold">
          {n !== undefined && `${n} × `}
          {name(x)}
        </b>
        <span className="text-ink-3 text-xs">
          {content.factions.get(u?.faction ?? "")?.name} ·{" "}
          {u?.combat?.unitClass} · {u?.commandPoints} CP
        </span>
        <span className="text-ink-3 text-xs">
          {u?.peerGroup?.replace(/-/g, " ")}
        </span>
        <span className="text-ink-2 mt-1 font-mono text-[11px]">
          {tier(x, y)} vs {unit(y)?.combat?.unitClass}
        </span>
      </div>
    );
  };
  const k = cell ? kindOf(cell) : "plain";
  const verdict = !cell
    ? "Not fought yet: run the matrix"
    : {
        win: "Should win, and does",
        even: "Peers, and even",
        missed:
          cell.want === "even"
            ? "Peers, but not even"
            : "Should win, but doesn't",
        plain: "No target for this pair",
      }[k];
  const target =
    cell?.want === "win"
      ? " · target 80%+"
      : cell?.want === "even"
        ? " · target 40–60%"
        : "";
  const pct = (c?: DuelCell) => (c ? `${Math.round(c.rate * 100)}%` : "—");
  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        {card(a, b, cell?.na)}
        <span className="font-display text-ink-4 pt-5 text-xs font-semibold">
          VS
        </span>
        {card(b, a, cell?.nb)}
      </div>
      <div>
        <span className={tag}>{name(a).toUpperCase()} WINS</span>
        <div className="font-display text-4xl font-bold tabular-nums">
          {pct(cell)}
        </div>
        <div className="bg-raised flex h-2.5 overflow-hidden rounded-full">
          <i
            className="bg-accent"
            style={{ width: `${(cell?.rate ?? 0) * 100}%` }}
          />
        </div>
      </div>
      <span
        className={cn(
          "self-start rounded px-2 py-px font-mono text-xs",
          cell ? CELL[k] : "bg-raised text-ink-3",
          k === "plain" && "bg-raised text-ink-3",
        )}
      >
        {verdict}
        {target}
      </span>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-ink-3">
          {name(b)} vs {name(a)}
        </dt>
        <dd className="m-0 text-right font-mono">{pct(back)}</dd>
        <dt className="text-ink-3">Seeds</dt>
        <dd className="m-0 text-right font-mono">
          {props.seeds ? `${props.seeds} × 2 sides` : "—"}
        </dd>
        <dt className="text-ink-3">Battlefield</dt>
        <dd className="m-0 text-right font-mono">open, 64 × 48</dd>
      </dl>
    </>
  );
}
