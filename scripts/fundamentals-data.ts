/**
 * Fetches and caches fundamentals data for the new-factor backtests
 * (scripts/backtest-newfactors.ts) — PEAD, Quality, Value.
 *
 * Yahoo's free API only exposes a short trailing window here, confirmed by
 * direct testing (requesting a 10-year range returns the same short window
 * regardless — this is a platform limit, not a query bug):
 *   - `earnings` module (quoteSummary): last 4 quarters, but with a precise
 *     reportedDate timestamp (when the market actually learned the number),
 *     which is what makes an event-study PEAD test possible at all.
 *   - `financials` module (fundamentalsTimeSeries): last 5 quarters.
 *   - `balance-sheet` module (fundamentalsTimeSeries): last 7 quarters.
 * See scripts/backtest-newfactors.ts's header for how this shapes the test
 * design for each factor, and RESEARCH.md for the full history (this was
 * built, used, deleted after Quality/Value were rejected on the mega-cap
 * universe, and rebuilt here to re-test them on Next Gen 100).
 */
import YahooFinance from "yahoo-finance2";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type EarningsEvent = {
  reportedDate: string;
  periodEndDate: string;
  surprisePct: number | null;
};

export type QuarterlyFinancials = {
  date: string;
  totalRevenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  dilutedEPS: number | null;
};

export type QuarterlyBalanceSheet = {
  date: string;
  totalDebt: number | null;
  stockholdersEquity: number | null;
};

export type SymbolFundamentals = {
  earnings: EarningsEvent[];
  financials: QuarterlyFinancials[];
  balanceSheet: QuarterlyBalanceSheet[];
};

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchOne(symbol: string): Promise<SymbolFundamentals> {
  const period1 = "2016-01-01";
  const period2 = new Date().toISOString().slice(0, 10);

  const [earningsRes, financialsRes, balanceSheetRes] = await Promise.all([
    yf.quoteSummary(symbol, { modules: ["earnings"] }).catch(() => null),
    yf
      .fundamentalsTimeSeries(symbol, { period1, period2, type: "quarterly", module: "financials" })
      .catch(() => [] as Array<Record<string, unknown>>),
    yf
      .fundamentalsTimeSeries(symbol, { period1, period2, type: "quarterly", module: "balance-sheet" })
      .catch(() => [] as Array<Record<string, unknown>>),
  ]);

  const quarterly = earningsRes?.earnings?.earningsChart?.quarterly ?? [];
  const earnings: EarningsEvent[] = quarterly
    .filter((q) => Boolean(q.reportedDate))
    .map((q) => ({
      reportedDate: new Date(q.reportedDate as unknown as string).toISOString().slice(0, 10),
      periodEndDate: new Date(q.periodEndDate as unknown as string).toISOString().slice(0, 10),
      surprisePct: q.surprisePct != null ? Number(q.surprisePct) : null,
    }));

  const financials: QuarterlyFinancials[] = (financialsRes as Array<Record<string, unknown>>).map((r) => ({
    date: new Date(r.date as string).toISOString().slice(0, 10),
    totalRevenue: (r.totalRevenue as number) ?? null,
    grossProfit: (r.grossProfit as number) ?? null,
    operatingIncome: (r.operatingIncome as number) ?? null,
    netIncome: (r.netIncome as number) ?? null,
    dilutedEPS: (r.dilutedEPS as number) ?? null,
  }));

  const balanceSheet: QuarterlyBalanceSheet[] = (balanceSheetRes as Array<Record<string, unknown>>).map((r) => ({
    date: new Date(r.date as string).toISOString().slice(0, 10),
    totalDebt: (r.totalDebt as number) ?? null,
    stockholdersEquity: (r.stockholdersEquity as number) ?? null,
  }));

  return { earnings, financials, balanceSheet };
}

/** Cache is keyed by universe name so mega-cap and Next Gen 100 fetches don't collide. */
export async function getFundamentals(universeName: string, symbols: string[], refresh = false): Promise<Map<string, SymbolFundamentals>> {
  const cachePath = path.join(process.cwd(), "data", `backtest-fundamentals-cache.${universeName}.json`);
  let cache: Record<string, SymbolFundamentals> = {};
  if (!refresh && existsSync(cachePath)) {
    console.log(`Loading cached fundamentals from ${cachePath} (pass --refresh to re-fetch)`);
    cache = JSON.parse(readFileSync(cachePath, "utf-8"));
  }

  const missing = symbols.filter((s) => !(s in cache));
  if (missing.length > 0) {
    console.log(`Fetching fundamentals for ${missing.length}/${symbols.length} symbols from Yahoo Finance...`);
    const fetched = await mapWithConcurrency(missing, 6, async (symbol) => {
      try {
        return await fetchOne(symbol);
      } catch {
        return { earnings: [], financials: [], balanceSheet: [] } as SymbolFundamentals;
      }
    });
    missing.forEach((symbol, idx) => {
      cache[symbol] = fetched[idx];
    });
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`Cached fundamentals to ${cachePath}`);
  }

  const result = new Map<string, SymbolFundamentals>();
  symbols.forEach((s) => result.set(s, cache[s] ?? { earnings: [], financials: [], balanceSheet: [] }));
  return result;
}
