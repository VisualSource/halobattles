import { describe, expect, it } from "vitest";
import { classWrites } from "./classes";
import type { Content } from "./content";

const vehicle = { speed: 2.5, range: 7, fireInterval: 2, sight: 9 };
const data = {
  rulesets: [
    { file: "rules", value: { battle: { classDefaults: { vehicle } } } },
  ],
  terrains: [
    { file: "open", value: { movement: { vehicle: 1 } } },
    { file: "forest", value: { movement: {} } },
  ],
} as unknown as Content;

const paths = (ws: ReturnType<typeof classWrites>) =>
  ws.map(
    (w) =>
      `${w.kind}/${w.file}${"path" in w ? `:${w.path.join(".")}=${JSON.stringify(w.value)}` : ""}`,
  );

describe("Saving a Unit Class", () => {
  it("writes only its own file when nothing else changed", () => {
    expect(
      paths(classWrites(data, { id: "vehicle", name: "Vehicle" }, "vehicle")),
    ).toEqual(["unitClasses/vehicle"]);
  });

  it("patches the Ruleset and each Terrain it changed, leaving the class's own keys out of its file", () => {
    const ws = classWrites(
      data,
      {
        id: "vehicle",
        name: "Vehicle",
        _stats: { ...vehicle, speed: 3 },
        _movement: { open: undefined, forest: 2 },
      },
      "vehicle",
    );
    expect(paths(ws)).toEqual([
      "unitClasses/vehicle",
      `rulesets/rules:battle.classDefaults.vehicle=${JSON.stringify({ ...vehicle, speed: 3 })}`,
      "terrains/open:movement.vehicle=null",
      "terrains/forest:movement.vehicle=2",
    ]);
    expect(ws[0]).toEqual({
      kind: "unitClasses",
      file: "vehicle",
      value: { id: "vehicle", name: "Vehicle" },
    });
  });

  it("gives a new class battle defaults, which the Ruleset needs for every class", () => {
    const ws = classWrites(data, { id: "mech", name: "Mech" }, "mech");
    expect(paths(ws)[1]).toMatch(
      /^rulesets\/rules:battle\.classDefaults\.mech=/,
    );
  });
});
