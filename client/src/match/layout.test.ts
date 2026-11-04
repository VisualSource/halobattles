import { describe, expect, it } from "vitest";
import { moveBuilding } from "./layout";

describe("moveBuilding", () => {
  it("swaps with a building already on the site", () => {
    expect(moveBuilding([0, 1, null, 3], 0, 1)).toEqual([1, 0, null, 3]);
  });
  it("moves onto a free site, pinning the rest", () => {
    expect(moveBuilding([0, 1, null], 1, 6)).toEqual([0, 6, null]);
  });
  it("does nothing dropped back where it was, or off every site", () => {
    expect(moveBuilding([0, 1], 0, 0)).toBeNull();
    expect(moveBuilding([0, 1], 0, -1)).toBeNull();
  });
});
