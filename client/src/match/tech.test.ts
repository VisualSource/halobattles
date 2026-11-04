import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Tech } from "../gen/content";
import type { Army, PlanetView, View } from "./store";
import {
  courierLanding,
  effectText,
  finishedProjects,
  heldTechs,
  idleFields,
  labFill,
  labs,
  needsTech,
  pauseReason,
  researchBuildings,
  techCost,
  techsLostWithLab,
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
  units: new Map([
    ["warthog", { name: "Warthog" }],
    ["flame", { name: "Flame Hog", variantOf: "warthog" }],
  ]),
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
    armies: new Map(),
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

describe("Research buildings hint", () => {
  // Logistics has only Rare Techs (from 5): one shared, one Covenant's.
  const c = {
    techs: new Map([
      ["supply", tech({ id: "supply", field: "logistics", rarity: "rare" })],
      [
        "fleet",
        tech({
          id: "fleet",
          field: "logistics",
          rarity: "rare",
          faction: "covenant",
        }),
      ],
    ]),
    buildings: new Map([
      [
        "command",
        { name: "Fleet Command", faction: "unsc", research: { logistics: 2 } },
      ],
      [
        "ministry",
        { name: "Ministry", faction: "covenant", research: { logistics: 2 } },
      ],
      ["lab", { name: "Research Lab", faction: "unsc" }],
    ]),
    rules: { tech: { rarities: { common: { from: 0 }, rare: { from: 5 } } } },
  } as unknown as ContentLookups;
  const at = (rate: number, planets: PlanetView[] = []) => {
    const v = view(planets);
    v.research.rates.set("logistics", rate);
    (v as { players: unknown }).players = [{ faction: "unsc" }];
    return v;
  };

  it("names your Faction's buildings while Research opens none of the field's Techs", () => {
    expect(researchBuildings(c, at(1), "logistics")).toEqual(["Fleet Command"]);
    expect(researchBuildings(c, at(3), "logistics")).toEqual(["Fleet Command"]);
  });

  it("names none once a Tech is open, or none are left", () => {
    expect(researchBuildings(c, at(5), "logistics")).toEqual([]);
    const held = at(1, [planet("a", 0, ["lab"], [[0, ["supply"]]])]);
    expect(researchBuildings(c, held, "logistics")).toEqual([]);
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

  it("locks a Unit Variant while its parent is locked", () => {
    expect(needsTech(content, new Set(), "units", "flame")).toEqual([
      "Motor Pool",
    ]);
    expect(
      needsTech(content, new Set(["motor-pool"]), "units", "flame"),
    ).toEqual([]);
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
        couriers: [],
        free: 1,
      },
      {
        planet: "a",
        slot: 2,
        name: "Research Lab",
        holds: [],
        researching: [],
        couriers: [],
        free: 3,
      },
    ]);
  });

  it("counts a Courier against both its Labs, once if it's going back to the one it left", () => {
    const v = view([
      planet("a", 0, ["lab", "", "lab"]),
      planet("b", 0, ["lab"]),
    ]);
    const courier = (id: number, tech: string, home: string, dest: string) =>
      ({
        id,
        tech,
        homePlanet: home,
        homeSlot: 0,
        destPlanet: dest,
        destSlot: 0,
      }) as Army;
    const free = () =>
      labs(content, v).map((l) => [l.planet, l.slot, l.free, l.couriers]);

    v.armies.set(1, courier(1, "relic", "a", "b"));
    expect(free()).toEqual([
      ["a", 0, 1, ["relic"]],
      ["a", 2, 2, []],
      ["b", 0, 1, ["relic"]],
    ]);

    v.armies.set(1, courier(1, "relic", "a", "a"));
    expect(free()).toEqual([
      ["a", 0, 1, ["relic"]],
      ["a", 2, 2, []],
      ["b", 0, 2, []],
    ]);

    // Its origin Lab lost: it reserves only where it's going.
    v.armies.set(1, courier(1, "relic", "", "b"));
    expect(free()).toEqual([
      ["a", 0, 2, []],
      ["a", 2, 2, []],
      ["b", 0, 1, ["relic"]],
    ]);
  });

  it("fills a Lab the same for the Planet window as for labs()", () => {
    const yours = planet("a", 0, ["lab"], [[0, ["relic"]]]);
    const theirs = planet("b", 1, ["lab"], [[0, ["plating"]]]);
    const v = view([yours, theirs]);
    // Relic's +1 Tech Slot counts on your Lab: 2 + 1, less Relic itself.
    expect(labFill(content, v, yours, 0, 2).free).toBe(2);
    expect(labs(content, v)[0]?.free).toBe(2);
    // It's your Tech: another player's Lab stays as the building says.
    expect(labFill(content, v, theirs, 0, 2).free).toBe(1);
  });

  describe("selling a Lab", () => {
    const courier = (home: string, homeSlot: number, dest: string) =>
      ({
        id: 1,
        tech: "plating",
        homePlanet: home,
        homeSlot,
        destPlanet: dest,
        destSlot: 0,
      }) as Army;
    const a = planet("a", 0, ["lab"], [[0, ["relic"]]]);
    const lost = (c: Army) => {
      const v = view([a, planet("b", 0, ["lab"])]);
      v.armies.set(1, c);
      return techsLostWithLab(v, a, 0);
    };

    it("loses what it holds and a Courier heading back to it", () => {
      expect(lost(courier("a", 0, "a"))).toEqual(["relic", "plating"]);
    });

    it("loses a Courier coming to it whose own Lab is gone", () => {
      expect(lost(courier("", 0, "a"))).toEqual(["relic", "plating"]);
    });

    it("spares a Courier that can still turn back, or left for elsewhere", () => {
      expect(lost(courier("b", 0, "a"))).toEqual(["relic"]);
      expect(lost(courier("a", 0, "b"))).toEqual(["relic"]);
    });
  });

  it("says when a Courier lands, or where it's waiting", () => {
    const lanes = new Map([["b", new Map([["c", 30_000]])]]);
    const going = {
      to: "b",
      path: ["c"],
      arrives: 10_000,
      waiting: false,
    } as unknown as Army;
    const name = (p: string) => p.toUpperCase();
    expect(courierLanding(lanes, going, 1_000, name)).toBe("arrives in 39 s");
    expect(
      courierLanding(lanes, { ...going, waiting: true }, 1_000, name),
    ).toBe("waiting in orbit at B");
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
