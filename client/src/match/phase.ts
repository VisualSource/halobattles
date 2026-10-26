import type { Phase } from "./store";

export const phaseRoutes = {
  lobby: "/match/$matchId/lobby",
  play: "/match/$matchId/play",
  results: "/match/$matchId/results",
} as const;

export const inMatch = (pathname: string, matchId: string) =>
  pathname === `/match/${matchId}` || pathname.startsWith(`/match/${matchId}/`);

/**
 * The route the server's phase says this Match should show, or null to stay
 * put. Only paths inside the Match are corrected, so navigating away from
 * it is never undone.
 */
export function phaseRedirect(
  phase: Phase | undefined,
  pathname: string,
  matchId: string,
) {
  if (!phase || !inMatch(pathname, matchId)) return null;
  return pathname === `/match/${matchId}/${phase}` ? null : phaseRoutes[phase];
}
