import {
  createFileRoute,
  lazyRouteComponent,
  notFound,
} from "@tanstack/react-router";

// The Battle Lab: dev builds only, and loaded on its own, so it never ships in
// the game's bundle. Its match exists only on a server with HALO_DEV=1.
const LabPage = lazyRouteComponent(() => import("../lab/page"), "LabPage");

export const Route = createFileRoute("/lab")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: function Lab() {
    const { session, content } = Route.useRouteContext();
    return <LabPage session={session} content={content} />;
  },
});
