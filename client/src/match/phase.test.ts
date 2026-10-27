import { describe, expect, it } from "vitest";
import { inMatch, inviteUrl, matchIdFromInvite, phaseRedirect } from "./phase";

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

describe("matchIdFromInvite", () => {
  const id = "7f3c2a91-4e0b-4c55-9d2e-1b2c3d4e5f60.nakama1";

  it("reads the id out of an Invite, from any of the Match's screens", () => {
    expect(matchIdFromInvite(inviteUrl("http://localhost:5173", id))).toBe(id);
    expect(matchIdFromInvite(`https://hb.example/match/${id}/lobby?x=1`)).toBe(
      id,
    );
    expect(matchIdFromInvite(`  hb.example/match/${id}  `)).toBe(id);
  });

  it("takes a bare id as it is", () => {
    expect(matchIdFromInvite(`  ${id} `)).toBe(id);
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
