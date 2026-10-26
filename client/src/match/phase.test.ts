import { describe, expect, it } from "vitest";
import { inMatch, phaseRedirect } from "./phase";

describe("phaseRedirect", () => {
  it("sends a URL for another phase to the phase's screen", () => {
    expect(phaseRedirect("play", "/match/m1/lobby", "m1")).toBe(
      "/match/$matchId/play",
    );
    expect(phaseRedirect("lobby", "/match/m1", "m1")).toBe(
      "/match/$matchId/lobby",
    );
  });

  it("stays put on the right screen, or before the phase is known", () => {
    expect(phaseRedirect("lobby", "/match/m1/lobby", "m1")).toBeNull();
    expect(phaseRedirect(undefined, "/match/m1", "m1")).toBeNull();
  });

  it("never pulls a player back who is leaving the Match", () => {
    expect(phaseRedirect("lobby", "/", "m1")).toBeNull();
    expect(phaseRedirect("lobby", "/match/m2/lobby", "m1")).toBeNull();
  });
});

describe("inMatch", () => {
  it("matches the Match's own paths only", () => {
    expect(inMatch("/match/m1", "m1")).toBe(true);
    expect(inMatch("/match/m1/play", "m1")).toBe(true);
    expect(inMatch("/match/m10/play", "m1")).toBe(false);
    expect(inMatch("/", "m1")).toBe(false);
  });
});
