import { describe, expect, it } from "vitest";
import { hash, planetTones, styleFor } from "./planet-model";
import { random } from "./ring";

const tones = (id: string) => planetTones(random(hash(id) || 1));

describe("planetTones", () => {
  it("gives a Planet the same tones every time", () => {
    expect(tones("jericho")).toEqual(tones("jericho"));
    expect(tones("jericho")).toHaveLength(5);
    for (const t of tones("jericho")) expect(t).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("gives a map's Planets different colours", () => {
    const ids = [
      "reach",
      "jericho",
      "tribute",
      "harvest",
      "draetheus",
      "paris",
      "arcadia",
      "meridian",
      "sigma",
      "sanghelios",
      "requiem",
      "trevelyan",
    ];
    // Each Planet's first band tone: no two alike across the map.
    expect(new Set(ids.map((id) => tones(id)[0])).size).toBe(ids.length);
  });
});

describe("styleFor", () => {
  const ids = [
    "reach",
    "jericho",
    "tribute",
    "harvest",
    "draetheus",
    "paris",
    "arcadia",
    "meridian",
    "sigma",
    "sanghelios",
    "requiem",
    "trevelyan",
  ];
  const style = (id: string) => styleFor(random(hash(id) || 1)).name;

  it("gives a Planet the same style every time", () => {
    for (const id of ids) expect(style(id)).toBe(style(id));
  });

  it("mixes styles across a map, not only gas giants", () => {
    expect(new Set(ids.map(style)).size).toBeGreaterThanOrEqual(4);
  });
});
