import { describe, expect, it } from "vitest";
import { assignGroup } from "./command";

describe("control groups", () => {
  it("sets a group to the squads, taking them out of any other", () => {
    const groups = new Map([
      [1, [1, 2, 3]],
      [2, [4]],
    ]);
    const next = assignGroup(groups, 2, [3, 5]);
    expect(next.get(1)).toEqual([1, 2]);
    expect(next.get(2)).toEqual([3, 5]); // replaced, not added to
    expect(groups.get(1)).toEqual([1, 2, 3]); // the old map untouched
  });
});
