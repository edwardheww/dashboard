/**
 * Yahoo Finance's unofficial API — no API key, no signup, no daily quota.
 * Used by both the live app and the backtest script (single source of
 * truth for market data, so they can never drift out of sync on field
 * mapping or adjustment logic).
 *
 * Verified live (Aug 2026): quotes are genuine real-time data
 * (exchangeDataDelayedBy: 0, quoteSourceName "Nasdaq Real Time Price"),
 * not cached or delayed. One caveat: the CURRENT trading day's daily bar
 * (from getHistoricalBars) is live/unfinalized while the market is open —
 * its close is "last trade so far," not a settled closing price, and
 * volume is partial. Doesn't affect backtesting (always historical,
 * already-closed days) — only matters if something ever needs today's bar
 * specifically mid-session.
 */
import YahooFinance from "yahoo-finance2";
import type { DailyBar, Quote } from "./types";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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

/** Batched live quotes — Yahoo's quote() genuinely accepts many symbols per call, unlike FMP's paywalled batch endpoint. */
export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50));

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = await yf.quote(chunk);
        for (const q of quotes) {
          if (q.symbol && q.regularMarketPrice != null) {
            map.set(q.symbol, {
              symbol: q.symbol,
              price: q.regularMarketPrice,
              changePercentage: q.regularMarketChangePercent ?? 0,
              marketCap: q.marketCap ?? null,
              volume: q.regularMarketVolume ?? null,
            });
          }
        }
      } catch (err) {
        // this chunk's symbols just won't be in the map; callers treat missing quotes as "can't screen it"
        console.error("Yahoo quote() failed:", err instanceof Error ? err.message : err);
      }
    })
  );
  return map;
}

/**
 * Daily OHLCV bars, oldest first. Split-adjusted: Yahoo's chart() endpoint
 * returns raw OHLC plus a separately split/dividend-adjusted close
 * (adjclose). We derive an adjustment ratio per bar (adjclose/close) and
 * apply it to open/high/low too, so the whole OHLC series is internally
 * consistent — otherwise a stock split inside the window would show up as
 * a fake ~50-90% one-day crash in the raw close series.
 */
export async function getHistoricalBars(symbols: string[], tradingDays = 260): Promise<Map<string, DailyBar[]>> {
  const calendarDaysBack = Math.ceil(tradingDays * 1.45);
  const period1 = new Date();
  period1.setDate(period1.getDate() - calendarDaysBack);

  const map = new Map<string, DailyBar[]>();
  await mapWithConcurrency(symbols, 6, async (symbol) => {
    try {
      const result = await yf.chart(symbol, { period1, interval: "1d" });
      const bars: DailyBar[] = result.quotes
        .filter((q) => q.close != null && q.adjclose != null && q.open != null && q.high != null && q.low != null)
        .map((q) => {
          const adjRatio = q.adjclose! / q.close!;
          return {
            date: q.date.toISOString().slice(0, 10),
            open: q.open! * adjRatio,
            high: q.high! * adjRatio,
            low: q.low! * adjRatio,
            close: q.adjclose!,
            volume: q.volume ?? 0,
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date)); // API order isn't guaranteed; sort oldest-first ourselves
      map.set(symbol, bars);
    } catch (err) {
      console.error(`Yahoo chart() failed for ${symbol}:`, err instanceof Error ? err.message : err);
      map.set(symbol, []);
    }
  });
  return map;
}
