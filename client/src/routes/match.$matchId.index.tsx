import { createFileRoute } from "@tanstack/react-router";

// The layout redirects to the phase's child once the first LobbyState lands.
export const Route = createFileRoute("/match/$matchId/")({
  component: () => <p>Joining…</p>,
});
