import { describe, expect, it } from "vitest";
import { freeCell, moveSlot } from "./stacks";

const slot = (unit: string, count: number, cell: number) => ({
  unit,
  count,
  cell,
});
const at = (stack: number, cell: number) => ({ stack, cell });

describe("moveSlot", () => {
  const stacks = () => [
    [slot("marine", 10, 0), slot("hog", 2, 1), slot("marine", 3, 2)],
    [slot("odst", 1, 3)],
    [],
  ];

  it("moves a slot to an empty cell", () => {
    expect(moveSlot(stacks(), at(0, 1), at(2, 7))).toEqual([
      [slot("marine", 10, 0), slot("marine", 3, 2)],
      [slot("odst", 1, 3)],
      [slot("hog", 2, 7)],
    ]);
  });

  it("swaps with another unit's slot, in the same Stack or another", () => {
    expect(moveSlot(stacks(), at(0, 0), at(0, 1))[0]).toEqual([
      slot("hog", 2, 0),
      slot("marine", 10, 1),
      slot("marine", 3, 2),
    ]);
    const out = moveSlot(stacks(), at(0, 1), at(1, 3));
    expect(out[0]?.[1]).toEqual(slot("odst", 1, 1));
    expect(out[1]).toEqual([slot("hog", 2, 3)]);
  });

  it("merges into a slot of the same unit, up to the limit", () => {
    expect(moveSlot(stacks(), at(0, 2), at(0, 0))[0]).toEqual([
      slot("marine", 13, 0),
      slot("hog", 2, 1),
    ]);
    expect(moveSlot(stacks(), at(0, 2), at(0, 0), 12)[0]).toEqual([
      slot("marine", 12, 0),
      slot("hog", 2, 1),
      slot("marine", 1, 2),
    ]);
  });

  it("leaves the grid alone for a move the server would refuse", () => {
    const s = stacks();
    expect(moveSlot(s, at(0, 0), at(2, 4), 5)).toBe(s);
  });
});

describe("freeCell", () => {
  it("finds the first empty cell, or -1", () => {
    expect(freeCell([slot("a", 1, 0), slot("b", 1, 2)], 3)).toBe(1);
    expect(freeCell([slot("a", 1, 0)], 1)).toBe(-1);
  });
});
