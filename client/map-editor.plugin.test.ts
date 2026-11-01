/// <reference types="node" />

import { readFileSync } from "node:fs";
import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { mapText } from "./map-editor.plugin";

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
