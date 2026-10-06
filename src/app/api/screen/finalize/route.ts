import { NextResponse } from "next/server";
import { synthesizeTopPicks } from "@/lib/groq";
import { finalizeScoring, type RawStockMetrics, type ScoredStock } from "@/lib/scoring";
import { saveLastScan } from "@/lib/last-scan";
import type { ScreenResponse, StockResult } from "@/lib/types";

const SHORTLIST_SIZE = 15;

function isRawStockMetrics(v: unknown): v is RawStockMetrics {
  return typeof v === "object" && v !== null && typeof (v as { symbol?: unknown }).symbol === "string";
}

/** Takes the combined per-symbol metrics from all /api/screen/bars batches, does the cross-sectional scoring + Groq synthesis + persistence — the part of the old single-shot /api/screen that only ever makes one outbound call (Groq), so it never risked the subrequest cap on its own. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const metrics = Array.isArray(body?.metrics) ? body.metrics.filter(isRawStockMetrics) : null;

  if (!metrics) {
    return NextResponse.json({ error: "metrics (array) is required." }, { status: 400 });
  }
  if (metrics.length < SHORTLIST_SIZE) {
    return NextResponse.json(
      { error: `Only ${metrics.length} stocks returned usable data (need at least ${SHORTLIST_SIZE}) — try again later.` },
      { status: 502 }
    );
  }

  try {
    const scored = finalizeScoring(metrics).sort((a, b) => b.composite - a.composite);
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
      await saveLastScan(response.generatedAt, results);
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
