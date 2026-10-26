import { Link } from "@tanstack/react-router";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";

export function LobbyScreen(props: {
  conn: MatchConnection;
  content: ContentLookups;
  matchId: string;
}) {
  const lobby = useStore(props.conn.store, (s) => s.lobby);
  if (!lobby) return <p>Joining…</p>;

  const map = props.content.maps.get(lobby.map);
  return (
    <>
      <h2>Lobby</h2>
      <p>
        Map: {map?.name ?? lobby.map} · Seats {lobby.seats.length}/
        {map?.starts.length ?? "?"} · Invite: <code>{props.matchId}</code>
      </p>
      <ol>
        {lobby.seats.map((s) => (
          <li key={s.user}>
            {s.displayName || "(no name)"}
            {s.user === lobby.host && " (Host)"} ·{" "}
            {props.content.factions.get(s.faction)?.name ?? s.faction} ·{" "}
            {s.ready ? "ready" : "not ready"}
          </li>
        ))}
      </ol>
      <Link to="/">Leave</Link>
    </>
  );
}
