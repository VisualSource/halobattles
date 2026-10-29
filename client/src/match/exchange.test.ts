import { describe, expect, it } from "vitest";
import { moneyOf, quote } from "./exchange";

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
      max: 40,
      inSteps: true,
      affordable: true,
    });
    expect(quote(rates, "c", "buy", "a", 10, have)).toMatchObject({
      give: 60,
      get: 10,
      step: 1,
      max: 16,
      affordable: true,
    });
  });

  it("flags amounts off the step or over what you have", () => {
    expect(quote(rates, "c", "sell", "m", 3, have)?.inSteps).toBe(false);
    expect(quote(rates, "c", "buy", "a", 17, have)?.affordable).toBe(false);
    expect(quote(rates, "c", "sell", "x", 2, have)).toBeNull();
  });
});
