import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMetrics,
  buildMetricsAsOf,
  computeRawMetrics,
  finalizeScoring,
  HOLD_TRADING_DAYS,
  MIN_BARS_REQUIRED,
  type RawStockMetrics,
} from "./scoring";
import type { Constituent, DailyBar, Quote } from "./types";

function makeBars(count: number, closeAt: (i: number) => number = () => 100): DailyBar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = closeAt(i);
    return { date: `d${i}`, open: close, close, high: close + 1, low: close - 1, volume: 1000 };
  });
}

const info = { name: "Test Co", sector: "Tech" };

function raw(symbol: string, trendRaw: number | null): RawStockMetrics {
  return {
    symbol,
    ...info,
    price: 100,
    sma20: null,
    sma50: null,
    sma100: null,
    atrPct: null,
    typicalMoveOverHoldPct: null,
    return1m: null,
    return6m: null,
    trendRaw,
  };
}

describe("computeRawMetrics", () => {
  it("computes flat-price metrics exactly", () => {
    const m = computeRawMetrics({ symbol: "FLAT", ...info, price: 100, bars: makeBars(MIN_BARS_REQUIRED) });
    assert.equal(m.sma20, 100);
    assert.equal(m.sma50, 100);
    assert.equal(m.sma100, 100);
    assert.equal(m.return1m, 0);
    assert.equal(m.return6m, 0);
    assert.equal(m.trendRaw, 0);
    // every true range is high - low = 2, so ATR is 2 -> 2% of a 100 price
    assert.equal(m.atrPct, 2);
    assert.ok(Math.abs(m.typicalMoveOverHoldPct! - 2 * Math.sqrt(HOLD_TRADING_DAYS)) < 1e-9);
  });

  it("gives a positive trend score to a steadily rising stock", () => {
    const bars = makeBars(MIN_BARS_REQUIRED, (i) => 100 + i);
    const price = bars[bars.length - 1].close;
    const m = computeRawMetrics({ symbol: "UP", ...info, price, bars });
    assert.ok(m.trendRaw! > 0);
    assert.ok(m.sma50! > m.sma100!);
  });

  it("returns null for indicators that lack enough history", () => {
    const m = computeRawMetrics({ symbol: "NEW", ...info, price: 100, bars: makeBars(50) });
    assert.equal(m.sma50, 100);
    assert.equal(m.sma100, null);
    assert.equal(m.return6m, null);
    assert.equal(m.trendRaw, 0); // averages only the components that exist
  });

  it("has no trend score when there is no history at all", () => {
    const m = computeRawMetrics({ symbol: "NONE", ...info, price: 100, bars: [] });
    assert.equal(m.trendRaw, null);
    assert.equal(m.atrPct, null);
  });
});

describe("finalizeScoring", () => {
  it("percentile-ranks trend across the field and neutral-scores missing values", () => {
    const scored = finalizeScoring([raw("A", 10), raw("B", -5), raw("C", null), raw("D", 30)]);
    assert.deepEqual(
      scored.map((s) => s.composite),
      [50, 0, 50, 100]
    );
  });

  it("keeps composite equal to the trend factor score", () => {
    for (const s of finalizeScoring([raw("A", 1), raw("B", 2)])) {
      assert.equal(s.factors.length, 1);
      assert.equal(s.factors[0].key, "trend");
      assert.equal(s.composite, s.factors[0].score);
    }
  });

  it("scores a lone stock 50", () => {
    assert.equal(finalizeScoring([raw("A", 12)])[0].composite, 50);
  });
});

describe("buildMetrics", () => {
  const constituents: Constituent[] = ["AAA", "BBB", "CCC"].map((symbol) => ({ symbol, ...info }));
  const quote = (price: number) => ({ price }) as Quote;

  it("drops symbols with no quote or too little history", () => {
    const quotes = new Map([["AAA", quote(101)], ["BBB", quote(102)]]);
    const bars = new Map([["AAA", makeBars(MIN_BARS_REQUIRED)], ["BBB", makeBars(MIN_BARS_REQUIRED - 1)], ["CCC", makeBars(MIN_BARS_REQUIRED)]]);
    const result = buildMetrics(constituents, quotes, bars);
    assert.deepEqual(result.map((m) => m.symbol), ["AAA"]);
    assert.equal(result[0].price, 101);
  });
});

describe("buildMetricsAsOf", () => {
  const constituents: Constituent[] = [{ symbol: "AAA", ...info }, { symbol: "NEW", ...info }];
  const barsMap = new Map([
    ["AAA", makeBars(200, (i) => 100 + i)],
    ["NEW", makeBars(140)],
  ]);

  it("slices bars to what was known distanceFromEnd days before the last bar", () => {
    const [aaa] = buildMetricsAsOf(constituents, barsMap, 50);
    assert.equal(aaa.bars.length, 150);
    assert.equal(aaa.price, 100 + 149); // close of the cutoff bar, not the latest
  });

  it("excludes symbols whose history is too short that far back", () => {
    // at distance 20, NEW has 120 bars (< MIN_BARS_REQUIRED); AAA still has 180
    assert.deepEqual(buildMetricsAsOf(constituents, barsMap, 20).map((m) => m.symbol), ["AAA"]);
  });

  it("excludes everything when the cutoff is before the first bar", () => {
    assert.deepEqual(buildMetricsAsOf(constituents, barsMap, 500), []);
  });
});
