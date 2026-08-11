import { NextResponse } from "next/server";
import { getHistoricalBars, getQuotes } from "@/lib/yahoo";
import { synthesizeTopPicks } from "@/lib/groq";
import { SCREENING_UNIVERSE } from "@/lib/universe";
import { buildMetrics, scoreStocks, type ScoredStock } from "@/lib/scoring";
import { saveLastScan } from "@/lib/last-scan";
import type { ScreenResponse, StockResult } from "@/lib/types";

const SHORTLIST_SIZE = 15;

export async function POST() {
  try {
    const symbols = SCREENING_UNIVERSE.map((c) => c.symbol);

    const [quotes, bars] = await Promise.all([
      getQuotes(symbols),
      getHistoricalBars(symbols),
    ]);

    const metrics = buildMetrics(SCREENING_UNIVERSE, quotes, bars);
    if (metrics.length < SHORTLIST_SIZE) {
      throw new Error(
        `Only ${metrics.length}/${SCREENING_UNIVERSE.length} stocks in the universe returned usable data ` +
          `(need at least ${SHORTLIST_SIZE} for a meaningful shortlist) — try again later.`
      );
    }

    const scored = scoreStocks(metrics).sort((a, b) => b.composite - a.composite);
    const shortlist: ScoredStock[] = scored.slice(0, SHORTLIST_SIZE);

    const picks = await synthesizeTopPicks(shortlist);

    const bySymbol = new Map(shortlist.map((s) => [s.symbol, s]));
    const results: StockResult[] = picks.map((pick) => {
      const stock = bySymbol.get(pick.symbol);
      if (!stock) {
        throw new Error(`Groq picked ${pick.symbol}, which is missing from the shortlist map.`);
      }
      const upsidePct = ((pick.priceTarget - stock.price) / stock.price) * 100;

      return {
        rank: pick.rank,
        ticker: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        price: stock.price,
        overallScore: Math.round(pick.overallScore),
        priceTarget: pick.priceTarget,
        upsidePct,
        typicalMovePct: stock.raw.typicalMoveOverHoldPct,
        thesis: pick.thesis,
        factors: stock.factors,
      };
    });

    const response: ScreenResponse = {
      results,
      generatedAt: new Date().toISOString(),
    };

    try {
      saveLastScan(response.generatedAt, results);
    } catch {
      // Persistence is a convenience, not the point of the request — a save
      // failure shouldn't turn a successful scan into a failed response.
    }

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Screener run failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
