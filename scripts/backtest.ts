/**
 * Backtests the (single-factor, trend-only) quant composite against
 * historical data, split into a train/test period so results aren't just
 * eyeballed on the whole window at once.
 *
 * Run: npm run backtest -- [--universe=megacap|nextgen100] [--lookback=N] [--refresh]
 *   --universe   megacap (default, matches the live app — Nasdaq-100
 *                mega-caps) or nextgen100 (the prior universe, kept for
 *                comparison — see scripts/nasdaq-next-gen-100.ts).
 *   --lookback   trading days of history to pull (default 630, ~2.5yr).
 *   --refresh    re-fetch bars instead of using the local cache.
 *
 * Data comes from src/lib/yahoo.ts — the same Yahoo Finance client the live
 * app now uses (no API key, no daily quota, so a long backtest fetch never
 * competes with the live app for a rate limit).
 *
 * Deliberately does NOT simulate the Groq synthesis step — this tests the
 * deterministic quant signal only. See the printed CAVEATS block for the
 * limitations that matter most (survivorship bias, small sample size).
 *
 * History: this has grid-searched weights across proximity/volume, then
 * low-vol/stability (both as a linear blend and as a gated secondary
 * filter). None of them survived — trend alone has won every round. See
 * scoring.ts's header comment and git history for the full investigation.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Constituent, DailyBar } from "../src/lib/types";
import { SCREENING_UNIVERSE } from "../src/lib/universe"; // live app's universe: Nasdaq-100 mega-caps
import { NASDAQ_NEXT_GEN_100 } from "./nasdaq-next-gen-100"; // backtest-only comparison universe
import { getHistoricalBars } from "../src/lib/yahoo";
import { buildMetricsAsOf, scoreStocks, HOLD_TRADING_DAYS, MIN_BARS_REQUIRED } from "../src/lib/scoring";

function argValue(flag: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=")[1] : fallback;
}

const UNIVERSE_NAME = argValue("universe", "megacap") === "nextgen100" ? "nextgen100" : "megacap";
const SCREENING_SET: Constituent[] = UNIVERSE_NAME === "nextgen100" ? NASDAQ_NEXT_GEN_100 : SCREENING_UNIVERSE;

const CACHE_PATH = path.join(process.cwd(), "data", `backtest-bars-cache.${UNIVERSE_NAME}.json`);
const RESULTS_PATH = path.join(process.cwd(), "data", `backtest-results.${UNIVERSE_NAME}.json`);
const LOOKBACK_TRADING_DAYS = Number(argValue("lookback", "630")); // ~2.5yr default: ~2yr of cycles + 6mo formation buffer
const COST_BPS_ROUND_TRIP = 15; // assumed spread + slippage estimate, both legs combined
const STARTING_CAPITAL = 10_000;
const TOP_N = 3;

type CycleResult = {
  distanceFromEnd: number;
  date: string;
  picks: Array<{ symbol: string; entryPrice: number; exitPrice: number; returnPct: number }>;
  portfolioReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
};

type AggregateStats = {
  n: number;
  meanReturnPct: number;
  medianReturnPct: number;
  stdevReturnPct: number;
  meanExcessPct: number;
  medianExcessPct: number;
  sharpeLike: number;
  netMeanReturnPct: number;
  winRate: number;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = average(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Drops the `n` highest and `n` lowest cycles by portfolio return — a standard outlier-robustness check. */
function trimExtremes(cycles: CycleResult[], n: number): CycleResult[] {
  if (n <= 0 || cycles.length <= 2 * n) return cycles;
  const sorted = [...cycles].sort((a, b) => a.portfolioReturnPct - b.portfolioReturnPct);
  return sorted.slice(n, sorted.length - n);
}

