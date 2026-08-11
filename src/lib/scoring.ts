import type { Constituent, DailyBar, Factor, Quote } from "./types";

// A stock needs at least this many daily bars before we trust its 6-month
// return and SMA100 (recently-listed stocks with less history are excluded
// from screening).
export const MIN_BARS_REQUIRED = 130;

// The position is held roughly 2-3 months, so ATR (a 1-day range measure)
// gets scaled to a "typical move over the hold" using standard square-root-
// of-time volatility scaling. ~55 trading days ≈ 2.5 months. This estimates
// the WIDTH of the likely outcome band, not its center — it doesn't assume
// away drift (direction comes from the trend factor and Groq's read), it
// just doesn't encode drift itself. The real caveat: it implicitly assumes
// a roughly symmetric distribution. Daniel & Moskowitz (2016, JFE,
// "Momentum Crashes") find momentum strategy returns are negatively skewed
// — infrequent but sharp crash risk concentrated on the downside, especially
// after market declines/high-vol periods. Treat this figure as a typical
// range, not a symmetric bound.
export const HOLD_TRADING_DAYS = 55;

// Trend/momentum only, as of Aug 2026. Every other candidate factor tested
// so far has failed to survive backtesting on the live universe (Nasdaq-100
// mega-caps) and been removed:
// - Proximity (52-week-high distance) and Volume: tested via linear-blend
//   grid search against Nasdaq Next Gen 100 and mega-caps — didn't survive
//   outlier-robustness checks.
// - Low-Vol (Ang/Hodrick/Xing/Zhang 2006) and Stability/MAX-effect
//   (Bali/Cakici/Whitelaw 2011): tested twice more — as a linear blend
//   (full 66-combo grid, best combo was pure trend) AND as a gated
//   secondary filter (trend picks a shortlist, low-vol/stability re-rank
//   within it — 0/9 configs beat trend-only on both train and test, most
//   meaningfully worse). Both target exactly the volatile, spike-prone
//   names (TSLA, MSTR, NVDA, ...) that drive trend's returns on this
//   universe, so they screen out what's working rather than refining it.
// See data/backtest-results.*.json and chat history for the full
// investigation. More factors may be tried later, but only ones that clear
// the same bar: positive AND stable (median, not just mean) on a held-out
// test period, not just in-sample.
//
// Formation window matches the horizon classic momentum studies actually
// tested (Jegadeesh & Titman; Moskowitz, Ooi & Pedersen 2012: 6-12mo
// formation), not a short-term wiggle: price above its 50-day average,
// 50-day average above the 100-day, positive 6-month drift.

export type StockMetrics = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  bars: DailyBar[];
};

export type ScoredStock = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  factors: Factor[];
  composite: number;
  raw: {
    sma20: number | null;
    sma50: number | null;
    sma100: number | null;
    atrPct: number | null;
    typicalMoveOverHoldPct: number | null;
    return1m: number | null;
    return6m: number | null;
  };
};

function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/** Percentile-ranks values 0-100 (higher raw value -> higher percentile). Missing values get a neutral 50. */
function percentileRank(values: (number | null)[]): number[] {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v));

  const sorted = [...present].sort((a, b) => a.v - b.v);
  const n = sorted.length;
  const percentileByIndex = new Map<number, number>();
  sorted.forEach((item, rank) => {
    percentileByIndex.set(item.i, n <= 1 ? 50 : Math.round((rank / (n - 1)) * 100));
  });

  return values.map((_, i) => percentileByIndex.get(i) ?? 50);
}

function barsSlice(bars: DailyBar[], period: number, offsetFromEnd = 0): DailyBar[] | null {
  const end = bars.length - offsetFromEnd;
  const start = end - period;
  if (start < 0) return null;
  return bars.slice(start, end);
}

function sma(bars: DailyBar[], period: number): number | null {
  const slice = barsSlice(bars, period);
  if (!slice) return null;
  return average(slice.map((b) => b.close));
}

function returnPct(bars: DailyBar[], barsAgo: number): number | null {
  const idx = bars.length - 1 - barsAgo;
  if (idx < 0 || bars.length === 0) return null;
  const past = bars[idx].close;
  const latest = bars[bars.length - 1].close;
  if (!past) return null;
  return ((latest - past) / past) * 100;
}

