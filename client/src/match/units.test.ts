import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Unit } from "../gen/content";
import { canRaid, matchups, moves, roleTags, weaponWords } from "./units";

const content = {
  unitClasses: new Map([
    ["infantry", { name: "Infantry" }],
    ["vehicle", { name: "Vehicle" }],
    ["aircraft", { name: "Aircraft" }],
  ]),
  rules: {
    battle: {
      classDefaults: {
        vehicle: { speed: 2.5, range: 7, fireInterval: 2, sight: 9 },
      },
    },
  },
} as unknown as ContentLookups;

const tank = {
  combat: {
    unitClass: "vehicle",
    range: 8,
    tiers: { vehicle: "advantage", aircraft: "none" },
  },
} as unknown as Unit;

describe("Units", () => {
  it("raids only with raiders, within the cap", () => {
    const c = {
      units: new Map([
        ["odst", { roles: ["infiltration"], commandPoints: 2 }],
        ["marine", { commandPoints: 1 }],
      ]),
      rules: { battle: { raidCap: 10, raidRoles: ["infiltration"] } },
    } as unknown as ContentLookups;
    expect(canRaid(c, [{ unit: "odst", count: 5 }])).toBe(true);
    expect(canRaid(c, [{ unit: "odst", count: 6 }])).toBe(false); // 12 Command Points
    expect(
      canRaid(c, [
        { unit: "odst", count: 1 },
        { unit: "marine", count: 1 },
      ]),
    ).toBe(false);
  });

  it("gives each class its tier, counting one left out as normal", () => {
    expect(matchups(content, tank.combat)).toEqual([
      { name: "Infantry", tier: "normal" },
      { name: "Vehicle", tier: "advantage" },
      { name: "Aircraft", tier: "none" },
    ]);
  });

  it("says a weapon is strong above ×1 and weak below", () => {
    const c = {
      weaponTypes: new Map([
        ["plasma", { name: "Plasma", shield: 1.5, armor: 0.75, hp: 1 }],
      ]),
    } as unknown as ContentLookups;
    expect(weaponWords(c, "plasma")).toEqual({
      name: "Plasma",
      strong: ["shields"],
      weak: ["armour"],
    });
  });

  it("tags what a unit can do from its roles and carry", () => {
    const c = {
      rules: { battle: { raidRoles: ["infiltration"] } },
    } as unknown as ContentLookups;
    const odst = { roles: ["scout", "infiltration", "aa"] } as unknown as Unit;
    expect(roleTags(c, odst)).toEqual([
      "Scout",
      "Can Raid",
      "Anti-air: fires on Dropships",
    ]);
    expect(roleTags(c, { carry: 6 } as unknown as Unit)).toEqual([
      "Dropship: carries 6 Command Points",
    ]);
  });

  it("takes its own stats over its class's defaults", () => {
    expect(moves(content, tank)).toEqual({
      range: 8,
      speed: 2.5,
      sight: 9,
      fireInterval: 2,
    });
  });
});
