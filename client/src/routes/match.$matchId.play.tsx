import {
  createFileRoute,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useStore } from "zustand";
import { PlayScreen } from "../match/play";
import { useMatchContext } from "../match/screen";
import { forgetContent } from "../session";

export const Route = createFileRoute("/match/$matchId/play")({
  component: function Play() {
    const { conn } = useMatchContext();
    const { content: loaded } = useRouteContext({ from: "__root__" });
    const hash = useStore(conn.store, (st) => st.view?.contentHash);
    const router = useRouter();
    const stale = hash !== undefined && hash !== loaded.hash;
    // The server's content changed since we cached ours: refetch first.
    useEffect(() => {
      if (!stale) return;
      forgetContent();
      void router.invalidate();
    }, [stale, router]);
    if (stale) return <p>Updating content…</p>;
    return <PlayScreen conn={conn} content={loaded} />;
  },
});