/** Simple (non-Wilder-smoothed) average true range over `period` days. */
function atr(bars: DailyBar[], period: number): number | null {
  const slice = barsSlice(bars, period + 1); // need one extra bar for the first prevClose
  if (!slice) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i];
    const prevClose = slice[i - 1].close;
    trueRanges.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prevClose), Math.abs(cur.low - prevClose)));
  }
  return average(trueRanges);
}

export function scoreStocks(metrics: StockMetrics[]): ScoredStock[] {
  const computed = metrics.map((m) => {
    const { bars, price } = m;
    const sma20 = sma(bars, 20);
    const sma50 = sma(bars, 50);
    const sma100 = sma(bars, 100);
    const atr14 = atr(bars, 14);
    const return1m = returnPct(bars, 20);
    const return6m = returnPct(bars, 126);

    const atrPct = atr14 ? (atr14 / price) * 100 : null;
    const typicalMoveOverHoldPct = atrPct !== null ? atrPct * Math.sqrt(HOLD_TRADING_DAYS) : null;

    const trendRaw = average([
      sma50 !== null ? (price / sma50 - 1) * 100 : null,
      sma50 !== null && sma100 !== null ? (sma50 / sma100 - 1) * 100 : null,
      return6m,
    ]);

    return { m, sma20, sma50, sma100, atrPct, typicalMoveOverHoldPct, return1m, return6m, trendRaw };
  });

  const trendPct = percentileRank(computed.map((c) => c.trendRaw));

  return computed.map((c, i) => {
    const factors: Factor[] = [{ key: "trend", label: "Trend", score: trendPct[i] }];

    return {
      symbol: c.m.symbol,
      name: c.m.name,
      sector: c.m.sector,
      price: c.m.price,
      factors,
      composite: trendPct[i],
      raw: {
        sma20: c.sma20,
        sma50: c.sma50,
        sma100: c.sma100,
        atrPct: c.atrPct,
        typicalMoveOverHoldPct: c.typicalMoveOverHoldPct,
        return1m: c.return1m,
        return6m: c.return6m,
      },
    };
  });
}

export function buildMetrics(
  constituents: Constituent[],
  quotes: Map<string, Quote>,
  bars: Map<string, DailyBar[]>
): StockMetrics[] {
  return constituents
    .map((c): StockMetrics | null => {
      const quote = quotes.get(c.symbol);
      const symbolBars = bars.get(c.symbol);
      if (!quote || !symbolBars || symbolBars.length < MIN_BARS_REQUIRED) return null;
      return {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        price: quote.price,
        bars: symbolBars,
      };
    })
    .filter((m): m is StockMetrics => m !== null);
}

/**
 * Point-in-time metrics for backtesting: slices each symbol's bars to only
 * what would have been known `distanceFromEnd` trading days before its most
 * recent bar (inclusive), so every indicator computed downstream (SMA, ATR,
 * 6-month return, ...) is necessarily blind to anything after that date.
 *
 * Indexed from the END, not a shared absolute index from the start:
 * every fetched symbol's array ends on the same latest trading date, so
 * counting back from the end aligns dates correctly even when symbols have
 * different history lengths (e.g. a recent IPO has a shorter array covering
 * only the trailing portion of the same calendar). A symbol without enough
 * history that far back is naturally excluded from that cutoff, the same
 * way live scoring excludes recently-listed stocks.
 *
 * `price` is that day's close — the signal date — not the actual execution
 * price (the backtest engine executes at the next session's open to avoid
 * same-bar lookahead).
 */
export function buildMetricsAsOf(
  constituents: Constituent[],
  barsMap: Map<string, DailyBar[]>,
  distanceFromEnd: number
): StockMetrics[] {
  return constituents
    .map((c): StockMetrics | null => {
      const bars = barsMap.get(c.symbol);
      if (!bars) return null;
      const cutoffIndex = bars.length - 1 - distanceFromEnd;
      if (cutoffIndex < 0) return null;
      const upToCutoff = bars.slice(0, cutoffIndex + 1);
      if (upToCutoff.length < MIN_BARS_REQUIRED) return null;
      return {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
        price: upToCutoff[upToCutoff.length - 1].close,
        bars: upToCutoff,
      };
    })
    .filter((m): m is StockMetrics => m !== null);
}
