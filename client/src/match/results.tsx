import { Link } from "@tanstack/react-router";
import { useStore } from "zustand";
import type { MatchConnection } from "./connection";

const REASONS: Record<string, string> = {
  hold: "held the winning share of Planets",
  "last-standing": "was the last player standing",
};

/** Who won and why. There's no rematch: players start a new Match. */
export function ResultsScreen(props: { conn: MatchConnection }) {
  const lobby = useStore(props.conn.store, (s) => s.lobby);
  const winner = lobby?.winner ?? null;
  const name =
    winner === null
      ? null
      : lobby?.seats[winner]?.displayName || `Player ${winner + 1}`;
  const reason = REASONS[lobby?.endReason ?? ""] ?? lobby?.endReason;
  return (
    <>
      <h2>The Match is over</h2>
      <p>{name ? `${name} won: they ${reason}.` : `No one won (${reason}).`}</p>
      <Link to="/">Back to menu</Link>
    </>
  );
}
