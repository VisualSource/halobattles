import { describe, expect, it } from "vitest";
import { groundSees, type LineOfSight } from "./battlefield";

const los: LineOfSight = {
  heightReach: 1,
  heightLevels: 2,
  sightObscured: 2,
  obscures: (t) => ({ forest: 1, peak: 3 })[t] ?? 0,
};

// A 1 × 12 strip, the eye at the top, as the server's tests set it up.
const strip = (terrain: string[] = [], heights: number[] = []) => ({
  width: 1,
  height: 12,
  terrains: ["open", "forest", "peak"],
  terrain: Array.from({ length: 12 }, (_, y) =>
    Math.max(0, ["open", "forest", "peak"].indexOf(terrain[y] ?? "open")),
  ),
  heights: Array.from({ length: 12 }, (_, y) => heights[y] ?? 0),
});

describe("the fog's line of sight, as the server's", () => {
  it("sees further off high ground, up to two levels", () => {
    expect(groundSees(strip(), los, 0, 0, 5, 0, 5)).toBe(true);
    expect(groundSees(strip(), los, 0, 0, 5, 0, 6)).toBe(false);
    expect(groundSees(strip([], [3]), los, 0, 0, 5, 0, 7)).toBe(true);
    expect(groundSees(strip([], [3]), los, 0, 0, 5, 0, 8)).toBe(false);
  });

  it("is blocked by a ridge, a peak or more than 2 forest cells", () => {
    const f = ["open", "forest", "forest"];
    expect(groundSees(strip(f), los, 0, 0, 8, 0, 4)).toBe(true);
    expect(groundSees(strip([...f, "forest"]), los, 0, 0, 8, 0, 4)).toBe(false);
    expect(groundSees(strip(["open", "peak"]), los, 0, 0, 8, 0, 4)).toBe(false);
    expect(groundSees(strip([], [0, 0, 1]), los, 0, 0, 8, 0, 4)).toBe(false);
    expect(groundSees(strip([], [1, 0, 1]), los, 0, 0, 8, 0, 4)).toBe(true);
  });

  it("walks the same line both ways", () => {
    // A 3 × 3 patch, a ridge at (2, 1) beside the diagonal.
    const f = {
      width: 3,
      height: 3,
      terrains: ["open"],
      terrain: Array(9).fill(0),
      heights: [0, 0, 0, 0, 0, 1, 0, 0, 0],
    };
    expect(groundSees(f, los, 0, 0, 8, 2, 2)).toBe(
      groundSees(f, los, 2, 2, 8, 0, 0),
    );
  });
});
