import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Building } from "../gen/content";
import { factsOf, roleOf } from "./buildings";

const building = (b: Partial<Building>): Building => ({
  id: "x",
  name: "X",
  faction: "unsc",
  cost: {},
  buildTime: 30,
  upkeep: {},
  yield: {},
  commandPointBonus: 0,
  ...b,
});

const content = {
  resources: new Map([
    ["credits", { name: "Credits" }],
    ["materials", { name: "Materials" }],
    ["alloys", { name: "Alloys" }],
  ]),
  units: new Map([["marine", { name: "Marine" }]]),
  unitClasses: new Map([["infantry", { name: "Infantry" }]]),
  weaponTypes: new Map([["kinetic", { name: "Kinetic" }]]),
  techs: new Map([
    [
      "relics",
      { name: "Relics", requires: { buildings: ["dig"] }, faction: "unsc" },
    ],
  ]),
  rules: {
    paydaySeconds: 90,
    tech: { fields: { industry: { name: "Industry" } } },
  },
} as unknown as ContentLookups;

const lines = (b: Building, richness: [string, string][] = []) =>
  factsOf(content, b, new Map(richness)).map((f) =>
    f.sub ? `${f.line} (${f.sub})` : f.line,
  );

describe("Buildings", () => {
  it("takes a role from what a building mainly does", () => {
    expect(roleOf(building({ trains: ["marine"], research: { a: 1 } }))).toBe(
      "production",
    );
    expect(roleOf(building({ techSlots: 3 }))).toBe("lab");
    expect(roleOf(building({ research: { industry: 2 } }))).toBe("research");
    expect(roleOf(building({ extracts: { credits: 100 } }))).toBe("economy");
    expect(roleOf(building({ storage: { credits: 500 } }))).toBe("storage");
    expect(roleOf(building({}))).toBe("special");
  });

  it("says what an extractor makes on this Planet, and why", () => {
    const mine = building({ extracts: { materials: 60 } });
    expect(lines(mine, [["materials", "rich"]])).toEqual([
      "+90 Materials / Payday here (60 × rich deposit (×1.5))",
    ]);
    expect(lines(mine)).toEqual([
      "+0 Materials / Payday here (No Materials deposit on this Planet)",
    ]);
  });

  it("puts research per Payday, like the header", () => {
    expect(lines(building({ research: { industry: 2 } }))).toEqual([
      "+180 Industry Research / Payday (2 a second, wherever it's built)",
    ]);
  });

  it("names the Techs a building is needed for", () => {
    expect(lines(building({ id: "dig" }))).toEqual([
      "Needed to research Relics",
    ]);
  });
});
