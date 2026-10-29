import { describe, expect, it } from "vitest";
import { moneyOf, presets, quote } from "./exchange";

const rates = [
  { give: "m", giveAmount: 2, get: "c", getAmount: 1 },
  { give: "a", giveAmount: 1, get: "c", getAmount: 2 },
  { give: "c", giveAmount: 3, get: "m", getAmount: 1 },
  { give: "c", giveAmount: 6, get: "a", getAmount: 1 },
];
const have = new Map([
  ["c", 100],
  ["m", 41],
]);

describe("the Exchange", () => {
  it("finds the Resource on one side of every rate", () => {
    expect(moneyOf(rates)).toBe("c");
    expect(moneyOf([])).toBeNull();
  });

  it("counts a sale in what's sold and a purchase in what's bought", () => {
    expect(quote(rates, "c", "sell", "m", 40, have)).toMatchObject({
      give: 40,
      get: 20,
      step: 2,
      affordable: true,
    });
    expect(quote(rates, "c", "buy", "a", 10, have)).toMatchObject({
      give: 60,
      get: 10,
      step: 1,
      affordable: true,
    });
  });

  it("flags amounts over what you have, and pairs with no rate", () => {
    expect(quote(rates, "c", "buy", "a", 17, have)?.affordable).toBe(false);
    expect(quote(rates, "c", "sell", "x", 2, have)).toBeNull();
  });

  it("offers round amounts in the step, up to a third of the cap", () => {
    expect(presets(1, 1500)).toEqual([25, 50, 100, 250, 500]);
    expect(presets(2, 1500)).toEqual([10, 50, 100, 250, 500]);
    expect(presets(1, 500)).toEqual([5, 10, 25, 50, 100]);
    expect(presets(7, 500)).toEqual([7]);
  });
});
