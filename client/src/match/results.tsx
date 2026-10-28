import { Link } from "@tanstack/react-router";
import { useStore } from "zustand";
import { useRingBackdrop } from "../backdrop";
import type { MatchConnection } from "./connection";
import { AlertCard, primary } from "./status";

const REASONS: Record<string, string> = {
  hold: "held the winning share of Planets",
  "last-standing": "was the last player standing",
  abandoned: "everyone left or ran out their Grace Period",
};

/** Who won and why. There's no rematch: players start a new Match. */
export function ResultsScreen(props: { conn: MatchConnection }) {
  useRingBackdrop();
  const lobby = useStore(props.conn.store, (s) => s.lobby);
  const you = useStore(props.conn.store, (s) => s.view?.you);
  const winner = lobby?.winner ?? null;
  const name =
    winner === null
      ? null
      : lobby?.seats[winner]?.displayName || `Player ${winner + 1}`;
  const reason = REASONS[lobby?.endReason ?? ""] ?? lobby?.endReason;
  const won = winner !== null && winner === you;
  return (
    <AlertCard
      role="status"
      eyebrow="MATCH OVER"
      title={won ? "Victory" : winner === null ? "No winner" : `${name} won`}
      iconBg={won ? "bg-ok-wash" : "bg-host-wash"}
      icon={
        <svg
          aria-hidden="true"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke={won ? "var(--color-ok)" : "var(--color-host)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9H4a2 2 0 0 1 0-4h2M18 9h2a2 2 0 0 0 0-4h-2M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.8 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0z" />
        </svg>
      }
    >
      <p className="text-ink-2 leading-relaxed">
        {name
          ? `${won ? "You" : name} ${won ? reason?.replace(/^was /, "were ") : reason}.`
          : `The Match ended because ${reason}.`}
      </p>
      <p className="text-ink-3 text-sm">
        There's no rematch: start a new Match from the menu.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/" className={primary}>
          BACK TO MENU
        </Link>
      </div>
    </AlertCard>
  );
}