async function loadBars(refresh: boolean): Promise<Map<string, DailyBar[]>> {
  if (!refresh && existsSync(CACHE_PATH)) {
    console.log(`Loading cached bars from ${CACHE_PATH} (pass --refresh to re-fetch)`);
    const raw = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Record<string, DailyBar[]>;
    return new Map(Object.entries(raw));
  }

  console.log(`Fetching ~${LOOKBACK_TRADING_DAYS} trading days of history for ${SCREENING_SET.length} symbols from Yahoo Finance...`);
  const symbols = SCREENING_SET.map((c) => c.symbol);
  const barsMap = await getHistoricalBars(symbols, LOOKBACK_TRADING_DAYS);

  const covered = [...barsMap.values()].filter((b) => b.length >= MIN_BARS_REQUIRED).length;
  console.log(`Got usable history for ${covered}/${symbols.length} symbols.`);

  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(barsMap)));
  console.log(`Cached bars to ${CACHE_PATH}`);

  return barsMap;
}

function generateRebalancePoints(barsMap: Map<string, DailyBar[]>): number[] {
  let maxLength = 0;
  for (const bars of barsMap.values()) maxLength = Math.max(maxLength, bars.length);

  const points: number[] = [];
  // distanceFromEnd needs room for: a next-session entry bar, a full hold
  // after it, all before the array runs out at the recent end.
  let d = HOLD_TRADING_DAYS + 1;
  while (d + MIN_BARS_REQUIRED <= maxLength) {
    points.push(d);
    d += HOLD_TRADING_DAYS;
  }
  return points.sort((a, b) => b - a); // largest distance (oldest) first -> chronological order
}

