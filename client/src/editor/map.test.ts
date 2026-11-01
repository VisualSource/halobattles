import { describe, expect, it } from "vitest";
import {
  type EditorMap,
  garrisonOf,
  newMap,
  place,
  removePlanet,
  setGarrison,
  setStart,
  toggleLane,
  updateLane,
  updatePlanet,
} from "./map";

const reach = { id: "reach", name: "Reach", tags: ["human-colony"], url: "" };
const harvest = { id: "harvest", name: "Harvest", tags: [], url: "" };
const ring = {
  id: "installation-04",
  name: "Installation 04",
  tags: ["halo-ring"],
  url: "",
};

const two = (): EditorMap =>
  place(place(newMap(), reach, { x: 0.4, y: 10.6 }), harvest, { x: 100, y: 0 });

describe("Map editor", () => {
  it("places a Planet once, rounded, and a Halo ring as a ring", () => {
    const m = place(two(), reach, { x: 5, y: 5 });
    expect(m.planets.map((p) => [p.id, p.position, p.type])).toEqual([
      ["reach", { x: 0, y: 11 }, "standard"],
      ["harvest", { x: 100, y: 0 }, "standard"],
    ]);
    expect(place(m, ring, { x: 0, y: 0 }).planets[2]?.model).toBe("ring");
    expect(m.planets[0]).not.toHaveProperty("model");
  });

  it("toggles a Lane either way round, never to itself", () => {
    const m = toggleLane(two(), "reach", "harvest", "fast");
    expect(m.lanes).toEqual([{ from: "reach", to: "harvest", type: "fast" }]);
    expect(toggleLane(m, "harvest", "reach", "fast").lanes).toEqual([]);
    expect(toggleLane(m, "reach", "reach", "fast")).toBe(m);
  });

  it("sets a Lane's overrides and clears them back to the default", () => {
    let m = toggleLane(two(), "reach", "harvest", "fast");
    m = updateLane(m, 0, { type: "slow", length: 40, time: 12 });
    expect(m.lanes[0]).toEqual({
      from: "reach",
      to: "harvest",
      type: "slow",
      length: 40,
      time: 12,
    });
    m = updateLane(m, 0, { length: undefined, time: undefined });
    expect(m.lanes[0]).toEqual({ from: "reach", to: "harvest", type: "slow" });
  });

  it("removes a Planet with its Lanes, start and garrison, keeping the rest", () => {
    let m = setStart(
      toggleLane(two(), "reach", "harvest", "fast"),
      "reach",
      true,
    );
    m = {
      ...m,
      garrisons: {
        reach: [[{ unit: "marine", count: 6 }]],
        harvest: [[{ unit: "grunt", count: 3 }]],
      },
    };
    const out = removePlanet(m, "reach");
    expect(out.planets.map((p) => p.id)).toEqual(["harvest"]);
    expect(out.lanes).toEqual([]);
    expect(out.starts).toEqual([]);
    expect(out.garrisons).toEqual({ harvest: [[{ unit: "grunt", count: 3 }]] });
  });

  it("keeps fields it doesn't edit, and starts are added once", () => {
    let m = two();
    m = updatePlanet(m, "reach", {
      overrides: { buildingSlots: 5 },
      battlefield: { width: 80 },
    });
    m = updatePlanet(m, "reach", {
      position: { x: 7.7, y: 1 },
      type: "capital",
    });
    expect(m.planets[0]).toEqual({
      id: "reach",
      name: "Reach",
      type: "capital",
      position: { x: 8, y: 1 },
      overrides: { buildingSlots: 5 },
      battlefield: { width: 80 },
    });
    expect(setStart(setStart(m, "reach", true), "reach", true).starts).toEqual([
      "reach",
    ]);
  });
});

describe("Garrison editing", () => {
  const marines = [{ unit: "marine", count: 6 }];
  const scorpion = [{ unit: "scorpion", count: 1 }];

  it("keeps Stack order, dropping only empty Stacks at the end", () => {
    const m = setGarrison(two(), "reach", [[], scorpion, []]);
    expect(m.garrisons).toEqual({ reach: [[], scorpion] });
    expect(garrisonOf(m, "reach")).toEqual([[], scorpion, []]);
  });

  it("removes an emptied garrison, and the garrisons key once none are left", () => {
    let m = setGarrison(two(), "reach", [marines, [], []]);
    m = setGarrison(m, "harvest", [scorpion]);
    m = setGarrison(m, "reach", [[], [], []]);
    expect(m.garrisons).toEqual({ harvest: [scorpion] });
    m = setGarrison(m, "harvest", []);
    expect(m).not.toHaveProperty("garrisons");
  });

  it("reads a Planet with no garrison as three empty Stacks", () => {
    expect(garrisonOf(two(), "reach")).toEqual([[], [], []]);
  });
});
