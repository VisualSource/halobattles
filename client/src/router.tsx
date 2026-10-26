import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore } from "zustand";
import { signIn } from "./auth";
import { client, createSocket } from "./config";
import { type ContentLookups, loadContent } from "./content";
import { MatchConnection } from "./match/connection";
import { LobbyScreen } from "./match/lobby";
import { Toasts } from "./match/toasts";
import { DisplayNamePrompt, listOpenMatches, Menu } from "./menu";

let auth: Awaited<ReturnType<typeof signIn>> | undefined;
let content: Promise<ContentLookups> | undefined;
// The open Match connection, shared by its lobby, play and results routes.
// It is closed in the root beforeLoad, which runs before any loader, so a
// Seat is free before the menu lists Matches. (A route's onLeave runs only
// after the next route has loaded, and left routes stay cached.)
let active: { matchId: string; conn: MatchConnection } | undefined;

const inMatch = (pathname: string, matchId: string) =>
  pathname === `/match/${matchId}` || pathname.startsWith(`/match/${matchId}/`);

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
    const { session, needsDisplayName, content } = indexRoute.useRouteContext();
    const openMatches = indexRoute.useLoaderData();
    const router = useRouter();
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
        openMatches={openMatches}
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
    if (active?.matchId !== params.matchId) {
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
    const { conn } = matchRoute.useLoaderData();
    const { matchId } = matchRoute.useParams();
    const phase = useStore(conn.store, (st) => st.lobby?.phase);
    const pathname = useLocation({ select: (l) => l.pathname });
    const navigate = useNavigate();
    // The server's phase drives navigation: a phase change moves to the
    // matching child, and a URL for another phase is sent back.
    useEffect(() => {
      if (phase && pathname !== `/match/${matchId}/${phase}`) {
        void navigate({
          to: phaseRoutes[phase],
          params: { matchId },
          replace: true,
        });
      }
    }, [phase, pathname, matchId, navigate]);
    return (
      <>
        <Toasts events={conn.events} />
        <Outlet />
      </>
    );
  },
});

const phaseRoutes = {
  lobby: "/match/$matchId/lobby",
  play: "/match/$matchId/play",
  results: "/match/$matchId/results",
} as const;

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
    const { conn } = matchRoute.useLoaderData();
    const { content } = lobbyRoute.useRouteContext();
    const { matchId } = lobbyRoute.useParams();
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

// Placeholders until the galaxy map and results screens land.
const playRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "play",
  component: () => <p>The Match has started.</p>,
});

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
