/// <reference types="node" />

import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { applyWrite, mapText } from "./map-editor.plugin";

const quadrant = readFileSync(
  new URL("../mods/base/data/maps/quadrant.jsonc", import.meta.url),
  "utf8",
);

describe("Saving a map", () => {
  it("rewrites only what changed, so comments elsewhere survive", () => {
    const map = parse(quadrant);
    map.planets[0].position = { x: 5, y: -5 };
    const out = mapText(quadrant, map);
    expect(parse(out)).toEqual(map);
    // The header and the lanes' and garrisons' comments are untouched.
    expect(out).toContain("// The first map: 13 Planets");
    expect(out).toContain(
      "// Capital to the near Planet on each of its two edges.",
    );
    expect(out).toContain("// A mid-game objective.");
    expect(out).toContain(
      '{ "id": "reach", "name": "Reach", "type": "capital", "position": { "x": 5, "y": -5 } }',
    );
  });

  it("is unchanged when nothing changed", () => {
    expect(mapText(quadrant, parse(quadrant))).toBe(quadrant);
  });

  it("drops a key the map no longer has, and writes a new file", () => {
    const { garrisons: _, ...map } = parse(quadrant);
    expect(parse(mapText(quadrant, map))).toEqual(map);
    const fresh = mapText(undefined, {
      id: "x",
      name: "X",
      planets: [],
      lanes: [],
      starts: [],
      minPlayers: 2,
      win: { planetShare: 0.51, holdSeconds: 120 },
    });
    expect(parse(fresh)).toMatchObject({
      $schema: "../../../../schema/content/map.schema.json",
      id: "x",
    });
  });
});

describe("Saving content", () => {
  const warthog = `{
  // A scout.
  "id": "warthog",
  "trains": ["marine"]
}
`;

  it("patches one value in place, comments kept", () => {
    const text = applyWrite(warthog, {
      kind: "buildings",
      file: "barracks",
      path: ["trains"],
      value: ["marine", "odst"],
    });
    expect(text).toContain("// A scout.");
    expect(text).toContain('"odst"');
  });

  it("gives a Unit Variant the variant schema, and back", () => {
    const unit = `{\n  "$schema": "../../../../schema/content/unit.schema.json",\n  "id": "hog"\n}\n`;
    const variant = { id: "hog", name: "Hog", variantOf: "warthog" };
    const text = applyWrite(unit, {
      kind: "units",
      file: "hog",
      value: variant,
    });
    expect(text).toContain("unit-variant.schema.json");
    expect(
      applyWrite(undefined, { kind: "units", file: "hog", value: variant }),
    ).toContain("unit-variant.schema.json");
    expect(
      applyWrite(text, { kind: "units", file: "hog", value: { id: "hog" } }),
    ).toContain("/unit.schema.json");
  });

  it("removes a value patched to null", () => {
    const text = applyWrite(
      '{\n  "movement": { "vehicle": 1, "infantry": 1 }\n}\n',
      {
        kind: "terrains",
        file: "open",
        path: ["movement", "vehicle"],
        value: null,
      },
    );
    expect(text).not.toContain("vehicle");
    expect(text).toContain("infantry");
  });

  it("writes a new entity with its kind's schema", () => {
    const text = applyWrite(undefined, {
      kind: "weaponTypes",
      file: "laser",
      value: { id: "laser", name: "Laser" },
    });
    expect(text).toContain("schema/content/weapon-type.schema.json");
  });

  it("refuses a kind, file or path it doesn't know", () => {
    const bad = (w: object) => () => applyWrite(warthog, w as never);
    expect(bad({ kind: "maps", file: "x", value: {} })).toThrow();
    expect(bad({ kind: "units", file: "../x", value: {} })).toThrow();
    expect(bad({ kind: "units", file: "x", path: [""], value: 1 })).toThrow();
  });
});
