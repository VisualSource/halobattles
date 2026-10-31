import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Tech } from "../gen/content";
import type { PlanetView, View } from "./store";
import {
  effectText,
  finishedProjects,
  heldTechs,
  idleFields,
  labs,
  needsTech,
  pauseReason,
  techCost,
  techText,
} from "./tech";

const tech = (t: Partial<Tech> & { id: string }): Tech => ({
  name: t.id,
  field: "industry",
  rarity: "common",
  cost: 300,
  ...t,
});

const content = {
  techs: new Map(
    [
      tech({
        id: "motor-pool",
        name: "Motor Pool",
        unlocks: { buildings: ["depot"], units: ["warthog"] },
      }),
      tech({
        id: "hangars",
        name: "Hangars",
        unlocks: { buildings: ["depot"] },
      }),
      tech({
        id: "plating",
        name: "Plating",
        effects: [
          { stat: "hp", percent: 10, unitClass: "infantry" },
          { stat: "upkeep", percent: -10 },
        ],
      }),
      tech({
        id: "relic",
        name: "Relic",
        requires: { buildings: ["shrine"] },
        effects: [{ stat: "techSlots", amount: 1 }],
      }),
    ].map((t) => [t.id, t]),
  ),
  buildings: new Map([
    ["depot", { name: "Vehicle Depot" }],
    ["lab", { name: "Research Lab", techSlots: 2 }],
    ["shrine", { name: "Relic Shrine" }],
  ]),
  units: new Map([["warthog", { name: "Warthog" }]]),
  unitClasses: new Map([["infantry", { name: "Infantry" }]]),
  resources: new Map(),
  rules: {
    tech: {
      costScalingPercent: 10,
      fields: { industry: { name: "Industry" } },
    },
  },
} as unknown as ContentLookups;

const planet = (
  id: string,
  owner: number,
  buildings: string[],
  labs: [number, string[]][] = [],
) =>
  ({
    id,
    owner,
    buildings,
    labs: new Map(labs),
    locked: false,
  }) as unknown as PlanetView;

function view(
  planets: PlanetView[],
  projects: View["research"]["projects"] = [],
): View {
  return {
    you: 0,
    planets: new Map(planets.map((p) => [p.id, p])),
    economy: { resources: new Map([["credits", 100]]) },
    research: {
      rates: new Map([["industry", 4]]),
      projects,
      hands: new Map(),
      saved: [],
    },
  } as unknown as View;
}

const project = (tech: string, planet = "a") =>
  ({ tech, planet, slot: 0 }) as View["research"]["projects"][number];

describe("Research alerts", () => {
  const ids = (v: View) => idleFields(content, v).map((f) => f.id);

  it("flags a field with no Project and something to pick", () => {
    const v = view([]);
    expect(ids(v)).toEqual([]); // nothing on offer: no nudge
    v.research.hands.set("industry", ["plating"]);
    expect(ids(v)).toEqual(["industry"]);
    v.research.projects.push(project("motor-pool"));
    expect(ids(v)).toEqual([]);
  });

  it("counts a saved Tech as something to pick", () => {
    const v = view([]);
    v.research.saved.push({ tech: "relic", cost: 300, done: 50, lost: false });
    expect(ids(v)).toEqual(["industry"]);
  });

  it("finds a Project finished only once its Tech is newly held", () => {
    const was = view([planet("a", 0, ["lab"])], [project("plating")]);
    const done = view([planet("a", 0, ["lab"], [[0, ["plating"]]])]);
    const cancelled = view([planet("a", 0, ["lab"])]);
    expect(finishedProjects(was, done).map((p) => p.tech)).toEqual(["plating"]);
    expect(finishedProjects(was, cancelled)).toEqual([]);
    expect(finishedProjects(was, was)).toEqual([]);
  });
});

describe("Techs", () => {
  it("holds only what your own Labs hold", () => {
    const v = view([
      planet("a", 0, ["lab"], [[0, ["plating"]]]),
      planet("b", 1, ["lab"], [[0, ["relic"]]]),
    ]);
    expect([...heldTechs(v)]).toEqual(["plating"]);
  });

  it("names the Techs that would unlock something, until you hold one", () => {
    expect(needsTech(content, new Set(), "buildings", "depot")).toEqual([
      "Motor Pool",
      "Hangars",
    ]);
    expect(
      needsTech(content, new Set(["hangars"]), "buildings", "depot"),
    ).toEqual([]);
    expect(needsTech(content, new Set(), "buildings", "lab")).toEqual([]);
  });

  it("costs 10% more for each Tech held, rounded like the server", () => {
    expect(techCost(content, new Set(["a", "b", "c"]), "plating")).toBe(390);
  });

  it("says what a Tech does", () => {
    expect(techText(content, content.techs.get("motor-pool") as Tech)).toBe(
      "Unlocks the Vehicle Depot and the Warthog",
    );
    expect(techText(content, content.techs.get("plating") as Tech)).toBe(
      "+10% Infantry HP; −10% Upkeep",
    );
    expect(effectText(content, { stat: "techSlots", amount: 1 })).toBe(
      "+1 Tech Slot per Lab",
    );
    expect(effectText(content, { stat: "commandPoints", amount: 10 })).toBe(
      "+10 Command Points",
    );
    expect(
      effectText(content, { stat: "research", amount: 1, field: "industry" }),
    ).toBe("+1 Industry Research");
    expect(effectText(content, { stat: "research", percent: 15 })).toBe(
      "+15% Research, every field",
    );
  });

  it("lists your Labs with their free Tech Slots, Relic's +1 included", () => {
    const v = view(
      [
        planet("a", 0, ["lab", "shrine", "lab"], [[0, ["relic"]]]),
        planet("b", 1, ["lab"]),
      ],
      [
        {
          tech: "plating",
          planet: "a",
          slot: 0,
          cost: 300,
          done: 0,
          since: 0,
          rate: 2,
        },
      ],
    );
    expect(labs(content, v)).toEqual([
      {
        planet: "a",
        slot: 0,
        name: "Research Lab",
        holds: ["relic"],
        researching: ["plating"],
        free: 1,
      },
      {
        planet: "a",
        slot: 2,
        name: "Research Lab",
        holds: [],
        researching: [],
        free: 3,
      },
    ]);
  });

  it("says why a Project is paused", () => {
    const p = {
      tech: "relic",
      planet: "a",
      slot: 0,
      cost: 300,
      done: 0,
      since: 0,
      rate: 0,
    };
    const name = (id: string) => id.toUpperCase();
    const v = view([planet("a", 0, ["lab"])], [p]);
    expect(pauseReason(content, v, p, name)).toBe(
      "Paused: needs a Relic Shrine",
    );
    (v.planets.get("a") as { locked: boolean }).locked = true;
    expect(pauseReason(content, v, p, name)).toBe("Paused: A is Locked");
    expect(pauseReason(content, v, { ...p, rate: 2 }, name)).toBeNull();
  });
});
