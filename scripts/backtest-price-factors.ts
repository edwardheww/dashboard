/**
 * Re-tests overnight momentum and residual momentum against a given
 * universe — see RESEARCH.md for the mega-cap verdict (both rejected:
 * overnight momentum's blend underperformed both pure trend and pure
 * candidate; residual momentum was highly redundant with trend, pooled
 * Spearman 0.629). Rebuilt here, universe-parameterized, to check Next Gen
 * 100 — where, unlike mega-cap, trend itself is a much weaker and less
 * robust baseline (see the fresh `npm run backtest -- --universe=nextgen100`
 * run this session: positive baseline median excess, but flips negative
 * excluding the single best test-period cycle). That makes the STANDALONE
 * (w=0.0) results the most trustworthy read here — beating a fragile trend
 * baseline in a blend is a low bar.
 *
 * Run: npm run backtest:price-factors -- [--universe=megacap|nextgen100] [--refresh]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DailyBar } from "../src/lib/types";
import { getHistoricalBars } from "../src/lib/yahoo";
import { buildMetricsAsOf, scoreStocks, HOLD_TRADING_DAYS, type StockMetrics, type ScoredStock } from "../src/lib/scoring";
import { average, median, loadBars, generateRebalancePoints, percentileRankNullable, trimExtremes } from "./lib/stats";
import { UNIVERSE_NAME, SCREENING_SET, SYMBOLS, BARS_CACHE_PATH } from "./lib/universe";

const MARKET_CACHE_PATH = path.join(process.cwd(), "data", `backtest-bars-cache.qqq.json`);
const TOP_N = 3;
const FORMATION_WINDOW = 126;
const RESIDUAL_BETA_WINDOW = 252;

async function loadMarketBars(refresh: boolean): Promise<DailyBar[]> {
  if (!refresh && existsSync(MARKET_CACHE_PATH)) {
    return JSON.parse(readFileSync(MARKET_CACHE_PATH, "utf-8")) as DailyBar[];
  }
  console.log("Fetching QQQ history (market proxy for residual momentum)...");
  const map = await getHistoricalBars(["QQQ"], 630);
  const bars = map.get("QQQ") ?? [];
  mkdirSync(path.dirname(MARKET_CACHE_PATH), { recursive: true });
  writeFileSync(MARKET_CACHE_PATH, JSON.stringify(bars));
  return bars;
}

// --- candidate 1: overnight momentum ---

function overnightMomentumRaw(bars: DailyBar[]): number | null {
  if (bars.length < FORMATION_WINDOW + 1) return null;
  let cum = 1;
  for (let i = bars.length - FORMATION_WINDOW; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    if (!prevClose) return null;
    cum *= bars[i].open / prevClose;
  }
  return (cum - 1) * 100;
}

function decomposeReturn(bars: DailyBar[], entryIndex: number, exitIndex: number): { overnightPct: number; intradayPct: number } {
  let intradayCum = 1;
  for (let i = entryIndex; i < exitIndex; i++) intradayCum *= bars[i].close / bars[i].open;
  let overnightCum = 1;
  for (let i = entryIndex + 1; i <= exitIndex; i++) overnightCum *= bars[i].open / bars[i - 1].close;
  return { overnightPct: (overnightCum - 1) * 100, intradayPct: (intradayCum - 1) * 100 };
}

// --- candidate 2: residual momentum ---

function dailyReturnsByDate(bars: DailyBar[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    if (!prevClose) continue;
    map.set(bars[i].date, (bars[i].close / prevClose - 1) * 100);
  }
  return map;
}

function ols(xs: number[], ys: number[]): { alpha: number; beta: number } {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let covXY = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    covXY += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
  }
  const beta = varX === 0 ? 0 : covXY / varX;
  return { alpha: meanY - beta * meanX, beta };
}

function residualMomentumRaw(stockBars: DailyBar[], marketReturnsByDate: Map<string, number>): number | null {
  if (stockBars.length < RESIDUAL_BETA_WINDOW + 1) return null;
  const window = stockBars.slice(stockBars.length - RESIDUAL_BETA_WINDOW - 1);
  const stockReturns = dailyReturnsByDate(window);
  const pairs: Array<{ date: string; x: number; y: number }> = [];
  for (const [date, y] of stockReturns) {
    const x = marketReturnsByDate.get(date);
    if (x != null) pairs.push({ date, x, y });
  }
  if (pairs.length < RESIDUAL_BETA_WINDOW * 0.8) return null;
  const { alpha, beta } = ols(
    pairs.map((p) => p.x),
    pairs.map((p) => p.y)
  );
  const recentDates = new Set(stockBars.slice(-FORMATION_WINDOW).map((b) => b.date));
  let cumResidual = 0;
  for (const p of pairs) {
    if (!recentDates.has(p.date)) continue;
    cumResidual += p.y - (alpha + beta * p.x);
  }
  return cumResidual;
}

// --- cycle simulation ---

type CycleResult = {
  distanceFromEnd: number;
  date: string;
  picks: Array<{ symbol: string; entryPrice: number; exitPrice: number; returnPct: number }>;
  portfolioReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
};

function tradeReturn(barsMap: Map<string, DailyBar[]>, symbol: string, distanceFromEnd: number): number | null {
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

function simulateCycleWithComposite(
  barsMap: Map<string, DailyBar[]>,
  metrics: StockMetrics[],
  compositeMap: Map<string, number>,
  distanceFromEnd: number
): CycleResult | null {
  if (metrics.length < TOP_N) return null;
  const ranked = [...metrics].sort((a, b) => (compositeMap.get(b.symbol) ?? 0) - (compositeMap.get(a.symbol) ?? 0));
  const top = ranked.slice(0, TOP_N);

  const picks = top
    .map((m) => {
      const bars = barsMap.get(m.symbol)!;
      const cutoffIndex = bars.length - 1 - distanceFromEnd;
      const entryIndex = cutoffIndex + 1;
      const exitIndex = entryIndex + HOLD_TRADING_DAYS;
      const entryPrice = bars[entryIndex]?.open;
      const exitPrice = bars[exitIndex]?.open;
      if (entryPrice == null || exitPrice == null) return null;
      return { symbol: m.symbol, entryPrice, exitPrice, returnPct: ((exitPrice - entryPrice) / entryPrice) * 100 };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (picks.length === 0) return null;

  const portfolioReturnPct = average(picks.map((p) => p.returnPct))!;
  const benchmarkReturns = metrics.map((m) => tradeReturn(barsMap, m.symbol, distanceFromEnd)).filter((r): r is number => r !== null);
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

type AggregateStats = { n: number; meanExcessPct: number; medianExcessPct: number };

function aggregate(cycles: CycleResult[]): AggregateStats {
  const excess = cycles.map((c) => c.excessReturnPct);
  return { n: cycles.length, meanExcessPct: average(excess) ?? 0, medianExcessPct: median(excess) };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const barsMap = await loadBars(BARS_CACHE_PATH, SYMBOLS, refresh);
  const marketBars = await loadMarketBars(refresh);

  const points = generateRebalancePoints(barsMap);
  const splitIndex = Math.ceil(points.length / 2);
  const trainPoints = points.slice(0, splitIndex);
  const testPoints = points.slice(splitIndex);

  console.log("\n" + "=".repeat(70));
  console.log(`PRICE-ONLY CANDIDATE FACTORS — universe=${UNIVERSE_NAME} — overnight momentum & residual momentum`);
  console.log("=".repeat(70));
  console.log(`
CAVEATS:
- Same ${points.length} cycles as scripts/backtest.ts (${trainPoints.length} train / ${testPoints.length} test).
- Weight chosen on TRAIN median excess only, then evaluated on TEST at that
  same weight.
- If this run is on Next Gen 100: trend itself is a much weaker, less
  robust baseline there than on mega-cap (positive median at baseline, but
  flips negative excluding the single best test-period cycle — see
  scripts/backtest.ts's own outlier-robustness diagnostic). Read the
  standalone (w=0.0) numbers as the more trustworthy signal — beating a
  fragile trend baseline in a blend is a low bar.
`);

  console.log("=".repeat(70));
  console.log("DIAGNOSTIC — overnight vs. intraday decomposition of TREND-ONLY's realized returns");
  console.log("=".repeat(70));

  function decomposePeriod(label: string, pts: number[]) {
    const pickLegs: Array<{ overnightPct: number; intradayPct: number }> = [];
    const benchLegs: Array<{ overnightPct: number; intradayPct: number }> = [];
    for (const d of pts) {
      const metrics = buildMetricsAsOf(SCREENING_SET, barsMap, d);
      if (metrics.length < TOP_N) continue;
      const scored = scoreStocks(metrics).sort((a, b) => b.composite - a.composite);
      const top = scored.slice(0, TOP_N);
      for (const s of top) {
        const bars = barsMap.get(s.symbol)!;
        const cutoffIndex = bars.length - 1 - d;
        const entryIndex = cutoffIndex + 1;
        const exitIndex = entryIndex + HOLD_TRADING_DAYS;
        if (exitIndex >= bars.length) continue;
        pickLegs.push(decomposeReturn(bars, entryIndex, exitIndex));
      }
      for (const m of metrics) {
        const bars = barsMap.get(m.symbol)!;
        const cutoffIndex = bars.length - 1 - d;
        const entryIndex = cutoffIndex + 1;
        const exitIndex = entryIndex + HOLD_TRADING_DAYS;
        if (exitIndex >= bars.length) continue;
        benchLegs.push(decomposeReturn(bars, entryIndex, exitIndex));
      }
    }
    const pickOvernight = average(pickLegs.map((l) => l.overnightPct)) ?? 0;
    const pickIntraday = average(pickLegs.map((l) => l.intradayPct)) ?? 0;
    const benchOvernight = average(benchLegs.map((l) => l.overnightPct)) ?? 0;
    const benchIntraday = average(benchLegs.map((l) => l.intradayPct)) ?? 0;
    console.log(`\n--- ${label} ---`);
    console.log(`  Trend picks   — mean overnight leg: ${pickOvernight.toFixed(2)}%  mean intraday leg: ${pickIntraday.toFixed(2)}%`);
    console.log(`  Universe avg  — mean overnight leg: ${benchOvernight.toFixed(2)}%  mean intraday leg: ${benchIntraday.toFixed(2)}%`);
    console.log(`  Excess        — overnight: ${(pickOvernight - benchOvernight).toFixed(2)}pp  intraday: ${(pickIntraday - benchIntraday).toFixed(2)}pp`);
  }
  decomposePeriod("TRAIN", trainPoints);
  decomposePeriod("TEST", testPoints);
  decomposePeriod("FULL PERIOD", points);

  const WEIGHTS = Array.from({ length: 11 }, (_, i) => i / 10);

  function runGrid(label: string, computeCandidateRaw: (metrics: StockMetrics[], distanceFromEnd: number) => Map<string, number | null>) {
    console.log("\n" + "=".repeat(70));
    console.log(label);
    console.log("=".repeat(70));

    function cyclesAtWeight(pts: number[], weight: number): CycleResult[] {
      return pts
        .map((d) => {
          const metrics = buildMetricsAsOf(SCREENING_SET, barsMap, d);
          if (metrics.length < TOP_N) return null;
          const scored: ScoredStock[] = scoreStocks(metrics);
          const candidateRaw = computeCandidateRaw(metrics, d);
          const candidatePct = percentileRankNullable(scored.map((s) => candidateRaw.get(s.symbol) ?? null));
          const compositeMap = new Map<string, number>();
          scored.forEach((s, i) => compositeMap.set(s.symbol, weight * s.composite + (1 - weight) * candidatePct[i]));
          return simulateCycleWithComposite(barsMap, metrics, compositeMap, d);
        })
        .filter((c): c is CycleResult => c !== null);
    }

    console.log(`\n  weight(trend) | train n | train mean excess | train median excess`);
    let bestWeight = 1.0;
    let bestTrainMedian = -Infinity;
    for (const w of WEIGHTS) {
      const trainCycles = cyclesAtWeight(trainPoints, w);
      const stats = aggregate(trainCycles);
      console.log(`  ${w.toFixed(1)}           | ${stats.n}       | ${stats.meanExcessPct.toFixed(2)}%             | ${stats.medianExcessPct.toFixed(2)}%`);
      if (stats.medianExcessPct > bestTrainMedian) {
        bestTrainMedian = stats.medianExcessPct;
        bestWeight = w;
      }
    }

    console.log(`\n  Best weight by TRAIN median excess: w(trend)=${bestWeight.toFixed(1)}`);
    const bestTrain = cyclesAtWeight(trainPoints, bestWeight);
    const bestTest = cyclesAtWeight(testPoints, bestWeight);
    console.log(`  TRAIN at w=${bestWeight.toFixed(1)} — mean excess: ${aggregate(bestTrain).meanExcessPct.toFixed(2)}%  median excess: ${aggregate(bestTrain).medianExcessPct.toFixed(2)}%`);
    console.log(`  TEST  at w=${bestWeight.toFixed(1)} — mean excess: ${aggregate(bestTest).meanExcessPct.toFixed(2)}%  median excess: ${aggregate(bestTest).medianExcessPct.toFixed(2)}%`);
    if (bestWeight !== 1.0) {
      const trimmedTest = trimExtremes(bestTest, (c) => c.portfolioReturnPct, Math.max(1, Math.round(bestTest.length * 0.05)));
      console.log(`  TEST at w=${bestWeight.toFixed(1)}, symmetric-trimmed — mean excess: ${aggregate(trimmedTest).meanExcessPct.toFixed(2)}%  median excess: ${aggregate(trimmedTest).medianExcessPct.toFixed(2)}%`);
    }

    console.log(`\n  Reference — pure trend (w=1.0)     — TRAIN median excess: ${aggregate(cyclesAtWeight(trainPoints, 1.0)).medianExcessPct.toFixed(2)}%  TEST median excess: ${aggregate(cyclesAtWeight(testPoints, 1.0)).medianExcessPct.toFixed(2)}%`);
    console.log(`  Reference — pure candidate (w=0.0) — TRAIN median excess: ${aggregate(cyclesAtWeight(trainPoints, 0.0)).medianExcessPct.toFixed(2)}%  TEST median excess: ${aggregate(cyclesAtWeight(testPoints, 0.0)).medianExcessPct.toFixed(2)}%`);
  }

  runGrid("CANDIDATE 1 — trend + overnight momentum blend", (metrics) => {
    const raw = new Map<string, number | null>();
    for (const m of metrics) raw.set(m.symbol, overnightMomentumRaw(m.bars));
    return raw;
  });

  runGrid("CANDIDATE 2 — trend + residual momentum blend", (metrics, distanceFromEnd) => {
    const marketCutoff = marketBars.length - 1 - distanceFromEnd;
    const marketSlice = marketCutoff >= 0 ? marketBars.slice(0, marketCutoff + 1) : [];
    const marketReturnsByDate = dailyReturnsByDate(marketSlice);
    const raw = new Map<string, number | null>();
    for (const m of metrics) raw.set(m.symbol, residualMomentumRaw(m.bars, marketReturnsByDate));
    return raw;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
