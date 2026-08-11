/**
 * NQ=F price/momentum snapshot — reuses the same Yahoo Finance source as
 * the rest of the app (no new provider). Purely descriptive context for the
 * news-sentiment read; not a re-introduction of the rejected rule-based
 * macro-bias score (see RESEARCH.md) — nothing here is weighted into a
 * standalone directional signal.
 */
import { getHistoricalBars } from "./yahoo";

export type PriceContext = {
  symbol: string;
  lastClose: number;
  change1d: number;
  change5d: number;
  sma20: number | null;
  sma50: number | null;
};

const SYMBOL = "NQ=F";

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function fetchPriceContext(): Promise<PriceContext | null> {
  const map = await getHistoricalBars([SYMBOL], 60);
  const bars = map.get(SYMBOL) ?? [];
  if (bars.length < 2) return null;

  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const prev1 = closes[closes.length - 2];
  const prev5 = closes[closes.length - 6] ?? closes[0];

  return {
    symbol: SYMBOL,
    lastClose: last,
    change1d: ((last - prev1) / prev1) * 100,
    change5d: ((last - prev5) / prev5) * 100,
    sma20: closes.length >= 20 ? average(closes.slice(-20)) : null,
    sma50: closes.length >= 50 ? average(closes.slice(-50)) : null,
  };
}
