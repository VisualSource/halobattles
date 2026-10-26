import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { setDisplayName, signIn } from "./auth";
import { client } from "./config";
import { loadContent } from "./content";

let auth: Awaited<ReturnType<typeof signIn>> | undefined;

const rootRoute = createRootRoute({
  beforeLoad: async () => {
    if (!auth || auth.session.isexpired(Date.now() / 1000 + 10)) {
      auth = await signIn(client, localStorage);
    }
    return auth;
  },
  component: Outlet,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: async ({ context }) => {
    const [res, content] = await Promise.all([
      client.rpc(context.session, "hello", {}),
      loadContent(client, context.session, globalThis.caches),
    ]);
    return { hello: res.payload as { message: string }, content };
  },
  component: Menu,
});

function Menu() {
  const { needsDisplayName } = indexRoute.useRouteContext();
  const { hello, content } = indexRoute.useLoaderData();
  return (
    <main>
      <h1>Halo Battles</h1>
      {needsDisplayName ? (
        <DisplayNamePrompt />
      ) : (
        <>
          <p>{hello.message}</p>
          <h2>Resources</h2>
          <ul>
            {[...content.resources.values()].map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function DisplayNamePrompt() {
  const { session } = indexRoute.useRouteContext();
  const router = useRouter();
  const [name, setName] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    await setDisplayName(client, session, name.trim());
    auth = undefined;
    await router.invalidate();
  }

  return (
    <form onSubmit={submit}>
      <label>
        Display name{" "}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={32}
        />
      </label>
      <button type="submit" disabled={!name.trim()}>
        Continue
      </button>
    </form>
  );
}

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
