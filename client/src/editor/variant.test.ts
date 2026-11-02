import { describe, expect, it } from "vitest";
import { overrides, resetAt, resolved } from "./variant";

const warthog = {
  id: "warthog",
  name: "Warthog",
  faction: "unsc",
  cost: { credits: 150 },
  upkeep: { credits: 15 },
  roles: ["scout"],
  combat: { hp: 25, damage: "2d4", tiers: { infantry: "advantage" } },
};
const rocket = {
  id: "rocket",
  name: "Rocket",
  variantOf: "warthog",
  upkeep: null,
  combat: { damage: "1d8" },
};
const frost = { id: "frost", name: "Frost", variantOf: "rocket" };
const units = new Map<string, Record<string, unknown>>([
  ["warthog", warthog],
  ["rocket", rocket],
  ["frost", frost],
]);

describe("Unit Variants in the editor", () => {
  it("merges a variant over its parent, as the loader does", () => {
    expect(resolved(units, "frost")).toEqual({
      id: "frost",
      name: "Frost",
      variantOf: "rocket",
      faction: "unsc",
      cost: { credits: 150 },
      roles: ["scout"],
      combat: { hp: 25, damage: "1d8", tiers: { infantry: "advantage" } },
    });
  });

  it("stops at a missing parent or a cycle", () => {
    const loop = new Map([
      ["a", { id: "a", variantOf: "b" }],
      ["b", { id: "b", variantOf: "a" }],
    ]);
    expect(resolved(loop, "a")).toEqual({ id: "a", variantOf: "b" });
  });

  it("saves only what differs from the parent, null for what it drops", () => {
    const draft = {
      ...structuredClone(warthog),
      id: "rocket",
      name: "Rocket",
      variantOf: "warthog",
      upkeep: undefined,
      combat: { hp: 25, damage: "1d8", tiers: { infantry: "advantage" } },
    };
    expect(overrides(draft, warthog)).toEqual({
      id: "rocket",
      name: "Rocket",
      variantOf: "warthog",
      upkeep: null,
      combat: { damage: "1d8" },
    });
  });
});

describe("Resetting a variant's field", () => {
  it("puts back the parent's value, or drops one the parent hasn't", () => {
    const draft = { combat: { damage: "1d8", hp: 25 }, maxCount: 2 };
    expect(resetAt(draft, warthog, ["combat", "damage"])).toEqual({
      combat: { damage: "2d4", hp: 25 },
      maxCount: 2,
    });
    expect(resetAt(draft, warthog, ["maxCount"])).toEqual({
      combat: { damage: "1d8", hp: 25 },
    });
  });
});
