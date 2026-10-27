import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { LobbyScreen } from "../match/lobby";
import { useMatchContext } from "../match/screen";

export const Route = createFileRoute("/match/$matchId/lobby")({
  component: function Lobby() {
    const { conn, matchId } = useMatchContext();
    const { content } = useRouteContext({ from: "__root__" });
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
