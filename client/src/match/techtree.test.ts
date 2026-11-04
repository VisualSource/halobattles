import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Tech } from "../gen/content";
import type { PlanetView, View } from "./store";
import { treeLayout, treeStatus } from "./tech";

const tech = (t: Partial<Tech> & { id: string }): Tech => ({
  name: t.id,
  field: "military",
  rarity: "common",
  cost: 300,
  ...t,
});

const motor = tech({ id: "motor", name: "Motor Pool" });
const tank = tech({ id: "tank", requires: { techs: ["motor"] } });
const air = tech({ id: "air", requires: { techs: ["motor"] } });
const drop = tech({ id: "drop", requires: { techs: ["air"] } });
const relic = tech({
  id: "relic",
  rarity: "legendary",
  requires: { buildings: ["dig"] },
});

const content = {
  techs: new Map([motor, tank, air, drop, relic].map((t) => [t.id, t])),
  buildings: new Map([["dig", { name: "Dig Site" }]]),
  rules: {
    tech: {
      fields: { military: { name: "Military" } },
      rarities: { common: { from: 0 }, legendary: { from: 5 } },
    },
  },
} as unknown as ContentLookups;

function view(labs: string[] = []): View {
  return {
    you: 0,
    players: [{ faction: "unsc" }],
    armies: new Map(),
    planets: new Map([
      [
        "reach",
        {
          id: "reach",
          owner: 0,
          buildings: ["lab"],
          labs: new Map([[0, labs]]),
        } as unknown as PlanetView,
      ],
    ]),
    research: {
      rates: new Map([["military", 2]]),
      projects: [],
      hands: new Map(),
      saved: [],
    },
  } as unknown as View;
}

describe("Tech tree", () => {
  it("says where a Tech stands for you", () => {
    const v = view(["motor"]);
    v.research.projects.push({
      tech: "tank",
    } as View["research"]["projects"][number]);
    v.research.hands.set("military", ["air"]);
    const kind = (id: string) => treeStatus(content, v, id).kind;
    expect(treeStatus(content, v, "motor")).toEqual({
      kind: "held",
      planets: ["reach"],
    });
    expect(kind("tank")).toBe("researching");
    expect(kind("air")).toBe("hand");
    expect(treeStatus(content, v, "drop")).toEqual({
      kind: "locked",
      needs: ["air"],
    });
    v.research.hands.clear();
    expect(kind("air")).toBe("drawable");
  });

  it("names a missing building and too little Research, not the threshold", () => {
    expect(treeStatus(content, view(), "relic")).toEqual({
      kind: "locked",
      needs: ["a Dig Site", "more Military Research"],
    });
  });

  it("lays a chain out to the right, a Tech centred on those that need it", () => {
    const at = treeLayout([air, drop, motor, relic, tank]);
    expect(at.get("motor")?.col).toBe(0);
    expect(at.get("air")?.col).toBe(1);
    expect(at.get("drop")?.col).toBe(2);
    const rows = ["drop", "air", "tank", "motor", "relic"].map(
      (id) => at.get(id)?.row,
    );
    // air sits on drop's row; motor between air and tank; relic, a root, after.
    expect(rows).toEqual([0, 0, 1, 0.5, 2]);
  });
});
