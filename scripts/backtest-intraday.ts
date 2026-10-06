/**
 * Backtests five candidate intraday-direction ideas for NQ=F futures —
 * requested directly after the news-sentiment feature was concluded to
 * have no realistic basis for predicting intraday direction (headline-tone
 * scoring faces the same "public information is priced in fast" problem
 * that already sank the rule-based macro-bias score). Each idea is tested
 * independently against real historical NQ=F data with the same rigor as
 * the swing-horizon trend factor: chronological train/test split,
 * median-based stats, outlier-robustness (trim) checks.
 *
 * Run: npm run backtest:intraday -- [--refresh]
 *
 * SAMPLE SIZE CAVEAT — read before trusting any number below:
 * Yahoo's free API caps 5-minute intraday bars at 60 days of history
 * (verified live, 2026-08-11 — a hard platform limit, not a setting this
 * script controls). That means the three genuinely-intraday tests (VWAP,
 * opening-range breakout, volume-delta proxy) run on roughly 30-40 RTH
 * sessions per side of a 50/50 train/test split — a fraction of the ~300+
 * cycles the swing trend factor was validated against. Treat those three
 * as preliminary, not final verdicts. The gap-fill and 20EMA-regime tests
 * use daily bars instead (much deeper history available) and carry real
 * statistical weight.
 *
 * DATA CAVEAT — no true CVD available: order flow / cumulative volume
 * delta needs tick-level trades classified as buyer- vs seller-initiated
 * (bid/ask data), which this free source doesn't provide — only bar-level
 * aggregate volume. The "volume-delta proxy" test below approximates it
 * from up/down-bar volume, which is a real but weaker signal than true
 * CVD, and shouldn't be read as a test of what you're manually tracking.
 *
 * BASELINE CAVEAT — a raw hit-rate can be misleading on a trending
 * instrument: NQ ran a 55-57% unconditional up-day rate over this whole
 * sample, so any "bullish" rule will look like it "wins" a lot even with
 * zero real information. The 20EMA-regime test (Test 5) reports each
 * signal's hit-rate next to that baseline for exactly this reason — always
 * compare against it, not against 50%.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";
import { getHistoricalBars } from "../src/lib/yahoo";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SYMBOL = "NQ=F";
const DAILY_LOOKBACK_TRADING_DAYS = 630; // ~2.5yr, matches scripts/backtest.ts
const INTRADAY_LOOKBACK_DAYS = 59; // Yahoo caps 5m bars at 60 calendar days
const RTH_START_MIN = 9 * 60 + 30; // 9:30 ET
const RTH_END_MIN = 16 * 60; // 16:00 ET
const MIN_BARS_PER_SESSION = 60; // ~78 expected in a full 6.5hr RTH session at 5m; excludes half-days/gappy data

const DAILY_CACHE_PATH = path.join(process.cwd(), "data", "backtest-intraday-daily-cache.json");
const INTRADAY_CACHE_PATH = path.join(process.cwd(), "data", "backtest-intraday-5m-cache.json");

// ---------- shared stats helpers (matches scripts/backtest-newfactors.ts) ----------

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

function rankOf(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const n = values.length;
  const ranks = new Array(n).fill(50);
  sorted.forEach((item, rank) => {
    ranks[item.i] = n <= 1 ? 50 : (rank / (n - 1)) * 100;
  });
  return ranks;
}

function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const rx = rankOf(xs);
  const ry = rankOf(ys);
  const mx = average(rx)!;
  const my = average(ry)!;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const ddx = rx[i] - mx;
    const ddy = ry[i] - my;
    num += ddx * ddy;
    dx2 += ddx * ddx;
    dy2 += ddy * ddy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function trimExtremes(values: number[], n: number): number[] {
  if (n <= 0 || values.length <= 2 * n) return values;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.slice(n, sorted.length - n);
}

function winRate(values: number[]): number {
  if (values.length === 0) return 0;
  return (values.filter((v) => v > 0).length / values.length) * 100;
}

function reportReturns(label: string, values: number[]) {
  if (values.length === 0) {
    console.log(`  ${label}: n=0 (no observations)`);
    return;
  }
  const trimmed = trimExtremes(values, Math.max(1, Math.floor(values.length * 0.05)));
  console.log(
    `  ${label}: n=${values.length}, median=${median(values).toFixed(3)}%, mean=${average(values)!.toFixed(3)}%, win-rate=${winRate(values).toFixed(0)}%` +
      ` | trimmed(${values.length - trimmed.length} dropped): median=${median(trimmed).toFixed(3)}%, mean=${(average(trimmed) ?? 0).toFixed(3)}%`
  );
}

// ---------- Eastern Time helpers (RTH session grouping) ----------

function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function easternMinutesSinceMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  let h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  if (h === 24) h = 0;
  return h * 60 + m;
}

// ---------- data fetch + cache ----------

type IntradayBar = { date: string; open: number; high: number; low: number; close: number; volume: number };
type DailyBarLite = { date: string; open: number; high: number; low: number; close: number };

async function loadDailyBars(refresh: boolean): Promise<DailyBarLite[]> {
  if (!refresh && existsSync(DAILY_CACHE_PATH)) {
    console.log(`Loading cached daily bars from ${DAILY_CACHE_PATH} (pass --refresh to re-fetch)`);
    return JSON.parse(readFileSync(DAILY_CACHE_PATH, "utf-8"));
  }
  console.log(`Fetching ~${DAILY_LOOKBACK_TRADING_DAYS} daily bars for ${SYMBOL}...`);
  const map = await getHistoricalBars([SYMBOL], DAILY_LOOKBACK_TRADING_DAYS);
  const bars = (map.get(SYMBOL) ?? []).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close }));
  console.log(`Got ${bars.length} daily bars.`);
  mkdirSync(path.dirname(DAILY_CACHE_PATH), { recursive: true });
  writeFileSync(DAILY_CACHE_PATH, JSON.stringify(bars));
  return bars;
}

async function loadIntradayBars(refresh: boolean): Promise<IntradayBar[]> {
  if (!refresh && existsSync(INTRADAY_CACHE_PATH)) {
    console.log(`Loading cached 5m bars from ${INTRADAY_CACHE_PATH} (pass --refresh to re-fetch)`);
    return JSON.parse(readFileSync(INTRADAY_CACHE_PATH, "utf-8"));
  }
  console.log(`Fetching ${INTRADAY_LOOKBACK_DAYS}d of 5m bars for ${SYMBOL} (Yahoo's max window for this interval)...`);
  const period1 = new Date();
  period1.setDate(period1.getDate() - INTRADAY_LOOKBACK_DAYS);
  const result = await yf.chart(SYMBOL, { period1, interval: "5m" });
  const bars: IntradayBar[] = result.quotes
    .filter((q) => q.close != null && q.open != null && q.high != null && q.low != null)
    .map((q) => ({
      date: q.date.toISOString(),
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume ?? 0,
    }));
  console.log(`Got ${bars.length} 5m bars.`);
  mkdirSync(path.dirname(INTRADAY_CACHE_PATH), { recursive: true });
  writeFileSync(INTRADAY_CACHE_PATH, JSON.stringify(bars));
  return bars;
}

function groupIntoRthSessions(bars: IntradayBar[]): Map<string, IntradayBar[]> {
  const sessions = new Map<string, IntradayBar[]>();
  for (const bar of bars) {
    const d = new Date(bar.date);
    const mins = easternMinutesSinceMidnight(d);
    if (mins < RTH_START_MIN || mins >= RTH_END_MIN) continue;
    const key = easternDateKey(d);
    const list = sessions.get(key) ?? [];
    list.push(bar);
    sessions.set(key, list);
  }
  for (const list of sessions.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const filtered = new Map<string, IntradayBar[]>();
  for (const [key, list] of sessions) {
    if (list.length >= MIN_BARS_PER_SESSION) filtered.set(key, list);
  }
  return filtered;
}

function chronoSplit<T>(sortedItems: T[]): { train: T[]; test: T[] } {
  const splitIndex = Math.ceil(sortedItems.length / 2);
  return { train: sortedItems.slice(0, splitIndex), test: sortedItems.slice(splitIndex) };
}

// ---------- Test 1: gap-and-gap-fill (daily bars) ----------

function runGapTest(dailyBars: DailyBarLite[]) {
  console.log("\n" + "=".repeat(78));
  console.log("TEST 1 — GAP AND GAP-FILL (daily bars, deep history)");
  console.log("=".repeat(78));
  console.log(
    "Does the overnight gap (today's open vs yesterday's close) predict the rest of the day's move (open-to-close)? Positive correlation = gaps tend to continue; negative = gaps tend to fade/revert."
  );

  type GapObs = { date: string; gapPct: number; intradayReturnPct: number; filled: boolean };
  const obs: GapObs[] = [];
  for (let i = 1; i < dailyBars.length; i++) {
    const prev = dailyBars[i - 1];
    const cur = dailyBars[i];
    if (!prev.close || !cur.open) continue;
    const gapPct = ((cur.open - prev.close) / prev.close) * 100;
    const intradayReturnPct = ((cur.close - cur.open) / cur.open) * 100;
    const filled = gapPct >= 0 ? cur.low <= prev.close : cur.high >= prev.close;
    obs.push({ date: cur.date, gapPct, intradayReturnPct, filled });
  }

  const { train, test } = chronoSplit(obs);
  console.log(`\n${obs.length} trading days with a prior close (${train.length} train / ${test.length} test).`);

  for (const [label, set] of [["TRAIN", train], ["TEST", test]] as const) {
    console.log(`\n--- ${label} ---`);
    const corr = spearman(
      set.map((o) => o.gapPct),
      set.map((o) => o.intradayReturnPct)
    );
    console.log(`  Spearman correlation (gap % vs same-day open-to-close return %): ${corr.toFixed(3)}`);

    const gapUp = set.filter((o) => o.gapPct > 0.05);
    const gapDown = set.filter((o) => o.gapPct < -0.05);
    console.log(`  Gap-up days (>+0.05%): n=${gapUp.length}, fill rate=${((gapUp.filter((o) => o.filled).length / Math.max(1, gapUp.length)) * 100).toFixed(0)}%`);
    reportReturns("    same-day open-to-close return on gap-up days", gapUp.map((o) => o.intradayReturnPct));
    console.log(`  Gap-down days (<-0.05%): n=${gapDown.length}, fill rate=${((gapDown.filter((o) => o.filled).length / Math.max(1, gapDown.length)) * 100).toFixed(0)}%`);
    reportReturns("    same-day open-to-close return on gap-down days", gapDown.map((o) => o.intradayReturnPct));

    const sortedBySize = [...set].sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));
    const largestThird = sortedBySize.slice(0, Math.floor(sortedBySize.length / 3));
    const largeUp = largestThird.filter((o) => o.gapPct > 0);
    const largeDown = largestThird.filter((o) => o.gapPct < 0);
    console.log("  Largest-third gaps by size, split by direction (continuation = positive return in gap's own direction):");
    reportReturns("    large gap-up -> same-day return", largeUp.map((o) => o.intradayReturnPct));
    reportReturns("    large gap-down -> same-day return (negated so positive=continuation)", largeDown.map((o) => -o.intradayReturnPct));
  }
}

// ---------- Test 2: VWAP-relative positioning ----------

function runVwapTest(sessions: Map<string, IntradayBar[]>) {
  console.log("\n" + "=".repeat(78));
  console.log("TEST 2 — VWAP-RELATIVE POSITIONING (5m bars, RTH sessions)");
  console.log("=".repeat(78));
  console.log(
    "Reference point: 60 minutes into RTH (10:30 ET). Is price above/below session VWAP at that point predictive of the rest of the session's return (10:30 -> close)?"
  );

  const REF_MINUTES_INTO_SESSION = 60;

  type VwapObs = { date: string; distanceFromVwapPct: number; restOfSessionReturnPct: number };
  const obs: VwapObs[] = [];

  for (const [date, bars] of sessions) {
    const refIndex = Math.min(bars.length - 1, Math.floor(REF_MINUTES_INTO_SESSION / 5));
    let cumPV = 0;
    let cumVol = 0;
    for (let i = 0; i <= refIndex; i++) {
      const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
      cumPV += typicalPrice * bars[i].volume;
      cumVol += bars[i].volume;
    }
    if (cumVol === 0) continue;
    const vwap = cumPV / cumVol;
    const refPrice = bars[refIndex].close;
    const sessionClose = bars[bars.length - 1].close;
    const distanceFromVwapPct = ((refPrice - vwap) / vwap) * 100;
    const restOfSessionReturnPct = ((sessionClose - refPrice) / refPrice) * 100;
    obs.push({ date, distanceFromVwapPct, restOfSessionReturnPct });
  }

  const { train, test } = chronoSplit(obs);
  console.log(`\n${obs.length} RTH sessions (${train.length} train / ${test.length} test).`);

  for (const [label, set] of [["TRAIN", train], ["TEST", test]] as const) {
    console.log(`\n--- ${label} ---`);
    const corr = spearman(
      set.map((o) => o.distanceFromVwapPct),
      set.map((o) => o.restOfSessionReturnPct)
    );
    console.log(`  Spearman correlation (distance from VWAP at 10:30 ET vs rest-of-session return): ${corr.toFixed(3)}`);
    const above = set.filter((o) => o.distanceFromVwapPct > 0);
    const below = set.filter((o) => o.distanceFromVwapPct < 0);
    reportReturns("  above VWAP at 10:30 -> rest-of-session return", above.map((o) => o.restOfSessionReturnPct));
    reportReturns("  below VWAP at 10:30 -> rest-of-session return (negated so positive=continuation)", below.map((o) => -o.restOfSessionReturnPct));
  }
}

// ---------- Test 3: opening-range breakout ----------

function runOrbTest(sessions: Map<string, IntradayBar[]>) {
  console.log("\n" + "=".repeat(78));
  console.log("TEST 3 — OPENING-RANGE BREAKOUT (5m bars, RTH sessions)");
  console.log("=".repeat(78));
  console.log(
    "Opening range = high/low of the first 30 minutes (9:30-10:00 ET). Does the first breakout of that range predict continuation (positive) or reversal (negative) into the close?"
  );

  const ORB_BARS = 6; // 30 min / 5m

  type OrbObs = { date: string; direction: "up" | "down"; continuationReturnPct: number };
  const obs: OrbObs[] = [];
  let noBreakoutCount = 0;

  for (const [date, bars] of sessions) {
    if (bars.length <= ORB_BARS) continue;
    const orBars = bars.slice(0, ORB_BARS);
    const rangeHigh = Math.max(...orBars.map((b) => b.high));
    const rangeLow = Math.min(...orBars.map((b) => b.low));
    const sessionClose = bars[bars.length - 1].close;

    let breakout: { direction: "up" | "down"; price: number } | null = null;
    for (let i = ORB_BARS; i < bars.length; i++) {
      if (bars[i].close > rangeHigh) {
        breakout = { direction: "up", price: bars[i].close };
        break;
      }
      if (bars[i].close < rangeLow) {
        breakout = { direction: "down", price: bars[i].close };
        break;
      }
    }
    if (!breakout) {
      noBreakoutCount++;
      continue;
    }
    const continuationReturnPct =
      breakout.direction === "up"
        ? ((sessionClose - breakout.price) / breakout.price) * 100
        : ((breakout.price - sessionClose) / breakout.price) * 100;
    obs.push({ date, direction: breakout.direction, continuationReturnPct });
  }

  const { train, test } = chronoSplit(obs);
  console.log(`\n${obs.length} sessions with a breakout, ${noBreakoutCount} with none (${train.length} train / ${test.length} test).`);

  for (const [label, set] of [["TRAIN", train], ["TEST", test]] as const) {
    console.log(`\n--- ${label} ---`);
    const up = set.filter((o) => o.direction === "up");
    const down = set.filter((o) => o.direction === "down");
    console.log(`  breakouts up: ${up.length}, breakouts down: ${down.length}`);
    reportReturns("  all breakouts -> continuation return (positive = breakout direction held)", set.map((o) => o.continuationReturnPct));
    reportReturns("  breakout UP -> continuation return", up.map((o) => o.continuationReturnPct));
    reportReturns("  breakout DOWN -> continuation return", down.map((o) => o.continuationReturnPct));
  }
}

// ---------- Test 4: up/down-volume proxy for order flow ----------

function runVolumeDeltaTest(sessions: Map<string, IntradayBar[]>) {
  console.log("\n" + "=".repeat(78));
  console.log("TEST 4 — UP/DOWN-VOLUME PROXY FOR ORDER FLOW (5m bars, RTH sessions)");
  console.log("=".repeat(78));
  console.log(
    "NOT true CVD (no bid/ask trade classification available for free) — approximates it as +volume on up-closed bars, -volume on down-closed bars, cumulated over the first 2 hours (9:30-11:30 ET). Does the sign/size of that cumulative proxy predict the rest of the session's return?"
  );

  const REF_MINUTES_INTO_SESSION = 120;

  type VolObs = { date: string; cumDelta: number; restOfSessionReturnPct: number };
  const obs: VolObs[] = [];

  for (const [date, bars] of sessions) {
    const refIndex = Math.min(bars.length - 1, Math.floor(REF_MINUTES_INTO_SESSION / 5));
    let cumDelta = 0;
    for (let i = 0; i <= refIndex; i++) {
      const b = bars[i];
      if (b.close > b.open) cumDelta += b.volume;
      else if (b.close < b.open) cumDelta -= b.volume;
    }
    const refPrice = bars[refIndex].close;
    const sessionClose = bars[bars.length - 1].close;
    const restOfSessionReturnPct = ((sessionClose - refPrice) / refPrice) * 100;
    obs.push({ date, cumDelta, restOfSessionReturnPct });
  }

  const { train, test } = chronoSplit(obs);
  console.log(`\n${obs.length} RTH sessions (${train.length} train / ${test.length} test).`);

  for (const [label, set] of [["TRAIN", train], ["TEST", test]] as const) {
    console.log(`\n--- ${label} ---`);
    const corr = spearman(
      set.map((o) => o.cumDelta),
      set.map((o) => o.restOfSessionReturnPct)
    );
    console.log(`  Spearman correlation (cumulative up/down-volume proxy at 11:30 ET vs rest-of-session return): ${corr.toFixed(3)}`);
    const positive = set.filter((o) => o.cumDelta > 0);
    const negative = set.filter((o) => o.cumDelta < 0);
    reportReturns("  positive proxy delta -> rest-of-session return", positive.map((o) => o.restOfSessionReturnPct));
    reportReturns("  negative proxy delta -> rest-of-session return (negated so positive=continuation)", negative.map((o) => -o.restOfSessionReturnPct));
  }
}

// ---------- Test 5: 20EMA regime + prior-day range follow-through (daily bars) ----------

function computeEma(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period) return result;
  const multiplier = 2 / (period + 1);
  const seed = average(closes.slice(0, period))!;
  result[period - 1] = seed;
  for (let i = period; i < closes.length; i++) {
    result[i] = closes[i] * multiplier + (result[i - 1] as number) * (1 - multiplier);
  }
  return result;
}

function runEmaFollowThroughTest(dailyBars: DailyBarLite[]) {
  console.log("\n" + "=".repeat(78));
  console.log("TEST 5 — 20EMA REGIME + PRIOR-DAY RANGE FOLLOW-THROUGH (daily bars, deep history)");
  console.log("=".repeat(78));
  console.log(
    "Hypothesis as given: BULLISH signal if yesterday's close > yesterday's 20EMA (EMA \"bullish\") AND yesterday's close > the high of the day before that (strong follow-through). BEARISH signal if yesterday's close < yesterday's 20EMA AND yesterday's close < the low of the day before that. Otherwise INDETERMINATE. All known before today's open — testing whether it predicts today's move."
  );

  const closes = dailyBars.map((b) => b.close);
  const ema20 = computeEma(closes, 20);

  type Obs = {
    date: string;
    signal: "bullish" | "bearish" | "indeterminate";
    openToCloseReturnPct: number;
    closeToCloseReturnPct: number;
  };
  const obs: Obs[] = [];

  for (let i = 2; i < dailyBars.length; i++) {
    const emaYesterday = ema20[i - 1];
    if (emaYesterday === null) continue;

    const closeYesterday = dailyBars[i - 1].close;
    const highTwoAgo = dailyBars[i - 2].high;
    const lowTwoAgo = dailyBars[i - 2].low;

    const emaBullish = closeYesterday > emaYesterday;
    const emaBearish = closeYesterday < emaYesterday;
    const followThroughBullish = closeYesterday > highTwoAgo;
    const followThroughBearish = closeYesterday < lowTwoAgo;

    let signal: Obs["signal"] = "indeterminate";
    if (emaBullish && followThroughBullish) signal = "bullish";
    else if (emaBearish && followThroughBearish) signal = "bearish";

    const today = dailyBars[i];
    obs.push({
      date: today.date,
      signal,
      openToCloseReturnPct: ((today.close - today.open) / today.open) * 100,
      closeToCloseReturnPct: ((today.close - closeYesterday) / closeYesterday) * 100,
    });
  }

  const { train, test } = chronoSplit(obs);
  console.log(`\n${obs.length} days with a valid 20EMA reading (${train.length} train / ${test.length} test).`);

  for (const [label, set] of [["TRAIN", train], ["TEST", test]] as const) {
    console.log(`\n--- ${label} ---`);
    const bullish = set.filter((o) => o.signal === "bullish");
    const bearish = set.filter((o) => o.signal === "bearish");
    const indeterminate = set.filter((o) => o.signal === "indeterminate");
    console.log(
      `  signal distribution: bullish=${bullish.length} (${((bullish.length / set.length) * 100).toFixed(0)}%), bearish=${bearish.length} (${((bearish.length / set.length) * 100).toFixed(0)}%), indeterminate=${indeterminate.length} (${((indeterminate.length / set.length) * 100).toFixed(0)}%)`
    );

    const baselineUpRateOtC = winRate(set.map((o) => o.openToCloseReturnPct));
    const baselineUpRateCtC = winRate(set.map((o) => o.closeToCloseReturnPct));
    console.log(`  baseline (unconditional) up-day rate this period: open-to-close=${baselineUpRateOtC.toFixed(0)}%, close-to-close=${baselineUpRateCtC.toFixed(0)}% — compare signal hit-rates against THIS, not 50%`);

    reportReturns("  BULLISH signal -> today open-to-close return", bullish.map((o) => o.openToCloseReturnPct));
    reportReturns("  BULLISH signal -> today close-to-close return", bullish.map((o) => o.closeToCloseReturnPct));
    reportReturns("  BEARISH signal -> today open-to-close return (negated so positive=correct)", bearish.map((o) => -o.openToCloseReturnPct));
    reportReturns("  BEARISH signal -> today close-to-close return (negated so positive=correct)", bearish.map((o) => -o.closeToCloseReturnPct));
  }
}

// ---------- main ----------

async function main() {
  const refresh = process.argv.includes("--refresh");

  const dailyBars = await loadDailyBars(refresh);
  const intradayBars = await loadIntradayBars(refresh);
  const sessions = groupIntoRthSessions(intradayBars);

  console.log(`\n${sessions.size} usable RTH sessions from ${intradayBars.length} raw 5m bars.`);
  if (sessions.size < 20) {
    console.warn(`WARNING: only ${sessions.size} sessions available. Treat every intraday-test number below as illustrative, not reliable.`);
  }

  runGapTest(dailyBars);
  runVwapTest(sessions);
  runOrbTest(sessions);
  runVolumeDeltaTest(sessions);
  runEmaFollowThroughTest(dailyBars);

  console.log("\n" + "=".repeat(78));
  console.log("Done. Remember the bar: positive AND stable (median) on TEST, not just TRAIN, before trusting anything above.");
  console.log("=".repeat(78));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
