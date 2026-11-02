import type { Client, Session } from "@heroiclabs/nakama-js";
import { Markdown } from "@tanstack/markdown/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { type ComponentProps, type FormEvent, useState } from "react";
import { setDisplayName } from "./auth";
import { useRingBackdrop } from "./backdrop";
import { BUILD, RELEASES, VERSION } from "./changelog";
import type { ContentLookups } from "./content";
import { MapGlyph } from "./match/lobby";
import { matchIdFromInvite } from "./match/phase";
import { Dialog } from "./ui/dialog";

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
}) {
  useRingBackdrop({ header: false });
  const navigate = useNavigate();
  const [invite, setInvite] = useState("");
  const open = useQuery({
    queryKey: ["openMatches"],
    queryFn: () => listOpenMatches(props.client, props.session),
    refetchInterval: 5000, // paused while the tab is hidden
  });
  const create = useMutation({
    mutationFn: () => props.client.rpc(props.session, "create_match", {}),
    // Returned, so the button stays disabled until the lobby has loaded.
    onSuccess: (res) => {
      const { matchId } = res.payload as { matchId: string };
      return navigate({ to: "/match/$matchId/lobby", params: { matchId } });
    },
  });
  const matches = open.data ?? [];

  function join(e: FormEvent) {
    e.preventDefault();
    void navigate({
      to: "/match/$matchId/lobby",
      params: { matchId: matchIdFromInvite(invite) },
    });
  }

  return (
    <div className="from-scrim/35 via-scrim/25 to-scrim/90 relative flex flex-1 flex-col items-center gap-9 bg-linear-to-b via-45% px-8 pt-16 pb-9">
      <Version />
      <h1 className="font-display text-7xl font-bold tracking-[0.16em] [text-shadow:0_2px_24px_rgb(0_0_0/0.6)]">
        HALO BATTLES
      </h1>

      <section
        className={cn(glass, "flex w-full max-w-115 flex-col gap-3.5 p-6")}
      >
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className={cn(primary, "min-h-15 text-xl")}
        >
          CREATE MATCH
        </button>
        {/* The error takes the hint's place, so the card keeps its size. */}
        {create.isError ? (
          <p role="alert" className="text-danger text-sm">
            Couldn't create a Match: the server didn't answer. Try again.
          </p>
        ) : (
          <p className="text-ink-3 text-sm">
            You'll be the Host: pick the map and starting resources, then share
            the invite.
          </p>
        )}
        <div className="bg-line my-1.5 h-px" />
        <form onSubmit={join} className="flex flex-col gap-2">
          <label htmlFor="invite" className="text-ink-2 text-sm font-semibold">
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
              className="bg-raised min-h-11 rounded-md px-4.5 font-medium"
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
            className="font-display text-ink-2 text-base font-semibold tracking-[0.08em]"
          >
            OPEN MATCHES
          </h2>
          <button
            type="button"
            aria-label="Refresh open Matches"
            onClick={() => void open.refetch()}
            disabled={open.isFetching}
            className="text-ink-2 inline-flex size-11 items-center justify-center rounded-md border-0 bg-transparent"
          >
            <svg
              aria-hidden="true"
              className={open.isFetching ? "motion-safe:animate-spin" : ""}
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
        {/* One card, the same size either way: the message, or the Matches in it. */}
        <div className="border-edge bg-panel/60 flex h-24 items-center rounded-[10px] border border-dashed px-3">
          {matches.length === 0 ? (
            <div className="w-full text-center">
              {open.isPending ? (
                <p className="text-ink-3">Looking for open Matches…</p>
              ) : open.isError ? (
                <>
                  <p className="font-semibold">Couldn't list open Matches</p>
                  <p className="text-ink-3 mt-1 text-sm">
                    It tries again every few seconds, or use Refresh.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">No open Matches right now</p>
                  <p className="text-ink-3 mt-1 text-sm">
                    Create one and send the invite to your friends.
                  </p>
                </>
              )}
            </div>
          ) : (
            <ul className="flex w-full gap-3 overflow-x-auto py-1">
              {matches.map((m) => {
                const map = props.content.maps.get(m.map);
                return (
                  <li
                    key={m.id}
                    className="border-edge/80 bg-panel/85 flex flex-[0_0_260px] items-center gap-3 rounded-[10px] border p-2"
                  >
                    <span className="bg-tile flex size-11 flex-none items-center justify-center rounded-md">
                      {map && <MapGlyph map={map} />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-display truncate font-semibold">
                        {map?.name ?? m.map}
                      </span>
                      <span className="text-ink-3 text-sm">
                        {m.seats} of {m.max} Seats
                      </span>
                    </span>
                    <Link
                      to="/match/$matchId/lobby"
                      params={{ matchId: m.id }}
                      className="bg-accent text-accent-ink inline-flex min-h-10 items-center rounded-md px-4 font-semibold hover:no-underline"
                    >
                      Join
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The game's version, small in the menu's bottom-left corner, in its bottom
 * padding so nothing moves; it opens the changelog.
 */
function Version() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={BUILD}
        aria-label={`Version ${VERSION}: what's changed`}
        onClick={() => setOpen(true)}
        className="text-ink-4 hover:text-ink-2 absolute bottom-2 left-4 border-0 bg-transparent p-1 font-mono text-xs"
      >
        v{VERSION}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label="changelog-title"
        className="border-edge bg-panel text-ink w-full max-w-lg rounded-xl border"
      >
        <div className="flex max-h-[80vh] flex-col">
          <div className="border-line flex items-center justify-between gap-2 border-b py-3 pr-3 pl-5">
            <h2
              id="changelog-title"
              className="font-display text-ink-2 text-base font-semibold tracking-[0.08em]"
            >
              WHAT'S CHANGED
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border-edge text-ink-2 inline-flex min-h-11 items-center rounded-md border bg-transparent px-4 font-medium"
            >
              Close
            </button>
          </div>
          <div className="flex flex-col gap-6 overflow-y-auto px-5 py-4">
            {RELEASES.map((r) => (
              <section key={r.version} className="flex flex-col gap-2">
                <h3 className="font-display text-xl font-semibold">
                  {r.version}{" "}
                  <span className="text-ink-3 font-sans text-sm font-normal">
                    {r.date}
                  </span>
                </h3>
                <Markdown components={notes}>{r.notes}</Markdown>
              </section>
            ))}
          </div>
          <p className="border-line text-ink-4 border-t px-5 py-2 font-mono text-xs">
            Build {BUILD}
          </p>
        </div>
      </Dialog>
    </>
  );
}

/** How a release's notes render: its "###" sections sit under the release's own heading. */
const notes = {
  h3: (p: ComponentProps<"h3">) => (
    <h4
      {...p}
      className="text-ink-3 mt-2 text-xs font-semibold tracking-[0.12em] uppercase"
    />
  ),
  ul: (p: ComponentProps<"ul">) => (
    <ul
      {...p}
      className="text-ink-2 flex list-disc flex-col gap-1 pl-5 text-sm"
    />
  ),
  p: (p: ComponentProps<"p">) => <p {...p} className="text-ink-2 text-sm" />,
  a: (p: ComponentProps<"a">) => (
    <a {...p} target="_blank" rel="noreferrer" className="text-accent" />
  ),
};

export function DisplayNamePrompt(props: {
  client: Client;
  session: Session;
  onDone: () => void;
}) {
  useRingBackdrop({ header: false });
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: (n: string) => setDisplayName(props.client, props.session, n),
    onSuccess: props.onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(name.trim());
  }

  return (
    <div className="bg-scrim/55 flex flex-1 items-center justify-center p-8">
      <form
        onSubmit={submit}
        className={cn(glass, "flex w-full max-w-110 flex-col gap-5 p-8")}
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-ink-3 text-xs font-semibold tracking-[0.14em]">
            WELCOME
          </p>
          <h1 className="font-display text-3xl font-semibold">
            Choose a display name
          </h1>
          <p className="text-ink-2 leading-normal">
            Other players see it in lobbies and during Matches.
          </p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-ink-2 text-sm font-semibold">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={32}
            placeholder="Up to 32 characters"
            className={cn(field, "min-h-12 text-base")}
          />
        </label>
        {/* A line kept for the error, so the form doesn't grow. */}
        <p role="alert" className="text-danger -mt-3 min-h-5 text-sm">
          {save.isError && "Couldn't save your name. Try again."}
        </p>
        <button
          type="submit"
          disabled={!name.trim() || save.isPending}
          className={cn(primary, "min-h-13 text-lg")}
        >
          CONTINUE
        </button>
      </form>
    </div>
  );
}
