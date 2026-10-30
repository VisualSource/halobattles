import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import { threat } from "./threat";

const combat = (shield: number, armor: number, hp: number, damage: string) =>
  ({ shield, armor, hp, damage }) as never;
const content = {
  units: new Map([
    ["marine", { name: "Marine", combat: combat(0, 0, 12, "1d4") }],
    ["scorpion", { name: "Scorpion", combat: combat(0, 38, 38, "4d6+1") }],
  ]),
  buildings: new Map([
    ["turret", { name: "Turret", combat: combat(0, 25, 38, "2d4") }],
    ["barracks", { name: "Barracks" }],
  ]),
  rules: { threatBands: [300, 1000, 2500] },
} as unknown as Pick<ContentLookups, "units" | "buildings" | "rules">;

describe("threat", () => {
  it("scores toughness times average damage, and nothing for unarmed buildings", () => {
    const t = threat(content, {
      stacks: [[{ unit: "marine", count: 6, cell: 0 }], [], []],
      buildings: ["barracks", ""],
    });
    expect(t).toEqual({
      score: 180,
      level: 0,
      top: { name: "Marine", count: 6, score: 180 },
    });
  });

  it("puts the score in the Ruleset's bands and names what scores most", () => {
    const t = threat(content, {
      stacks: [
        [{ unit: "marine", count: 15, cell: 0 }],
        [{ unit: "scorpion", count: 2, cell: 0 }],
        [{ unit: "marine", count: 5, cell: 0 }],
      ],
      buildings: ["turret"],
    });
    expect(t.score).toBe(20 * 30 + 2 * 1140 + 315);
    expect(t.level).toBe(3);
    expect(t.top?.name).toBe("Scorpion");
    expect(
      threat(content, { stacks: [[], [], []], buildings: ["turret"] }).level,
    ).toBe(1);
  });
});
