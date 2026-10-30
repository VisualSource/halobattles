import type { ExchangeRate } from "../gen/content";

/** The Resource on one side of every Exchange rate (Credits), if there is one. */
export function moneyOf(rates: ExchangeRate[]): string | null {
  const first = rates[0];
  if (!first) return null;
  return (
    [first.give, first.get].find((r) =>
      rates.every((x) => x.give === r || x.get === r),
    ) ?? null
  );
}

/**
 * A trade of qty of other, sold for money or bought with it, at its rate:
 * what's given and got, and the step qty goes in. Null when that trade has
 * no rate.
 */
export function quote(
  rates: ExchangeRate[],
  money: string,
  mode: "sell" | "buy",
  other: string,
  qty: number,
  have: Map<string, number>,
) {
  const rate = rates.find((r) =>
    mode === "sell"
      ? r.give === other && r.get === money
      : r.give === money && r.get === other,
  );
  if (!rate) return null;
  const step = mode === "sell" ? rate.giveAmount : rate.getAmount;
  const batches = Math.floor(qty / step);
  const has = have.get(rate.give) ?? 0;
  return {
    rate,
    step,
    give: batches * rate.giveAmount,
    get: batches * rate.getAmount,
    affordable: batches * rate.giveAmount <= has,
  };
}

const LADDER = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * The Exchange's one-click amounts: up to five round numbers in step, the
 * largest at most a third of the Resource's cap.
 */
export function presets(step: number, cap = Number.POSITIVE_INFINITY) {
  const fit = LADDER.filter((a) => a % step === 0 && a <= cap / 3).slice(-5);
  return fit.length > 0 ? fit : [step];
}
