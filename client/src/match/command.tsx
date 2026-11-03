import { type RefObject, useEffect } from "react";
import { isTyping } from "../scene/galaxy";
import type { Squad, SquadOrder } from "./store";
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
};

/**
 * While on: A arms an Attack-move, H holds the picked squads, and Esc clears
 * the selection, before anything else hears it (full screen, the galaxy).
 */
export function useCommandKeys(
  on: boolean,
  picked: number[],
  map: RefObject<Commander | null>,
  order: (squads: number[], o: SquadOrder) => void,
) {
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "a") map.current?.armAttackMove();
      else if (key === "h" && picked.length > 0)
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
  }, [on, picked, map, order]);
}

/** The picked squads, each with its count and strength, and their orders. */
export function SelectionStrip(props: {
  squads: Squad[];
  picked: number[];
  name: (unit: string) => string;
  onAttackMove: () => void;
  onHold: () => void;
}) {
  const picked = props.squads.filter((q) => props.picked.includes(q.id));
  const button =
    "border-edge bg-raised flex min-h-9 items-center gap-2 rounded-md px-3 text-[13px] disabled:opacity-50";
  const key =
    "border-edge text-ink-2 rounded-[3px] border px-1 font-mono text-[11px]";
  return (
    <div className="border-line flex flex-none items-center gap-2.5 border-t px-4 py-2.5">
      <span className={`${label} w-20 flex-none`}>
        {picked.length > 0 ? `${picked.length} selected` : "None selected"}
      </span>
      {/* A fixed-height row that scrolls sideways: the window keeps its size. */}
      <ul className="flex h-12 min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {picked.length === 0 && (
          <li className="text-ink-3 text-[13px]">
            Click or drag to select · right-click the ground to Move, an enemy
            to Attack · Shift adds
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
    </div>
  );
}
