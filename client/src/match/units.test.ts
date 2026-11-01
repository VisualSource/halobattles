import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import type { Unit } from "../gen/content";
import { matchups, moves } from "./units";

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
