/** Helpers shared by the backtest scripts (stats, CLI flags, bars cache). */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DailyBar } from "../../src/lib/types";
import { getHistoricalBars } from "../../src/lib/yahoo";
import { HOLD_TRADING_DAYS, MIN_BARS_REQUIRED } from "../../src/lib/scoring";

/** Reads `--flag=value` from argv, or returns `fallback` if the flag is absent. */
export function argValue(flag: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.split("=")[1] : fallback;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Drops the `n` highest and `n` lowest items by `metric` — a standard outlier-robustness check. */
export function trimExtremes<T>(items: T[], metric: (item: T) => number, n: number): T[] {
  if (n <= 0 || items.length <= 2 * n) return items;
  const sorted = [...items].sort((a, b) => metric(a) - metric(b));
  return sorted.slice(n, sorted.length - n);
}

/** Maps values to 0-100 ranks (ties broken by order); a single value ranks 50. */
export function rankOf(values: number[]): number[] {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const n = values.length;
  const ranks = new Array(n).fill(50);
  sorted.forEach((item, rank) => {
    ranks[item.i] = n <= 1 ? 50 : (rank / (n - 1)) * 100;
  });
  return ranks;
}

export function spearman(xs: number[], ys: number[]): number {
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

/** Like a 0-100 rank, but null/non-finite entries are skipped and get the neutral 50. */
export function percentileRankNullable(values: (number | null)[]): number[] {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v));
  const sorted = [...present].sort((a, b) => a.v - b.v);
  const n = sorted.length;
  const byIndex = new Map<number, number>();
  sorted.forEach((item, rank) => byIndex.set(item.i, n <= 1 ? 50 : (rank / (n - 1)) * 100));
  return values.map((_, i) => byIndex.get(i) ?? 50);
}

/** Distances (in trading days) from the most recent bar at which each hold cycle starts, oldest first. */
export function generateRebalancePoints(barsMap: Map<string, DailyBar[]>): number[] {
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

/** Loads daily bars from `cachePath` unless `refresh` is set or the cache is missing, in which case it fetches from Yahoo and rewrites the cache. */
export async function loadBars(
  cachePath: string,
  symbols: string[],
  refresh: boolean,
  lookbackTradingDays = 630,
): Promise<Map<string, DailyBar[]>> {
  if (!refresh && existsSync(cachePath)) {
    console.log(`Loading cached bars from ${cachePath} (pass --refresh to re-fetch)`);
    const raw = JSON.parse(readFileSync(cachePath, "utf-8")) as Record<string, DailyBar[]>;
    return new Map(Object.entries(raw));
  }

  console.log(`Fetching ~${lookbackTradingDays} trading days of history for ${symbols.length} symbols from Yahoo Finance...`);
  const barsMap = await getHistoricalBars(symbols, lookbackTradingDays);

  const covered = [...barsMap.values()].filter((b) => b.length >= MIN_BARS_REQUIRED).length;
  console.log(`Got usable history for ${covered}/${symbols.length} symbols.`);

  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(Object.fromEntries(barsMap)));
  console.log(`Cached bars to ${cachePath}`);

  return barsMap;
}
