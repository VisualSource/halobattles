import type { Client, Session } from "@heroiclabs/nakama-js";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { setDisplayName } from "./auth";
import type { ContentLookups } from "./content";

export type OpenMatch = { id: string; map: string; seats: number; max: number };

/** Lobby-phase Matches with a free Seat, from their labels. */
export async function listOpenMatches(
  client: Client,
  session: Session,
): Promise<OpenMatch[]> {
  const res = await client.listMatches(
    session,
    50,
    true,
    "",
    0,
    100,
    "+label.phase:lobby",
  );
  return (res.matches ?? []).flatMap((m) => {
    const label = JSON.parse(m.label ?? "{}") as Omit<OpenMatch, "id">;
    // A Match nobody has joined yet is its creator's to join first: they become Host.
    return m.match_id && label.seats >= 1 && label.seats < label.max
      ? [{ id: m.match_id, ...label }]
      : [];
  });
}

export function Menu(props: {
  client: Client;
  session: Session;
  content: ContentLookups;
  openMatches: OpenMatch[];
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [joinId, setJoinId] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await props.client.rpc(props.session, "create_match", {});
      const { matchId } = res.payload as { matchId: string };
      await navigate({ to: "/match/$matchId/lobby", params: { matchId } });
    } finally {
      setCreating(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    void navigate({
      to: "/match/$matchId/lobby",
      params: { matchId: joinId.trim() },
    });
  }

  return (
    <>
      <button type="button" onClick={create} disabled={creating}>
        Create Match
      </button>

      <form onSubmit={join}>
        <input
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          placeholder="Match id"
          required
        />
        <button type="submit">Join</button>
      </form>

      <h2>Open Matches</h2>
      <button type="button" onClick={() => router.invalidate()}>
        Refresh
      </button>
      {props.openMatches.length === 0 ? (
        <p>No open Matches. Create one.</p>
      ) : (
        <ul>
          {props.openMatches.map((m) => (
            <li key={m.id}>
              {props.content.maps.get(m.map)?.name ?? m.map} · {m.seats}/{m.max}{" "}
              <Link to="/match/$matchId/lobby" params={{ matchId: m.id }}>
                Join
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DisplayNamePrompt(props: {
  client: Client;
  session: Session;
  onDone: () => void;
}) {
  const [name, setName] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    await setDisplayName(props.client, props.session, name.trim());
    props.onDone();
  }

  return (
    <form onSubmit={submit}>
      <label>
        Display name{" "}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={32}
        />
      </label>
      <button type="submit" disabled={!name.trim()}>
        Continue
      </button>
    </form>
  );
}