function simulateCycle(barsMap: Map<string, DailyBar[]>, distanceFromEnd: number, topN: number = TOP_N): CycleResult | null {
  const metrics = buildMetricsAsOf(SCREENING_SET, barsMap, distanceFromEnd);
  if (metrics.length < topN) return null;

  const scored = scoreStocks(metrics).sort((a, b) => b.composite - a.composite);
  const top = scored.slice(0, topN);

  function tradeReturn(symbol: string): number | null {
    const bars = barsMap.get(symbol);
    if (!bars) return null;
    const cutoffIndex = bars.length - 1 - distanceFromEnd;
    const entryIndex = cutoffIndex + 1;
    const exitIndex = entryIndex + HOLD_TRADING_DAYS;
    if (entryIndex < 0 || exitIndex >= bars.length) return null;
    const entryPrice = bars[entryIndex].open;
    const exitPrice = bars[exitIndex].open;
    if (!entryPrice) return null;
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  }

  const picks = top
    .map((s) => {
      const bars = barsMap.get(s.symbol)!;
      const cutoffIndex = bars.length - 1 - distanceFromEnd;
      const entryIndex = cutoffIndex + 1;
      const exitIndex = entryIndex + HOLD_TRADING_DAYS;
      const entryPrice = bars[entryIndex]?.open;
      const exitPrice = bars[exitIndex]?.open;
      if (entryPrice == null || exitPrice == null) return null;
      return { symbol: s.symbol, entryPrice, exitPrice, returnPct: ((exitPrice - entryPrice) / entryPrice) * 100 };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (picks.length === 0) return null;
  const portfolioReturnPct = average(picks.map((p) => p.returnPct))!;

  const benchmarkReturns = metrics.map((m) => tradeReturn(m.symbol)).filter((r): r is number => r !== null);
  const benchmarkReturnPct = average(benchmarkReturns) ?? 0;

  const refBars = barsMap.get(metrics[0].symbol)!;
  const refCutoff = refBars.length - 1 - distanceFromEnd;

  return {
    distanceFromEnd,
    date: refBars[refCutoff].date,
    picks,
    portfolioReturnPct,
    benchmarkReturnPct,
    excessReturnPct: portfolioReturnPct - benchmarkReturnPct,
  };
}

type TradeStats = {
  n: number;
  winRatePct: number;
  avgPnlPct: number;
  medianPnlPct: number;
  avgPnlDollar: number;
  netAvgPnlDollar: number;
  startCapital: number;
  endCapital: number;
};

/**
 * Individual-trade stats, distinct from the cycle-level stats above: a
 * cycle already averages 3 picks together, which can mask how any ONE
 * trade actually performs. This flattens every pick across every cycle
 * into one list and reports on that — the numbers a trader would actually
 * ask ("what's my win rate, what do I expect to make per trade").
 *
 * Dollar figures COMPOUND: starting from STARTING_CAPITAL, each cycle's
 * 3-way split is sized off whatever the running balance actually is at
 * that point (not a fixed $10k/3 stake every time), and the balance
 * updates net of costs after each cycle before sizing the next one. Cycles
 * must be passed in chronological order — runCycles() already returns them
 * that way. Applied to a non-contiguous subset (e.g. "excluding single
 * best cycle" in the robustness diagnostic below), this reads as "skip
 * that one trade, keep compounding through the rest" — a standard way to
 * ask what a bad/lucky cycle cost or earned you, not a claim that skipping
 * it was knowable in advance.
 */
function computeTradeStats(cycles: CycleResult[]): TradeStats {
  let capital = STARTING_CAPITAL;
  const returns: number[] = [];
  const dollarPnls: number[] = [];
  const netDollarPnls: number[] = [];

  for (const cycle of cycles) {
    const perTradeStake = capital / cycle.picks.length;
    for (const pick of cycle.picks) {
      returns.push(pick.returnPct);
      dollarPnls.push((perTradeStake * pick.returnPct) / 100);
      netDollarPnls.push((perTradeStake * (pick.returnPct - COST_BPS_ROUND_TRIP / 100)) / 100);
    }
    const netReturnFrac = (cycle.portfolioReturnPct - COST_BPS_ROUND_TRIP / 100) / 100;
    capital *= 1 + netReturnFrac;
  }

  const n = returns.length;
  return {
    n,
    winRatePct: n === 0 ? 0 : (returns.filter((r) => r > 0).length / n) * 100,
    avgPnlPct: average(returns) ?? 0,
    medianPnlPct: median(returns),
    avgPnlDollar: average(dollarPnls) ?? 0,
    netAvgPnlDollar: average(netDollarPnls) ?? 0,
    startCapital: STARTING_CAPITAL,
    endCapital: capital,
  };
}

function printTradeStats(stats: TradeStats) {
  console.log(`  individual trades: ${stats.n}`);
  console.log(`  win rate (trade itself profitable, regardless of benchmark): ${stats.winRatePct.toFixed(0)}%`);
  console.log(
    `  P&L/trade — mean: ${stats.avgPnlPct.toFixed(2)}% (avg $${stats.avgPnlDollar.toFixed(2)})  median: ${stats.medianPnlPct.toFixed(2)}%  ` +
      `(net of ~${COST_BPS_ROUND_TRIP}bps costs, avg $${stats.netAvgPnlDollar.toFixed(2)})`
  );
  console.log(
    `  compounding balance over this run: $${stats.startCapital.toLocaleString()} -> $${stats.endCapital.toFixed(2)} ` +
      `(position size grows/shrinks with it, split evenly across however many picks that cycle held)`
  );
}

function aggregate(cycles: CycleResult[]): AggregateStats {
  const n = cycles.length;
  const returns = cycles.map((c) => c.portfolioReturnPct);
  const excess = cycles.map((c) => c.excessReturnPct);
  const netReturns = returns.map((r) => r - COST_BPS_ROUND_TRIP / 100);

  const meanReturnPct = average(returns) ?? 0;
  const meanExcessPct = average(excess) ?? 0;
  const sharpeLike = (() => {
    const sd = stdev(excess);
    return sd === 0 ? 0 : meanExcessPct / sd;
  })();

  return {
    n,
    meanReturnPct,
    medianReturnPct: median(returns),
    stdevReturnPct: stdev(returns),
    meanExcessPct,
    medianExcessPct: median(excess),
    sharpeLike,
    netMeanReturnPct: average(netReturns) ?? 0,
    winRate: n === 0 ? 0 : excess.filter((e) => e > 0).length / n,
  };
}

function printStats(cycles: CycleResult[]) {
  const stats = aggregate(cycles);
  console.log(`  cycles: ${stats.n}`);
  console.log(
    `  return/cycle — mean: ${stats.meanReturnPct.toFixed(2)}%  median: ${stats.medianReturnPct.toFixed(2)}%  (net of ~${COST_BPS_ROUND_TRIP}bps costs, mean: ${stats.netMeanReturnPct.toFixed(2)}%)`
  );
  console.log(
    `  excess vs equal-weight-universe benchmark — mean: ${stats.meanExcessPct.toFixed(2)}%  median: ${stats.medianExcessPct.toFixed(2)}%`
  );
  console.log(`  sharpe-like (excess mean / excess stdev): ${stats.sharpeLike.toFixed(2)}`);
  console.log(`  win rate vs benchmark: ${(stats.winRate * 100).toFixed(0)}%`);
  printTradeStats(computeTradeStats(cycles));
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const barsMap = await loadBars(refresh);
  const points = generateRebalancePoints(barsMap);

  console.log(`\n${points.length} non-overlapping ~${HOLD_TRADING_DAYS}-trading-day cycles available.`);
  if (points.length < 6) {
    console.warn(
      `WARNING: only ${points.length} cycles. This is too few to trust reliably — every number below is illustrative, not statistically meaningful.`
    );
  }

  const splitIndex = Math.ceil(points.length / 2);
  const trainPoints = points.slice(0, splitIndex);
  const testPoints = points.slice(splitIndex);

  function runCycles(pts: number[], topN: number = TOP_N): CycleResult[] {
    return pts.map((d) => simulateCycle(barsMap, d, topN)).filter((c): c is CycleResult => c !== null);
  }

  console.log("\n" + "=".repeat(70));
  console.log(`BACKTEST REPORT — universe=${UNIVERSE_NAME}, lookback=${LOOKBACK_TRADING_DAYS}td — Trend-only composite (no Groq synthesis)`);
  console.log("=".repeat(70));
  console.log(`
CAVEATS — read before trusting any number below:
- Survivorship bias: universe is TODAY's ${SCREENING_SET.length} ${UNIVERSE_NAME === "megacap" ? "Nasdaq-100 mega-cap" : "Next Gen 100"} constituents,
  projected backward. Direction of the bias is optimistic; magnitude unknown.
- Sample size: ${points.length} non-overlapping cycles (${trainPoints.length} train / ${testPoints.length} test).
  Not enough independent data to statistically distinguish real skill from
  noise. Every number below is a weak, illustrative signal.
- Costs: net figures assume ${COST_BPS_ROUND_TRIP}bps round-trip (spread + slippage estimate), no taxes.
- One historical regime — this window includes an unusually strong secular
  mega-cap tech trend; results here may not transfer to a choppier market.
- Quant composite only — the live app's Groq synthesis step is NOT simulated.
- Per-trade dollar figures now compound (balance grows/shrinks cycle to
  cycle, position size grows with it) rather than assuming a fixed $10k/3
  stake every time — more realistic about growth, but it also assumes you
  can always deploy an ever-larger position into just ${TOP_N} mega-cap
  stocks without moving the price. That assumption gets shakier the larger
  the compounded balance gets; real capacity is finite.
`);

  console.log("--- Trend-only composite — TRAIN period ---");
  printStats(runCycles(trainPoints));
  console.log("\n--- Trend-only composite — TEST period (out-of-sample) ---");
  printStats(runCycles(testPoints));

  // --- Diagnostic: is a 3-stock portfolio too concentrated (variance swamping signal)? ---
  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSTIC — concentration: top 1 vs top 3 vs top 5 vs top 10 picks/cycle");
  console.log("=".repeat(70));
  for (const topN of [1, 3, 5, 10]) {
    console.log(`\n--- Top ${topN} — TRAIN ---`);
    printStats(runCycles(trainPoints, topN));
    console.log(`--- Top ${topN} — TEST ---`);
    printStats(runCycles(testPoints, topN));
  }

  // --- Diagnostic: outlier robustness — is the excess (if any) a broad pattern, or 1-2 extreme cycles? ---
  // A single-stock (top 1) portfolio has no second or third pick to dilute
  // one extreme event, so this matters more there than at top 3 — run both.
  function runOutlierRobustness(topN: number) {
    console.log("\n" + "=".repeat(70));
    console.log(`DIAGNOSTIC — outlier robustness (median vs mean, trimmed stats) — top ${topN}`);
    console.log("=".repeat(70));

    for (const [periodLabel, pts] of [
      ["TRAIN", trainPoints],
      ["TEST", testPoints],
    ] as const) {
      const cycles = runCycles(pts, topN);
      if (cycles.length === 0) continue;

      console.log(`\n--- ${periodLabel} ---`);
      console.log("Baseline (no trim):");
      printStats(cycles);

      const sortedByReturn = [...cycles].sort((a, b) => b.portfolioReturnPct - a.portfolioReturnPct);
      const topCycle = sortedByReturn[0];
      const withoutTopCycle = cycles.filter((c) => c !== topCycle);
      console.log(
        `\nExcluding single best cycle (${topCycle.date}, [${topCycle.picks.map((p) => p.symbol).join(", ")}], ${topCycle.portfolioReturnPct.toFixed(2)}%):`
      );
      printStats(withoutTopCycle);

      const trimmed1 = trimExtremes(cycles, 1);
      if (trimmed1.length !== cycles.length) {
        console.log("\nSymmetric trim (drop 1 best + 1 worst cycle):");
        printStats(trimmed1);
      }

      console.log("\nMost extreme cycles this period:");
      sortedByReturn.slice(0, 2).forEach((c) => {
        console.log(`  best:  ${c.date} [${c.picks.map((p) => p.symbol).join(", ")}] ${c.portfolioReturnPct.toFixed(2)}%`);
      });
      sortedByReturn.slice(-2).forEach((c) => {
        console.log(`  worst: ${c.date} [${c.picks.map((p) => p.symbol).join(", ")}] ${c.portfolioReturnPct.toFixed(2)}%`);
      });
    }
  }

  runOutlierRobustness(TOP_N);
  runOutlierRobustness(1);

  console.log(`\n--- $${STARTING_CAPITAL.toLocaleString()} illustrative equity curve, full period, compounding, net of costs ---`);
  let capital = STARTING_CAPITAL;
  for (const d of points) {
    const cycle = simulateCycle(barsMap, d);
    if (!cycle) continue;
    const netReturnFrac = (cycle.portfolioReturnPct - COST_BPS_ROUND_TRIP / 100) / 100;
    capital *= 1 + netReturnFrac;
    console.log(
      `  ${cycle.date}: [${cycle.picks.map((p) => p.symbol).join(", ")}] cycle=${cycle.portfolioReturnPct.toFixed(2)}% -> $${capital.toFixed(2)}`
    );
  }
  console.log(`\nFinal: $${capital.toFixed(2)} (started at $${STARTING_CAPITAL.toLocaleString()})`);

  mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        universe: UNIVERSE_NAME,
        universeSize: SCREENING_SET.length,
        lookbackTradingDays: LOOKBACK_TRADING_DAYS,
        totalCycles: points.length,
        trainCycles: trainPoints.length,
        testCycles: testPoints.length,
        costBpsRoundTrip: COST_BPS_ROUND_TRIP,
        train: aggregate(runCycles(trainPoints)),
        test: aggregate(runCycles(testPoints)),
        tradeStatsTrain: computeTradeStats(runCycles(trainPoints)),
        tradeStatsTest: computeTradeStats(runCycles(testPoints)),
        concentration: [1, 3, 5, 10].map((topN) => ({
          topN,
          train: aggregate(runCycles(trainPoints, topN)),
          test: aggregate(runCycles(testPoints, topN)),
          tradeStatsTrain: computeTradeStats(runCycles(trainPoints, topN)),
          tradeStatsTest: computeTradeStats(runCycles(testPoints, topN)),
        })),
        finalEquity: capital,
      },
      null,
      2
    )
  );
  console.log(`\nFull results written to ${RESULTS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
