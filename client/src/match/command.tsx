import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTyping } from "../scene/galaxy";
import type { Side, Squad, SquadOrder } from "./store";
import { label } from "./windows";

// Commanding a side of a Battle (#92): the map picks and orders squads (see
// BattlefieldScene); these are the keys and the selection strip, shared by
// the match's Battle window and the Lab.

/** What the keys and strip need of the map. */
export type Commander = {
  pick: (squads: number[]) => void;
  armAttackMove: () => void;
  /** The Landing Zone under a screen point, by index, or null. */
  pointAt: (clientX: number, clientY: number) => number | null;
  setGroups: (groups: Map<number, number>) => void;
  centreOn: (squads: number[]) => void;
};

/** Your squads in a Battle that take orders: alive, and not buildings. */
export const orderable = (squads: Squad[], side: Side | null) =>
  squads
    .filter((q) => q.side === side && !q.building && !q.commandPost)
    .map((q) => q.id);

/** Control groups 1–9, each its squads' ids. */
export type Groups = {
  of: (group: number) => number[];
  set: (group: number) => void;
  select: (group: number) => void;
};

/** groups with group g set to these squads, each taken out of any other: a squad is in one group at most. */
export function assignGroup(
  groups: Map<number, number[]>,
  g: number,
  squads: number[],
) {
  const next = new Map<number, number[]>();
  for (const [k, ids] of groups)
    next.set(
      k,
      ids.filter((id) => !squads.includes(id)),
    );
  next.set(g, [...squads]);
  return next;
}

// A second tap of a group's number within this long moves the camera to it.
const DOUBLE_TAP_MS = 350;

/**
 * While on: A arms an Attack-move, H holds the picked squads and S stops
 * them (both drop their orders), Q picks your whole army, Ctrl+1–9 makes the
 * selection a control group, 1–9 picks one (twice moves the camera to it), and
 * Esc clears the selection, before anything else hears it (full screen, the
 * galaxy). Groups belong to one Battle, battle: squad ids start again in
 * each, so another Battle's groups would pick the wrong squads.
 */
export function useCommandKeys(
  battle: unknown,
  on: boolean,
  own: number[],
  picked: number[],
  map: RefObject<Commander | null>,
  order: (squads: number[], o: SquadOrder) => void,
): Groups {
  const [tagged, setTagged] = useState<{
    battle: unknown;
    groups: Map<number, number[]>;
  }>({ battle, groups: new Map() });
  const groups = useMemo(
    () =>
      tagged.battle === battle ? tagged.groups : new Map<number, number[]>(),
    [tagged, battle],
  );
  const setGroups = useCallback(
    (next: Map<number, number[]>) => setTagged({ battle, groups: next }),
    [battle],
  );
  const tap = useRef({ group: 0, at: 0 });
  const of = useCallback(
    (g: number) => (groups.get(g) ?? []).filter((id) => own.includes(id)),
    [groups, own],
  );
  const set = useCallback(
    (g: number) =>
      picked.length > 0 && setGroups(assignGroup(groups, g, picked)),
    [groups, picked, setGroups],
  );
  const select = useCallback(
    (g: number) => {
      const ids = of(g);
      if (ids.length === 0) return;
      const now = performance.now();
      if (tap.current.group === g && now - tap.current.at < DOUBLE_TAP_MS)
        map.current?.centreOn(ids);
      tap.current = { group: g, at: now };
      map.current?.pick(ids);
    },
    [of, map],
  );

  useEffect(() => {
    const groupOf = new Map<number, number>();
    for (const [g, ids] of groups) for (const id of ids) groupOf.set(id, g);
    map.current?.setGroups(groupOf);
  }, [groups, map]);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (digit && ctrl) set(Number(digit[1]));
      else if (ctrl) return;
      else if (digit) select(Number(digit[1]));
      else if (key === "a") map.current?.armAttackMove();
      else if (key === "q") map.current?.pick(own);
      else if ((key === "h" || key === "s") && picked.length > 0)
        order(picked, { kind: "hold" });
      else if (key === "escape" && picked.length > 0) {
        map.current?.pick([]);
        e.stopImmediatePropagation();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [on, own, picked, map, order, set, select]);

  return { of, set, select };
}

