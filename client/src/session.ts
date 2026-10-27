import type { Session } from "@heroiclabs/nakama-js";
import { signIn } from "./auth";
import { client, createSocket } from "./config";
import { type ContentLookups, loadContent } from "./content";
import { MatchConnection } from "./match/connection";
import { inMatch } from "./match/phase";

// State the routes share across navigations.

let auth: Awaited<ReturnType<typeof signIn>> | undefined;
let content: Promise<ContentLookups> | undefined;
// The open Match connection, shared by its lobby, play and results routes.
// It is closed in the root beforeLoad, which runs before any loader, so a
// Seat is free before the menu lists Matches. (A route's onLeave runs only
// after the next route has loaded, and left routes stay cached.)
let active: { matchId: string; conn: MatchConnection } | undefined;

async function closeActive() {
  const conn = active?.conn;
  if (!conn) return;
  active = undefined;
  await conn.close();
  // ponytail: the leave is acked before the Match runs MatchLeave and
  // relabels itself, so wait about a tick before the menu lists Matches.
  // Only enough with match.label_update_interval_ms at 200 (deploy/local.yml;
  // prod configs need it too). Replace with a server ack if that's too tight.
  await new Promise((r) => setTimeout(r, 250));
}

/** The root route's context: closes a left Match, signs in, loads content. */
export async function rootContext(pathname: string) {
  if (active && !inMatch(pathname, active.matchId)) {
    await closeActive();
  }
  if (!auth || auth.session.isexpired(Date.now() / 1000 + 10)) {
    auth = await signIn(client, localStorage);
  }
  content ??= loadContent(client, auth.session, globalThis.caches).catch(
    (e) => {
      content = undefined; // retry on the next navigation
      throw e;
    },
  );
  return { ...auth, content: await content };
}

/** Signs in again on the next navigation, e.g. after setting a name. */
export const forgetAuth = () => {
  auth = undefined;
};

/** Refetches content on the next navigation. */
export const forgetContent = () => {
  content = undefined;
};

/**
 * Opens the Match's connection, or reuses it while navigating within the
 * Match. Leaving the Match closes it (see rootContext).
 */
export async function joinMatch(session: Session, matchId: string) {
  if (
    active?.matchId !== matchId ||
    active.conn.store.getState().disconnected
  ) {
    await closeActive();
    const conn = new MatchConnection(createSocket());
    try {
      await conn.open(session, matchId);
    } catch (e) {
      await conn.close();
      throw new Error((e as { message?: string }).message ?? "Couldn't join");
    }
    active = { matchId, conn };
  }
  return active.conn;
}
