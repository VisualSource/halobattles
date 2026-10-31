import {
  Outlet,
  useNavigate,
  useRouteContext,
  useRouterState,
} from "@tanstack/react-router";
import { createContext, useContext, useEffect } from "react";
import { useStore } from "zustand";
import type { MatchConnection } from "./connection";
import { MusicPlayer } from "./music";
import { phaseRedirect } from "./phase";
import { LostConnection } from "./status";
import { Toasts } from "./toasts";

// The open Match, for the lobby, play and results screens. They read it from
// here rather than from route hooks, which throw while the Match route is
// leaving but its screens are still mounted.
const MatchContext = createContext<{
  conn: MatchConnection;
  matchId: string;
} | null>(null);

export function useMatchContext() {
  const m = useContext(MatchContext);
  if (!m) throw new Error("useMatchContext outside a Match screen");
  return m;
}

/** The layout around every screen of one Match. */
export function MatchScreen(props: { conn: MatchConnection; matchId: string }) {
  const { conn, matchId } = props;
  const phase = useStore(conn.store, (st) => st.lobby?.phase);
  const disconnected = useStore(conn.store, (st) => st.disconnected);
  // The resolved location: while leaving, the pending one is already "/"
  // but this screen is still mounted.
  const pathname = useRouterState({
    select: (st) => st.resolvedLocation?.pathname ?? "",
  });
  const navigate = useNavigate();
  const { content } = useRouteContext({ from: "__root__" });
  const { rules } = content;
  // One player for the whole Match, so a Battle or the Results screen doesn't restart it.
  const music = (phase === "play" || phase === "results") && (
    <MusicPlayer content={content} />
  );

  // The server's phase drives navigation: a phase change moves to the
  // matching screen, and a URL for another phase is sent back.
  useEffect(() => {
    const to = phaseRedirect(phase, pathname, matchId);
    if (to) void navigate({ to, params: { matchId }, replace: true });
  }, [phase, pathname, matchId, navigate]);

  return (
    <>
      {disconnected ? (
        <LostConnection
          phase={phase}
          local={conn.local}
          graceMs={rules.gracePeriodSeconds * 1000}
        />
      ) : (
        <MatchContext.Provider value={props}>
          <Toasts events={conn.events} />
          <Outlet />
        </MatchContext.Provider>
      )}
      {/* After the branch, so a reconnect doesn't remount it and restart the album. */}
      {music}
    </>
  );
}
