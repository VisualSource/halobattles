import { createFileRoute } from "@tanstack/react-router";
import { Joining } from "../match/status";

// The layout redirects to the phase's child once the first LobbyState lands.
export const Route = createFileRoute("/match/$matchId/")({
  component: function MatchIndex() {
    return <Joining matchId={Route.useParams().matchId} />;
  },
});
