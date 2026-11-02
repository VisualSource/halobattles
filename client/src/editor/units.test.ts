import { describe, expect, it } from "vitest";
import type { Content } from "./content";
import { unitWrites } from "./units";

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
