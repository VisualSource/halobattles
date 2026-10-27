import { createFileRoute } from "@tanstack/react-router";
import { ResultsScreen } from "../match/results";
import { useMatchContext } from "../match/screen";

export const Route = createFileRoute("/match/$matchId/results")({
  component: function Results() {
    const { conn } = useMatchContext();
    return <ResultsScreen conn={conn} />;
  },
});
