import { describe, expect, it } from "vitest";
import { weight } from "./factions";

const kit = { buildings: [], stacks: [] };

describe("Faction weights", () => {
  it("sets a weight, and drops it and its emptied block when blanked", () => {
    const f = weight(
      { id: "f", name: "F", startingKit: kit },
      "attack",
      2,
      true,
    );
    expect(f.ai).toEqual({ bot: { attack: 2 } });
    expect(weight(f, "attack", undefined, true).ai).toBeUndefined();
  });

  it("keeps the Bot block when a Battle weight changes", () => {
    const f = weight(
      { id: "f", name: "F", startingKit: kit, ai: { bot: { attack: 2 } } },
      "cover",
      1.25,
      false,
    );
    expect(f.ai).toEqual({ cover: 1.25, bot: { attack: 2 } });
  });
});
