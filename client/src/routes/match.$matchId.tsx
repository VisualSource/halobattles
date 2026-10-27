import { createFileRoute, useMatch, useParams } from "@tanstack/react-router";
import { MatchScreen } from "../match/screen";
import { CantJoin, Joining } from "../match/status";
import { joinMatch } from "../session";

export const Route = createFileRoute("/match/$matchId")({
  loader: async ({ context, params }) => ({
    conn: await joinMatch(context.session, params.matchId),
  }),
  pendingComponent: function Pending() {
    const { matchId } = useParams({ strict: false });
    return <Joining matchId={matchId} />;
  },
  errorComponent: ({ error }) => <CantJoin error={error} />,
  component: function MatchLayout() {
    // Not the strict route hooks: this re-renders while the route is leaving.
    const match = useMatch({ from: "/match/$matchId", shouldThrow: false });
    const conn = match?.loaderData?.conn;
    if (!match || !conn) return null;
    return <MatchScreen conn={conn} matchId={match.params.matchId} />;
  },
});
