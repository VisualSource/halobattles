import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useStore } from "zustand";
import type { ContentLookups } from "../content";
import type { MatchConnection } from "./connection";
import { isPending } from "./local";

export function LobbyScreen(props: {
  conn: MatchConnection;
  content: ContentLookups;
  matchId: string;
  userId: string;
}) {
  const { conn, content, userId } = props;
  const lobby = useStore(conn.store, (s) => s.lobby);
  const local = useStore(conn.local);
  if (!lobby) return <p>Joining…</p>;

  const map = content.maps.get(lobby.map);
  const me = lobby.seats.find((s) => s.user === userId);
  const isHost = lobby.host === userId;
  const canStart =
    isHost &&
    lobby.seats.every((s) => s.ready) &&
    lobby.seats.length >= (map?.minPlayers ?? Number.POSITIVE_INFINITY);
  const byId = <T,>(m: Map<string, T>) =>
    [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <>
      <h2>Lobby</h2>
      <p>
        Invite: <code>{props.matchId}</code>
      </p>
      <ol>
        {lobby.seats.map((s) => (
          <li key={s.user}>
            {s.displayName || "(no name)"}
            {s.user === lobby.host && " (Host)"} ·{" "}
            {content.factions.get(s.faction)?.name ?? s.faction} ·{" "}
            {s.ready ? "ready" : "not ready"}
          </li>
        ))}
      </ol>
      {me && (
        <fieldset>
          <legend>You</legend>
          <label>
            Faction{" "}
            <select
              value={me.faction}
              disabled={isPending(local, "faction")}
              onChange={(e) => conn.setFaction(e.target.value)}
            >
              {byId(content.factions).map(([id, f]) => (
                <option key={id} value={id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            <input
              type="checkbox"
              checked={me.ready}
              disabled={isPending(local, "ready")}
              onChange={(e) => conn.setReady(e.target.checked)}
            />{" "}
            Ready
          </label>
        </fieldset>
      )}
      <fieldset disabled={!isHost}>
        <legend>Match settings{!isHost && " (Host only)"}</legend>
        <label>
          Map{" "}
          <select
            value={lobby.map}
            disabled={isPending(local, "map")}
            onChange={(e) => conn.setMap(e.target.value)}
          >
            {byId(content.maps).map(([id, m]) => (
              <option key={id} value={id}>
                {m.name} ({m.starts.length} players)
              </option>
            ))}
          </select>
        </label>
        <StartingResources
          conn={conn}
          content={content}
          current={lobby.startingResources}
          pending={isPending(local, "startingResources")}
        />
      </fieldset>
      <button
        type="button"
        disabled={!canStart || isPending(local, "start")}
        onClick={() => conn.startMatch()}
      >
        Start
      </button>{" "}
      <Link to="/">Leave</Link>
    </>
  );
}

function StartingResources(props: {
  conn: MatchConnection;
  content: ContentLookups;
  current: Map<string, number>;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(() => new Map(props.current));
  // Show the server's values again whenever they change.
  const currentKey = JSON.stringify([...props.current]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the values, not the Map's identity
  useEffect(() => setDraft(new Map(props.current)), [currentKey]);

  function apply(e: FormEvent) {
    e.preventDefault();
    props.conn.setStartingResources(draft);
  }

  return (
    <form onSubmit={apply}>
      Starting resources{" "}
      {[...props.content.resources.values()].map((r) => (
        <label key={r.id}>
          {r.name}{" "}
          <input
            type="number"
            min={0}
            max={1_000_000}
            step={1}
            required
            value={draft.get(r.id) ?? 0}
            onChange={(e) =>
              setDraft(new Map(draft).set(r.id, e.target.valueAsNumber))
            }
          />{" "}
        </label>
      ))}
      <button type="submit" disabled={props.pending}>
        Apply
      </button>
    </form>
  );
}
