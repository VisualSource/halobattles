import { describe, expect, it } from "vitest";
import { kindOf } from "./duels";

const cell = (rate: number, want?: "win" | "even") => ({
  a: "base:warthog",
  b: "base:marine",
  na: 4,
  nb: 12,
  rate,
  want,
});

describe("a duel matrix cell", () => {
  it("meets a win at 80% or more, and an even at 40–60%", () => {
    expect(kindOf(cell(0.8, "win"))).toBe("win");
    expect(kindOf(cell(0.79, "win"))).toBe("missed");
    expect(kindOf(cell(0.4, "even"))).toBe("even");
    expect(kindOf(cell(0.61, "even"))).toBe("missed");
    expect(kindOf(cell(0.1))).toBe("plain");
  });
});
