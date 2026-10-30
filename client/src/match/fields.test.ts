import { describe, expect, it } from "vitest";
import type { ContentLookups } from "../content";
import { fieldsOf } from "./fields";

describe("Research fields", () => {
  it("lists them by their order, then by id", () => {
    const content = {
      rules: {
        tech: {
          fields: {
            "base:logistics": { name: "Logistics", colour: "#000", order: 3 },
            "base:military": { name: "Military", colour: "#000", order: 1 },
            "mod:psionics": { name: "Psionics", colour: "#000" },
            "base:industry": { name: "Industry", colour: "#000", order: 1 },
          },
        },
      },
    } as unknown as Pick<ContentLookups, "rules">;
    expect(fieldsOf(content).map((f) => f.id)).toEqual([
      "mod:psionics",
      "base:industry",
      "base:military",
      "base:logistics",
    ]);
  });
});
