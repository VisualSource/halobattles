import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { signIn } from "./auth";
import { client, createSocket } from "./config";
import { type ContentLookups, loadContent } from "./content";
import { MatchConnection } from "./match/connection";
import { LobbyScreen } from "./match/lobby";
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
  component: Outlet,
});

const matchIndexRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/match/$matchId/lobby", params });
  },
});

const lobbyRoute = createRoute({
  getParentRoute: () => matchRoute,
  path: "lobby",
  component: function Lobby() {
    const { conn } = matchRoute.useLoaderData();
    const { content } = lobbyRoute.useRouteContext();
    const { matchId } = lobbyRoute.useParams();
    return <LobbyScreen conn={conn} content={content} matchId={matchId} />;
  },
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    matchRoute.addChildren([matchIndexRoute, lobbyRoute]),
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
