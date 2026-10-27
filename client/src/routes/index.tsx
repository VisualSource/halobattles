import {
  createFileRoute,
  useMatch,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import { client } from "../config";
import { DisplayNamePrompt, listOpenMatches, Menu } from "../menu";
import { forgetAuth } from "../session";

export const Route = createFileRoute("/")({
  loader: ({ context }) => listOpenMatches(client, context.session),
  component: function Index() {
    const { session, needsDisplayName, content } = useRouteContext({
      from: "__root__",
    });
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
            forgetAuth();
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
