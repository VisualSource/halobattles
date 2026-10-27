import { Link, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useRingBackdrop } from "../backdrop";
import type { LocalStore } from "./local";
import type { Phase } from "./store";
import { useMatchNow } from "./time";

const primary =
  "inline-flex min-h-12 items-center justify-center rounded-lg border-0 bg-accent px-6 font-bold font-display text-accent-ink tracking-[0.1em] hover:no-underline";
const secondary =
  "inline-flex min-h-12 items-center rounded-lg border border-edge bg-raised px-5 font-medium text-ink hover:no-underline";

/** Shown while joining a Match, until its first LobbyState lands. */
export function Joining(props: { matchId?: string }) {
  useRingBackdrop();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div
        role="status"
        className="flex flex-col items-center gap-7 text-center"
      >
        <div aria-hidden="true" className="relative size-22">
          <div className="absolute inset-0 rounded-full border-3 border-line" />
          <div className="absolute inset-0 animate-spin rounded-full border-3 border-transparent border-t-accent" />
          <div className="absolute inset-7.5 animate-pulse rounded-full bg-accent" />
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="font-semibold text-ink-3 text-xs tracking-[0.14em]">
            ESTABLISHING LINK
          </p>
          <h2 className="font-display font-semibold text-4xl">Joining Match</h2>
          {props.matchId && (
            <code className="font-mono text-ink-3 text-sm">
              {props.matchId}
            </code>
          )}
        </div>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-md border border-edge px-4.5 font-medium text-ink-2 hover:no-underline"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

function AlertCard(props: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  iconBg: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div
        role="alert"
        className="flex w-full max-w-140 flex-col gap-6 rounded-xl border border-edge/80 bg-panel/85 p-8 backdrop-blur-sm"
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className={`flex size-14 flex-none items-center justify-center rounded-lg ${props.iconBg}`}
          >
            {props.icon}
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-ink-3 text-xs tracking-[0.14em]">
              {props.eyebrow}
            </p>
            <h2 className="font-display font-semibold text-[28px]">
              {props.title}
            </h2>
          </div>
        </div>
        {props.children}
      </div>
    </div>
  );
}

// The server's join rejections, in plain words.
const joinFailures = [
  {
    match: "every seat is taken",
    title: "This Match is full",
    body: "Every Seat is taken. If someone leaves the lobby, a Seat opens up and you can try again.",
    retry: true,
  },
  {
    match: "has started",
    title: "This Match has started",
    body: "Only players who already have a Seat can rejoin once a Match starts. Find another Match from the menu, or create your own.",
    retry: false,
  },
  {
    match: "not found",
    title: "Match not found",
    body: "The invite may be wrong, or the Match closed when its lobby emptied.",
    retry: false,
  },
];

/** Joining was rejected or failed. */
export function CantJoin(props: { error: unknown }) {
  useRingBackdrop();
  const router = useRouter();
  const reason =
    props.error instanceof Error ? props.error.message : String(props.error);
  const known = joinFailures.find((f) =>
    reason.toLowerCase().includes(f.match),
  );
  return (
    <AlertCard
      eyebrow="COULDN'T JOIN"
      title={known?.title ?? "Something went wrong"}
      iconBg="bg-host-wash"
      icon={
        <svg
          aria-hidden="true"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-host)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      }
    >
      <p className="text-ink-2 leading-relaxed">
        {known?.body ?? "The server couldn't put you in this Match."}
      </p>
      <div className="flex flex-col gap-1.5 rounded-md bg-well px-3.5 py-3">
        <span className="text-ink-3 text-xs">Server said</span>
        <code className="font-mono text-ink-2 text-sm">{reason}</code>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/" className={primary}>
          BACK TO MENU
        </Link>
        {(known?.retry ?? true) && (
          <button
            type="button"
            onClick={() => void router.invalidate()}
            className={secondary}
          >
            Try again
          </button>
        )}
      </div>
    </AlertCard>
  );
}

const minSec = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The socket dropped. During play the Seat is held for the Grace Period, so
 * this counts it down from when the drop was noticed: the server can't say.
 */
export function LostConnection(props: {
  phase: Phase | undefined;
  local: LocalStore;
  graceMs: number;
}) {
  useRingBackdrop();
  const router = useRouter();
  const now = useMatchNow(props.local);
  const [graceEnds] = useState(() => now + props.graceMs);
  const left = graceEnds - now;
  const forfeited = props.phase === "play" && left <= 0;
  return (
    <AlertCard
      eyebrow="CONNECTION LOST"
      title="Lost the connection to the server"
      iconBg="bg-danger-wash"
      icon={
        <svg
          aria-hidden="true"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-danger)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8" />
          <path d="M5 12.6a10 10 0 0 1 5.2-2.5M14.8 10.4A10 10 0 0 1 19 12.6" />
          <path d="M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20" />
        </svg>
      }
    >
      {props.phase === "play" &&
        (forfeited ? (
          <p className="text-ink-2 leading-relaxed">
            The Grace Period is over, so you've Forfeited this Match.
          </p>
        ) : (
          <>
            <p className="text-ink-2 leading-relaxed">
              Your Seat is held while you're gone, and your queues and Armies
              carry on. Rejoin before the Grace Period ends, or you Forfeit.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-well px-4 py-3.5">
              <span className="text-ink-2">Seat held for</span>
              <span className="font-mono text-host text-xl" role="timer">
                {minSec(left)}
              </span>
            </div>
          </>
        ))}
      {props.phase === "lobby" && (
        <p className="text-ink-2 leading-relaxed">
          Your Seat in the lobby was freed. Rejoin to take a Seat again if one
          is still open.
        </p>
      )}
      <p className="text-ink-3 text-sm">
        If the server restarted, this Match is gone.
      </p>
      <div className="flex flex-wrap gap-3">
        {!forfeited && (
          <button
            type="button"
            onClick={() => void router.invalidate()}
            className={primary}
          >
            REJOIN
          </button>
        )}
        <Link to="/" className={forfeited ? primary : secondary}>
          {forfeited ? "BACK TO MENU" : "Back to menu"}
        </Link>
      </div>
    </AlertCard>
  );
}
