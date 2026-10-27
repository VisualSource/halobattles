import type { Phase } from "./store";

export const phaseRoutes = {
  lobby: "/match/$matchId/lobby",
  play: "/match/$matchId/play",
  results: "/match/$matchId/results",
} as const;

/** A Match's Invite: its URL, which lands on whichever screen its phase shows. */
export const inviteUrl = (origin: string, matchId: string) =>
  `${origin}/match/${encodeURIComponent(matchId)}`;

/** The Match id in a pasted Invite, which may also be a bare id. */
export function matchIdFromInvite(text: string) {
  const path = text.match(/\/match\/([^/?#\s]+)/);
  return path?.[1] ? decodeURIComponent(path[1]) : text.trim();
}

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
