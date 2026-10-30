/**
 * Re-tests PEAD, Quality, and Value against a given universe — originally
 * built and tested only against the live app's mega-cap universe (see
 * RESEARCH.md), where PEAD showed a real-but-redundant-with-trend signal
 * and Quality/Value both sign-flipped between train and test. Rebuilt here,
 * universe-parameterized, to check whether that verdict holds on the Next
 * Gen 100 universe too, or whether mega-cap's unusual pricing efficiency
 * was masking something real.
 *
 * PEAD: event study (see the CAVEATS block at runtime for the full
 * methodology — benchmark-relative excess returns, outlier-robustness,
 * dose-response, large-surprise-only subsample). Earnings announcements
 * are stock-specific dated events, not a calendar cycle, so this doesn't
 * depend on trend being a good baseline for this universe.
 *
 * Quality / Value: pooled cross-sectional Spearman correlation + tercile
 * spread across (symbol, quarter) observations — also doesn't depend on
 * trend. Same ~5-7-quarter Yahoo data-depth limit as before.
 *
 * Run: npm run backtest:newfactors -- [--universe=megacap|nextgen100] [--refresh]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DailyBar } from "../src/lib/types";
import { HOLD_TRADING_DAYS, MIN_BARS_REQUIRED } from "../src/lib/scoring";
import { getFundamentals, type SymbolFundamentals } from "./fundamentals-data";
import { average, median, loadBars, spearman, percentileRankNullable, trimExtremes } from "./lib/stats";
import { UNIVERSE_NAME, SYMBOLS, BARS_CACHE_PATH } from "./lib/universe";

const RESULTS_PATH = path.join(process.cwd(), "data", `backtest-newfactors-results.${UNIVERSE_NAME}.json`);
const LARGE_SURPRISE_THRESHOLD_PCT = 5; // fixed a priori, before looking at test-period results

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

function findNearestByDate<T extends { date: string }>(items: T[], targetDate: string, toleranceDays: number): T | null {
  let best: T | null = null;
  let bestDiff = Infinity;
  for (const item of items) {
    const diff = daysBetween(item.date, targetDate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = item;
    }
  }
  return bestDiff <= toleranceDays ? best : null;
}

function forwardReturnFromDate(bars: DailyBar[], asOfDate: string, holdDays: number): number | null {
  const entryIndex = bars.findIndex((b) => b.date > asOfDate);
  if (entryIndex === -1) return null;
  const exitIndex = entryIndex + holdDays;
  if (exitIndex >= bars.length) return null;
  const entryPrice = bars[entryIndex].open;
  const exitPrice = bars[exitIndex].open;
  if (!entryPrice) return null;
  return ((exitPrice - entryPrice) / entryPrice) * 100;
}

function priceAsOfDate(bars: DailyBar[], asOfDate: string): number | null {
  let price: number | null = null;
  for (const b of bars) {
    if (b.date > asOfDate) break;
    price = b.close;
  }
  return price;
}

function splitChronological<T>(items: T[], dateOf: (item: T) => string): { train: T[]; test: T[] } {
  const sorted = [...items].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const splitIndex = Math.ceil(sorted.length / 2);
  return { train: sorted.slice(0, splitIndex), test: sorted.slice(splitIndex) };
}

// --- PEAD: event study ---

type PeadEvent = {
  symbol: string;
  reportedDate: string;
  entryDate: string;
  exitDate: string;
  surprisePct: number;
  rawReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
};

function computeEventReturn(
  bars: DailyBar[],
  asOfDate: string,
  holdDays: number
): { entryDate: string; exitDate: string; returnPct: number } | null {
  const entryIndex = bars.findIndex((b) => b.date > asOfDate);
  if (entryIndex === -1) return null;
  const exitIndex = entryIndex + holdDays;
  if (exitIndex >= bars.length) return null;
  const entryPrice = bars[entryIndex].open;
  const exitPrice = bars[exitIndex].open;
  if (!entryPrice) return null;
  return { entryDate: bars[entryIndex].date, exitDate: bars[exitIndex].date, returnPct: ((exitPrice - entryPrice) / entryPrice) * 100 };
}

function universeReturnOverWindow(barsMap: Map<string, DailyBar[]>, entryDate: string, exitDate: string, excludeSymbol: string): number | null {
  const returns: number[] = [];
  for (const [symbol, bars] of barsMap) {
    if (symbol === excludeSymbol || bars.length < MIN_BARS_REQUIRED) continue;
    const entryIdx = bars.findIndex((b) => b.date >= entryDate);
    if (entryIdx === -1) continue;
    const exitIdx = bars.findIndex((b) => b.date >= exitDate);
    if (exitIdx === -1 || exitIdx <= entryIdx) continue;
    const entryPrice = bars[entryIdx].open;
    const exitPrice = bars[exitIdx].open;
    if (!entryPrice) continue;
    returns.push(((exitPrice - entryPrice) / entryPrice) * 100);
  }
  return average(returns);
}

function buildPeadEvents(fundamentals: Map<string, SymbolFundamentals>, barsMap: Map<string, DailyBar[]>): PeadEvent[] {
  const events: PeadEvent[] = [];
  for (const symbol of SYMBOLS) {
    const f = fundamentals.get(symbol);
    const bars = barsMap.get(symbol);
    if (!f || !bars || bars.length < MIN_BARS_REQUIRED) continue;
    for (const e of f.earnings) {
      if (e.surprisePct == null || !Number.isFinite(e.surprisePct)) continue;
      const result = computeEventReturn(bars, e.reportedDate, HOLD_TRADING_DAYS);
      if (!result) continue;
      const benchmarkReturnPct = universeReturnOverWindow(barsMap, result.entryDate, result.exitDate, symbol);
      if (benchmarkReturnPct == null) continue;
      events.push({
        symbol,
        reportedDate: e.reportedDate,
        entryDate: result.entryDate,
        exitDate: result.exitDate,
        surprisePct: e.surprisePct,
        rawReturnPct: result.returnPct,
        benchmarkReturnPct,
        excessReturnPct: result.returnPct - benchmarkReturnPct,
      });
    }
  }
  return events;
}

type BucketStats = { n: number; mean: number; median: number };

function bucketStats(events: PeadEvent[], metric: (e: PeadEvent) => number) {
  const positiveVals = events.filter((e) => e.surprisePct > 0).map(metric);
  const negativeVals = events.filter((e) => e.surprisePct <= 0).map(metric);
  const positive: BucketStats = { n: positiveVals.length, mean: average(positiveVals) ?? 0, median: median(positiveVals) };
  const negative: BucketStats = { n: negativeVals.length, mean: average(negativeVals) ?? 0, median: median(negativeVals) };
  return { positive, negative, spreadMean: positive.mean - negative.mean, spreadMedian: positive.median - negative.median };
}

function printBucket(prefix: string, b: ReturnType<typeof bucketStats>) {
  console.log(
    `  ${prefix} — positive (n=${b.positive.n}) mean ${b.positive.mean.toFixed(2)}% median ${b.positive.median.toFixed(2)}%  |  ` +
      `negative (n=${b.negative.n}) mean ${b.negative.mean.toFixed(2)}% median ${b.negative.median.toFixed(2)}%  |  ` +
      `spread mean ${b.spreadMean.toFixed(2)}pp median ${b.spreadMedian.toFixed(2)}pp`
  );
}

function reportPead(label: string, events: PeadEvent[]) {
  if (events.length < 10) {
    console.log(`\n--- PEAD — ${label} (n=${events.length}) — too few events to report ---`);
    return null;
  }
  const distinctSymbols = new Set(events.map((e) => e.symbol)).size;
  console.log(`\n--- PEAD — ${label} (n=${events.length} events, ${distinctSymbols} symbols) ---`);

  const corrRaw = spearman(events.map((e) => e.surprisePct), events.map((e) => e.rawReturnPct));
  const corrExcess = spearman(events.map((e) => e.surprisePct), events.map((e) => e.excessReturnPct));
  console.log(`  Spearman (surprise% vs return): raw ${corrRaw.toFixed(3)}   excess (vs universe) ${corrExcess.toFixed(3)}`);
  printBucket("raw   ", bucketStats(events, (e) => e.rawReturnPct));
  printBucket("excess", bucketStats(events, (e) => e.excessReturnPct));

  return { n: events.length, distinctSymbols, corrRaw, corrExcess };
}

function reportRobustness(label: string, events: PeadEvent[]) {
  console.log(`\n--- ${label} ---`);
  console.log("Baseline:");
  printBucket("excess", bucketStats(events, (e) => e.excessReturnPct));
  if (events.length < 4) return;

  const sortedByExcess = [...events].sort((a, b) => b.excessReturnPct - a.excessReturnPct);
  const best = sortedByExcess[0];
  const withoutBest = events.filter((e) => e !== best);
  console.log(`\nExcluding single best event (${best.symbol} ${best.reportedDate}, excess ${best.excessReturnPct.toFixed(2)}%):`);
  printBucket("excess", bucketStats(withoutBest, (e) => e.excessReturnPct));

  const trimCount = Math.max(1, Math.round(events.length * 0.05));
  const trimmed = trimExtremes(events, (e) => e.excessReturnPct, trimCount);
  if (trimmed.length !== events.length) {
    console.log(`\nSymmetric trim (drop ${trimCount} best + ${trimCount} worst by excess return):`);
    printBucket("excess", bucketStats(trimmed, (e) => e.excessReturnPct));
  }
}

function reportDoseResponse(label: string, events: PeadEvent[]) {
  const positive = events.filter((e) => e.surprisePct > 0).sort((a, b) => a.surprisePct - b.surprisePct);
  if (positive.length < 9) {
    console.log(`\n--- Dose-response — ${label} — too few positive-surprise events (n=${positive.length}) ---`);
    return;
  }
  const t = Math.floor(positive.length / 3);
  const buckets = [
    { name: "small beat", events: positive.slice(0, t) },
    { name: "medium beat", events: positive.slice(t, positive.length - t) },
    { name: "large beat", events: positive.slice(positive.length - t) },
  ];

  console.log(`\n--- Dose-response (positive surprises only) — ${label} ---`);
  const results = buckets.map((b) => {
    const excess = b.events.map((e) => e.excessReturnPct);
    const mean = average(excess) ?? 0;
    const med = median(excess);
    console.log(`  ${b.name.padEnd(12)} (n=${b.events.length}) — excess mean: ${mean.toFixed(2)}%  median: ${med.toFixed(2)}%`);
    return { mean, med };
  });
  const monotonicMean = results[0].mean < results[1].mean && results[1].mean < results[2].mean;
  const monotonicMedian = results[0].med < results[1].med && results[1].med < results[2].med;
  console.log(`  Monotonically increasing with surprise size — mean: ${monotonicMean ? "yes" : "no"}  median: ${monotonicMedian ? "yes" : "no"}`);
}

// --- Quality / Value: pooled cross-sectional observations ---

type QVObservation = {
  symbol: string;
  asOfDate: string;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  earningsYield: number | null;
  forwardReturnPct: number;
};

function buildQualityValueObservations(fundamentals: Map<string, SymbolFundamentals>, barsMap: Map<string, DailyBar[]>): QVObservation[] {
  const obs: QVObservation[] = [];
  for (const symbol of SYMBOLS) {
    const f = fundamentals.get(symbol);
    const bars = barsMap.get(symbol);
    if (!f || !bars || bars.length < MIN_BARS_REQUIRED) continue;

    for (const fin of f.financials) {
      const matchedEarnings = f.earnings.find((e) => daysBetween(e.periodEndDate, fin.date) <= 5);
      if (!matchedEarnings) continue;
      const asOfDate = matchedEarnings.reportedDate;

      const bs = findNearestByDate(f.balanceSheet, fin.date, 10);

      const grossMargin = fin.totalRevenue && fin.grossProfit != null ? fin.grossProfit / fin.totalRevenue : null;
      const operatingMargin = fin.totalRevenue && fin.operatingIncome != null ? fin.operatingIncome / fin.totalRevenue : null;
      const netMargin = fin.totalRevenue && fin.netIncome != null ? fin.netIncome / fin.totalRevenue : null;
      const debtToEquity = bs?.stockholdersEquity ? (bs.totalDebt ?? 0) / bs.stockholdersEquity : null;

      const priceAsOf = priceAsOfDate(bars, asOfDate);
      const earningsYield = priceAsOf && fin.dilutedEPS != null ? (fin.dilutedEPS * 4) / priceAsOf : null;

      const forwardReturnPct = forwardReturnFromDate(bars, asOfDate, HOLD_TRADING_DAYS);
      if (forwardReturnPct == null) continue;

      obs.push({ symbol, asOfDate, grossMargin, operatingMargin, netMargin, debtToEquity, earningsYield, forwardReturnPct });
    }
  }
  return obs;
}

function reportFactor(label: string, scores: number[], forwardReturns: number[]) {
  const n = scores.length;
  console.log(`\n--- ${label} (n=${n} observations) ---`);
  if (n < 10) {
    console.log("  Too few observations to report meaningfully.");
    return null;
  }
  const corr = spearman(scores, forwardReturns);
  const paired = scores.map((s, i) => ({ s, r: forwardReturns[i] })).sort((a, b) => a.s - b.s);
  const tercileSize = Math.floor(n / 3);
  const bottom = paired.slice(0, tercileSize).map((p) => p.r);
  const top = paired.slice(n - tercileSize).map((p) => p.r);

  console.log(`  Spearman correlation (score vs forward ${HOLD_TRADING_DAYS}td return): ${corr.toFixed(3)}`);
  console.log(`  Bottom tercile (n=${bottom.length}) — mean: ${(average(bottom) ?? 0).toFixed(2)}%  median: ${median(bottom).toFixed(2)}%`);
  console.log(`  Top tercile    (n=${top.length}) — mean: ${(average(top) ?? 0).toFixed(2)}%  median: ${median(top).toFixed(2)}%`);
  console.log(
    `  Spread (top - bottom) — mean: ${((average(top) ?? 0) - (average(bottom) ?? 0)).toFixed(2)}pp  median: ${(median(top) - median(bottom)).toFixed(2)}pp`
  );
  return { n, spearman: corr };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const barsMap = await loadBars(BARS_CACHE_PATH, SYMBOLS, refresh);
  const fundamentals = await getFundamentals(UNIVERSE_NAME, SYMBOLS, refresh);

  console.log("\n" + "=".repeat(70));
  console.log(`NEW-FACTOR BACKTEST — universe=${UNIVERSE_NAME} — PEAD, Quality, Value`);
  console.log("=".repeat(70));
  console.log(`
CAVEATS:
- Fundamentals depth is short (~4-7 trailing quarters), a hard Yahoo API
  limit — see scripts/fundamentals-data.ts.
- Quality/Value use a pooled cross-sectional correlation design, not a
  simulated-portfolio design — weaker evidence, small N, treat as suggestive.
- PEAD's event-study design doesn't depend on trend and is textbook-correct
  regardless of universe/data depth.
- Not wired into scoring.ts or the live app. Only gets wired in if it
  clears the bar trend cleared: positive AND stable on a held-out test half.
`);

  const peadEvents = buildPeadEvents(fundamentals, barsMap);
  const peadSplit = splitChronological(peadEvents, (e) => e.reportedDate);
  console.log("=".repeat(70));
  console.log("PEAD — post-earnings-announcement drift event study");
  console.log("=".repeat(70));
  reportPead("TRAIN (earlier events)", peadSplit.train);
  reportPead("TEST (later events, out-of-sample)", peadSplit.test);
  reportPead("FULL SAMPLE", peadEvents);

  console.log("\n" + "=".repeat(70));
  console.log("PEAD DIAGNOSTIC — outlier robustness (excess-return basis)");
  console.log("=".repeat(70));
  reportRobustness("TRAIN", peadSplit.train);
  reportRobustness("TEST", peadSplit.test);

  console.log("\n" + "=".repeat(70));
  console.log("PEAD DIAGNOSTIC — dose-response");
  console.log("=".repeat(70));
  reportDoseResponse("TRAIN", peadSplit.train);
  reportDoseResponse("TEST", peadSplit.test);

  console.log("\n" + "=".repeat(70));
  console.log(`PEAD DIAGNOSTIC — large-surprise-only subsample (|surprise%| > ${LARGE_SURPRISE_THRESHOLD_PCT})`);
  console.log("=".repeat(70));
  reportPead("TRAIN, large surprises only", peadSplit.train.filter((e) => Math.abs(e.surprisePct) > LARGE_SURPRISE_THRESHOLD_PCT));
  reportPead("TEST, large surprises only", peadSplit.test.filter((e) => Math.abs(e.surprisePct) > LARGE_SURPRISE_THRESHOLD_PCT));

  const qvObs = buildQualityValueObservations(fundamentals, barsMap);
  const qvSplit = splitChronological(qvObs, (o) => o.asOfDate);

  console.log("\n" + "=".repeat(70));
  console.log("QUALITY — profitability (margins) + safety (debt/equity), pooled cross-sectional");
  console.log("=".repeat(70));

  function qualityScores(observations: QVObservation[]): number[] {
    const grossPct = percentileRankNullable(observations.map((o) => o.grossMargin));
    const opPct = percentileRankNullable(observations.map((o) => o.operatingMargin));
    const netPct = percentileRankNullable(observations.map((o) => o.netMargin));
    const dePct = percentileRankNullable(observations.map((o) => (o.debtToEquity != null ? -o.debtToEquity : null)));
    return observations.map((_, i) => average([grossPct[i], opPct[i], netPct[i], dePct[i]])!);
  }

  reportFactor("TRAIN", qualityScores(qvSplit.train), qvSplit.train.map((o) => o.forwardReturnPct));
  reportFactor("TEST", qualityScores(qvSplit.test), qvSplit.test.map((o) => o.forwardReturnPct));
  reportFactor("FULL SAMPLE", qualityScores(qvObs), qvObs.map((o) => o.forwardReturnPct));

  console.log("\n" + "=".repeat(70));
  console.log("VALUE — earnings yield (dilutedEPS x4 / price), pooled cross-sectional");
  console.log("=".repeat(70));

  function valueScores(observations: QVObservation[]): number[] {
    return percentileRankNullable(observations.map((o) => o.earningsYield));
  }

  reportFactor("TRAIN", valueScores(qvSplit.train), qvSplit.train.map((o) => o.forwardReturnPct));
  reportFactor("TEST", valueScores(qvSplit.test), qvSplit.test.map((o) => o.forwardReturnPct));
  reportFactor("FULL SAMPLE", valueScores(qvObs), qvObs.map((o) => o.forwardReturnPct));

  mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  writeFileSync(RESULTS_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), universe: UNIVERSE_NAME }, null, 2));
  console.log(`\nDone. (Summary stats are in the console output above — see RESEARCH.md for the recorded verdict.)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
