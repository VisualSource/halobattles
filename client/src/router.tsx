import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useMatch,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore } from "zustand";
import { signIn } from "./auth";
import { client, createSocket } from "./config";
import { type ContentLookups, loadContent } from "./content";
import { MatchConnection } from "./match/connection";
import { LobbyScreen } from "./match/lobby";
import { inMatch } from "./match/phase";
import { PlayScreen } from "./match/play";
import { MatchScreen, useMatchContext } from "./match/screen";
import { DisplayNamePrompt, listOpenMatches, Menu } from "./menu";

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

const rootRoute = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (active && !inMatch(location.pathname, active.matchId)) {
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
  },
  component: () => (
    <main>
      <h1>Halo Battles</h1>
      <Outlet />
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context }) => listOpenMatches(client, context.session),
  component: function Index() {
    const { session, needsDisplayName, content } = rootRoute.useRouteContext();
    // Not the strict route hook: this re-renders while the route is leaving.
    const match = useMatch({ from: "/", shouldThrow: false });
    const router = useRouter();
    if (!match) return null;
    if (needsDisplayName) {
      return (
        <DisplayNamePrompt
          client={client}
          session={session}
          onDone={() => {
            auth = undefined;
            void router.invalidate();
          }}
        />
      );
    }
    return (
      <Menu
        client={client}
        session={session}
        content={content}
        openMatches={match.loaderData ?? []}
      />
    );
  },
});

// Opens the Match's connection, or reuses it while navigating within the
// Match. Leaving the Match closes it (see the root beforeLoad).
const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "match/$matchId",
  loader: async ({ context, params }) => {
    if (
      active?.matchId !== params.matchId ||
      active.conn.store.getState().disconnected
    ) {
      await closeActive();
      const conn = new MatchConnection(createSocket());
      try {
        await conn.open(context.session, params.matchId);
      } catch (e) {
        await conn.close();
        throw new Error((e as { message?: string }).message ?? "Couldn't join");
      }
      active = { matchId: params.matchId, conn };
    }
    return { conn: active.conn };
  },
  errorComponent: ({ error }) => (
    <>
      <p>
        Couldn't join that Match:{" "}
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Link to="/">Back to menu</Link>
    </>
  ),
  component: function MatchLayout() {
    // Not the strict route hooks: this re-renders while the route is leaving.
    const match = useMatch({ from: "/match/$matchId", shouldThrow: false });
    const conn = match?.loaderData?.conn;
    if (!match || !conn) return null;
    return <MatchScreen conn={conn} matchId={match.params.matchId} />;
  },
});

// The layout redirects to the phase's child once the first LobbyState lands.
const matchIndexRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "/",
  component: () => <p>Joining…</p>,
});

const lobbyRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "lobby",
  component: function Lobby() {
    const { conn, matchId } = useMatchContext();
    const { content } = rootRoute.useRouteContext();
    return (
      <LobbyScreen
        conn={conn}
        content={content}
        matchId={matchId}
        userId={conn.userId}
      />
    );
  },
});

const playRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "play",
  component: function Play() {
    const { conn } = useMatchContext();
    const { content: loaded } = rootRoute.useRouteContext();
    const hash = useStore(conn.store, (st) => st.view?.contentHash);
    const router = useRouter();
    const stale = hash !== undefined && hash !== loaded.hash;
    // The server's content changed since we cached ours: refetch first.
    useEffect(() => {
      if (!stale) return;
      content = undefined;
      void router.invalidate();
    }, [stale, router]);
    if (stale) return <p>Updating content…</p>;
    return <PlayScreen conn={conn} content={loaded} />;
  },
});

// A placeholder until the results screen lands.
const resultsRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "results",
  component: () => (
    <>
      <p>The Match is over.</p>
      <Link to="/">Back to menu</Link>
    </>
  ),
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    matchRoute.addChildren([
      matchIndexRoute,
      lobbyRoute,
      playRoute,
      resultsRoute,
    ]),
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
