import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Unit } from "../gen/content";
import { canRaid, matchups, moves } from "./units";

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
    expect(matchups(content, tank)).toEqual([
      { name: "Infantry", tier: "normal" },
      { name: "Vehicle", tier: "advantage" },
      { name: "Aircraft", tier: "none" },
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
