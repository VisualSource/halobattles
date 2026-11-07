import { describe, expect, it } from "vitest";
import { rosterMax } from "../match/units";
import type { Content } from "./content";
import { lookups, unitWrites } from "./units";

const marine = { id: "marine", name: "Marine", faction: "unsc" };
const data = {
  units: [{ file: "marine", value: marine }],
  buildings: [
    { file: "barracks", value: { id: "barracks", trains: ["marine", "odst"] } },
  ],
} as unknown as Content;

describe("Saving a unit", () => {
  it("takes one that isn't trainable off every building, ticked or not", () => {
    const ws = unitWrites(
      data,
      { ...marine, trainable: false, _trainedAt: ["barracks"] } as never,
      "marine",
    );
    expect(ws[1]).toEqual({
      kind: "buildings",
      file: "barracks",
      path: ["trains"],
      value: ["odst"],
    });
  });

  it("writes a Unit Variant's differences only", () => {
    const ws = unitWrites(
      data,
      { ...marine, id: "hev", name: "HEV", variantOf: "marine" } as never,
      "hev",
    );
    expect(ws).toEqual([
      {
        kind: "units",
        file: "hev",
        value: { id: "hev", name: "HEV", variantOf: "marine" },
      },
    ]);
  });
});

describe("The unit card's content", () => {
  it("gives a variant with no combat of its own its parent's", () => {
    const combat = { unitClass: "vehicle", shield: 1, armor: 2, hp: 3 };
    const wraith = { id: "wraith", combat, damage: "1d4" };
    const muz = { id: "muz", variantOf: "wraith" };
    const content = lookups(
      {
        units: [
          { file: "wraith", value: wraith },
          { file: "muz", value: muz },
        ],
        unitClasses: [],
        weaponTypes: [],
        resources: [],
        rulesets: [],
      } as unknown as Content,
      wraith as never,
    );
    expect(content.units.get("muz")?.combat).toEqual(combat);
    expect(() => rosterMax(content)).not.toThrow();
  });
});
