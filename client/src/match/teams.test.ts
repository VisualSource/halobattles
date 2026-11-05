import { describe, expect, it } from "vitest";
import {
  allied,
  allyPlanet,
  routeOwner,
  truce,
  type View,
  winnerName,
} from "./store";

const player = (seat: number, team: number) =>
  ({
    seat,
    team,
    displayName: `P${seat}`,
    truces: [],
  }) as unknown as View["players"][number];

const view = (you: number, teams: number[]) =>
  ({
    you,
    players: teams.map((t, seat) => player(seat, t)),
    planets: new Map([
      ["a", { id: "a", owner: 0 }],
      ["b", { id: "b", owner: 1 }],
      ["c", { id: "c", owner: 2 }],
      ["n", { id: "n", owner: null }],
    ]),
  }) as unknown as View;

describe("Teams", () => {
  it("allies Teammates only; neutral is no one's", () => {
    const v = view(0, [0, 0, 1]);
    expect(allied(v, 0, 1)).toBe(true);
    expect(allied(v, 0, 2)).toBe(false);
    expect(allied(v, 0, null)).toBe(false);
    expect(allyPlanet(v, "b")).toBe(true);
    expect(allyPlanet(v, "a")).toBe(false); // your own
    expect(allyPlanet(v, "c")).toBe(false);
  });

  it("a free-for-all has no allies", () => {
    const v = view(0, [0, 1, 2]);
    expect(allied(v, 0, 1)).toBe(false);
  });

  it("routes through a Truce partner's Planet as a neutral one", () => {
    const v = view(0, [0, 1, 2]);
    (v.players[0] as { truces: number[] }).truces = [1];
    expect(truce(v, 1)).toBe(true);
    expect(truce(v, 2)).toBe(false);
    expect(routeOwner(v, new Map(), "b")).toBe(null);
    expect(routeOwner(v, new Map(), "c")).toBe(2);
  });

  it("names the winner as a Team, or as a player with Teams off", () => {
    const v = view(0, [0, 0, 1]);
    expect(winnerName(v, true, 0)).toBe("Your Team");
    expect(winnerName(v, true, 1)).toBe("Team 2");
    expect(winnerName(view(0, [0, 1, 2]), false, 0)).toBe("You");
    expect(winnerName(view(0, [0, 1, 2]), false, 2)).toBe("P2");
  });
});
