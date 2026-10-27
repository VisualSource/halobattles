import type { Client, Session } from "@heroiclabs/nakama-js";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { setDisplayName } from "./auth";
import { useRingBackdrop } from "./backdrop";
import type { ContentLookups } from "./content";
import { MapGlyph } from "./match/lobby";
import { matchIdFromInvite } from "./match/phase";

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

const glass = "rounded-xl border border-edge/80 bg-panel/80 backdrop-blur-sm";
const primary =
  "rounded-lg border-0 bg-accent font-bold font-display text-accent-ink tracking-[0.14em]";
const field =
  "min-h-11 min-w-0 flex-1 rounded-md border-edge bg-well px-3 placeholder:text-ink-4";

export function Menu(props: {
  client: Client;
  session: Session;
  content: ContentLookups;
  openMatches: OpenMatch[];
}) {
  useRingBackdrop({ header: false });
  const navigate = useNavigate();
  const router = useRouter();
  const [invite, setInvite] = useState("");
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
      params: { matchId: matchIdFromInvite(invite) },
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-9 bg-linear-to-b from-scrim/35 via-45% via-scrim/25 to-scrim/90 px-8 pt-16 pb-9">
      <h1 className="font-bold font-display text-7xl tracking-[0.16em] [text-shadow:0_2px_24px_rgb(0_0_0/0.6)]">
        HALO BATTLES
      </h1>

      <section
        className={`flex w-full max-w-115 flex-col gap-3.5 p-6 ${glass}`}
      >
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className={`min-h-15 text-xl ${primary}`}
        >
          CREATE MATCH
        </button>
        <p className="text-ink-3 text-sm">
          You'll be the Host: pick the map and starting resources, then share
          the invite.
        </p>
        <div className="my-1.5 h-px bg-line" />
        <form onSubmit={join} className="flex flex-col gap-2">
          <label htmlFor="invite" className="font-semibold text-ink-2 text-sm">
            Join with an invite
          </label>
          <div className="flex gap-2">
            <input
              id="invite"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="Paste an invite link"
              required
              className={field}
            />
            <button
              type="submit"
              className="min-h-11 rounded-md bg-raised px-4.5 font-medium"
            >
              Join
            </button>
          </div>
        </form>
      </section>

      <section
        aria-labelledby="open-matches"
        className="mt-auto flex w-full max-w-400 flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id="open-matches"
            className="font-display font-semibold text-base text-ink-2 tracking-[0.08em]"
          >
            OPEN MATCHES
          </h2>
          <button
            type="button"
            aria-label="Refresh open Matches"
            onClick={() => void router.invalidate()}
            className="inline-flex size-11 items-center justify-center rounded-md border-0 bg-transparent text-ink-2"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 4v5h-5" />
            </svg>
          </button>
        </div>
        {props.openMatches.length === 0 ? (
          <div className="rounded-[10px] border border-edge border-dashed bg-panel/60 px-5 py-4.5 text-center">
            <p className="font-semibold">No open Matches right now</p>
            <p className="mt-1 text-ink-3 text-sm">
              Create one and send the invite to your friends.
            </p>
          </div>
        ) : (
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {props.openMatches.map((m) => {
              const map = props.content.maps.get(m.map);
              return (
                <li
                  key={m.id}
                  className="flex flex-[0_0_260px] items-center gap-3 rounded-[10px] border border-edge/80 bg-panel/85 p-2"
                >
                  <span className="flex size-11 flex-none items-center justify-center rounded-md bg-tile">
                    {map && <MapGlyph map={map} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-display font-semibold">
                      {map?.name ?? m.map}
                    </span>
                    <span className="text-ink-3 text-sm">
                      {m.seats} of {m.max} Seats
                    </span>
                  </span>
                  <Link
                    to="/match/$matchId/lobby"
                    params={{ matchId: m.id }}
                    className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 font-semibold text-accent-ink hover:no-underline"
                  >
                    Join
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function DisplayNamePrompt(props: {
  client: Client;
  session: Session;
  onDone: () => void;
}) {
  useRingBackdrop({ header: false });
  const [name, setName] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    await setDisplayName(props.client, props.session, name.trim());
    props.onDone();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-scrim/55 p-8">
      <form
        onSubmit={submit}
        className={`flex w-full max-w-110 flex-col gap-5 p-8 ${glass}`}
      >
        <div className="flex flex-col gap-1.5">
          <p className="font-semibold text-ink-3 text-xs tracking-[0.14em]">
            WELCOME
          </p>
          <h1 className="font-display font-semibold text-3xl">
            Choose a display name
          </h1>
          <p className="text-ink-2 leading-normal">
            Other players see it in lobbies and during Matches.
          </p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="font-semibold text-ink-2 text-sm">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={32}
            placeholder="Up to 32 characters"
            className={`${field} min-h-12 text-base`}
          />
        </label>
        <button
          type="submit"
          disabled={!name.trim()}
          className={`min-h-13 text-lg ${primary}`}
        >
          CONTINUE
        </button>
      </form>
    </div>
  );
}