/** The picked squads, each with its count and strength, and their orders. */
export function SelectionStrip(props: {
  squads: Squad[];
  picked: number[];
  name: (unit: string) => string;
  groups: Groups;
  onArmy: () => void;
  onAttackMove: () => void;
  onHold: () => void;
}) {
  const picked = props.squads.filter((q) => props.picked.includes(q.id));
  const button =
    "border-edge bg-raised flex min-h-9 items-center gap-2 rounded-md px-3 text-[13px] disabled:opacity-50";
  const key =
    "border-edge text-ink-2 rounded-[3px] border px-1 font-mono text-[11px]";
  const byId = new Map(props.squads.map((q) => [q.id, q]));
  return (
    <>
      <GroupBar
        groups={props.groups}
        describe={(ids) =>
          [
            ...new Set(ids.map((id) => props.name(byId.get(id)?.unit ?? ""))),
          ].join(", ")
        }
        picked={props.picked}
      />
      <div className="border-line flex flex-none items-center gap-2.5 border-t px-4 py-2.5">
        <span className={`${label} w-20 flex-none`}>
          {picked.length > 0 ? `${picked.length} selected` : "None selected"}
        </span>
        {/* A fixed-height row that scrolls sideways: the window keeps its size. */}
        <ul className="flex h-12 min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {picked.length === 0 && (
            <li className="text-ink-3 text-[13px]">
              Click or drag to select · double-click for every one of a unit · Q
              for your army · right-click to Move or Attack · Shift queues
            </li>
          )}
          {picked.map((q) => {
            const strength = q.start > 0 ? q.count / q.start : 0;
            return (
              <li
                key={q.id}
                className="border-line bg-tile flex min-w-28 flex-col gap-1 rounded-md border px-2 py-1.5"
              >
                <span className="text-[13px]">
                  {props.name(q.unit)}{" "}
                  <span className="text-ink-3 font-mono">×{q.count}</span>
                  {q.queue.length > 0 && (
                    <span className="text-accent ml-1.5 font-mono text-[10px]">
                      +{q.queue.length} queued
                    </span>
                  )}
                </span>
                <span className="bg-line h-1 overflow-hidden rounded-sm">
                  <span
                    className={`block h-full ${strength > 0.66 ? "bg-ok" : "bg-accent"}`}
                    style={{ width: `${strength * 100}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={props.onArmy} className={button}>
          Army <span className={key}>Q</span>
        </button>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={props.onAttackMove}
          className={button}
        >
          Attack-move <span className={key}>A</span>
        </button>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={props.onHold}
          className={button}
        >
          Hold <span className={key}>H</span>
        </button>
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={props.onHold}
          className={button}
        >
          Stop <span className={key}>S</span>
        </button>
      </div>
    </>
  );
}

/**
 * Control groups 1–9, in fixed slots: each shows how many squads and of
 * what; a click picks it, a Ctrl-click sets it to the selection. An empty
 * slot stays in place, dimmed, until it's set.
 */
function GroupBar(props: {
  groups: Groups;
  describe: (ids: number[]) => string;
  picked: number[];
}) {
  return (
    <div className="border-line flex flex-none items-center gap-2.5 border-t px-4 py-2">
      <span className={`${label} w-20 flex-none`}>Groups</span>
      <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => {
          const ids = props.groups.of(g);
          const on =
            ids.length > 0 &&
            ids.length === props.picked.length &&
            ids.every((id) => props.picked.includes(id));
          return (
            <li key={g}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`Group ${g}: ${ids.length ? `${ids.length} squads` : "empty"}. Ctrl-click to set it to the selection`}
                title="Click: select · Ctrl-click: set to the selection"
                onClick={(e) =>
                  e.ctrlKey || e.metaKey
                    ? props.groups.set(g)
                    : props.groups.select(g)
                }
                className={`flex h-10 w-16 flex-col items-start justify-center rounded-md border px-1.5 text-left ${on ? "border-accent bg-accent-wash" : "border-line bg-tile"} ${ids.length ? "" : "opacity-55"}`}
              >
                <span
                  className={`font-mono text-[11px] ${on ? "text-accent" : "text-ink-2"}`}
                >
                  {g}
                </span>
                <span className="text-ink-3 w-full truncate text-[11px]">
                  {ids.length
                    ? `${ids.length} · ${props.describe(ids)}`
                    : "empty"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
