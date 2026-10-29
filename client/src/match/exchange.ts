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
 * what's given and got, the step qty goes in, and the most qty that have
 * pays for. Null when that trade has no rate.
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
    max: Math.floor(Math.max(0, has) / rate.giveAmount) * step,
    inSteps: qty > 0 && qty % step === 0,
    affordable: batches * rate.giveAmount <= has,
  };
}
