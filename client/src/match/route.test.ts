import { describe, expect, it } from "vitest";
import type { GalaxyMap, Ruleset } from "../gen/content";
import { arrival, type Lanes, laneTimes, route } from "./route";
import type { Army } from "./store";

type RoutingCase = {
  description: string;
  lanes: { from: string; to: string; time: number }[];
  owners: Record<string, number>;
  player: number;
  from: string;
  to: string;
  path?: string[];
  time?: number;
  unreachable?: boolean;
};

// Shared with the server's Go test, so the two can't drift.
const fixtures = import.meta.glob<RoutingCase>(
  "../../../testdata/routing/*.json",
  { eager: true, import: "default" },
);

describe("route", () => {
  it("finds the routing fixtures", () => {
    expect(Object.keys(fixtures).length).toBeGreaterThan(0);
  });

  for (const [file, tc] of Object.entries(fixtures)) {
    it(`${file.split("/").pop()}: ${tc.description}`, () => {
      const lanes: Lanes = new Map();
      for (const l of tc.lanes) {
        for (const [a, b] of [
          [l.from, l.to],
          [l.to, l.from],
        ] as const) {
          if (!lanes.has(a)) lanes.set(a, new Map());
          lanes.get(a)?.set(b, l.time);
        }
      }
      const got = route(
        lanes,
        (p) => tc.owners[p] ?? null, // no owner listed: neutral
        tc.player,
        tc.from,
        tc.to,
      );
      expect(got).toEqual(
        tc.unreachable ? null : { path: tc.path, ms: tc.time },
      );
    });
  }
});

describe("laneTimes", () => {
  it("uses the explicit time, else length (or distance) × the type", () => {
    const map = {
      planets: [
        { id: "a", position: { x: 0, y: 0 } },
        { id: "b", position: { x: 3, y: 4 } },
        { id: "c", position: { x: 0, y: 0 } },
      ],
      lanes: [
        { from: "a", to: "b", type: "slow" },
        { from: "b", to: "c", type: "fast", length: 30 },
        { from: "c", to: "a", type: "fast", time: 12.5 },
      ],
    } as unknown as GalaxyMap;
    const rules = { laneTypes: { fast: 1, slow: 2 } } as unknown as Ruleset;

    const lanes = laneTimes(map, rules);

    expect(lanes.get("b")?.get("a")).toBe(10_000);
    expect(lanes.get("c")?.get("b")).toBe(30_000);
    expect(lanes.get("a")?.get("c")).toBe(12_500);
  });

  it("halves a hop within your own territory, as the server does", () => {
    const lanes: Lanes = new Map([
      ["a", new Map([["b", 30_000]])],
      [
        "b",
        new Map([
          ["a", 30_000],
          ["c", 30_000],
        ]),
      ],
      ["c", new Map([["b", 30_000]])],
    ]);
    const owners: Record<string, number | null> = { a: 0, b: 0, c: 1 };
    const owner = (p: string) => owners[p] ?? null;

    expect(route(lanes, owner, 0, "a", "c", 0.5)?.ms).toBe(45_000); // 15 s own, 30 s into c
    const army = {
      owner: 0,
      to: "a",
      path: ["b", "c"],
      arrives: 1_000,
      waiting: false,
    } as unknown as Army;
    expect(arrival(lanes, army, 0, 0.5, owner)).toBe(1_000 + 15_000 + 30_000);
  });
});
