import { createFileRoute, Link, useMatch } from "@tanstack/react-router";
import { MatchScreen } from "../match/screen";
import { joinMatch } from "../session";

export const Route = createFileRoute("/match/$matchId")({
  loader: async ({ context, params }) => ({
    conn: await joinMatch(context.session, params.matchId),
  }),
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
