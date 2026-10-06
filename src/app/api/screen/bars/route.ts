import { NextResponse } from "next/server";
import { getHistoricalBars, getQuotes } from "@/lib/yahoo";
import { buildMetrics, computeRawMetrics } from "@/lib/scoring";
import { SCREENING_UNIVERSE } from "@/lib/universe";

/**
 * One batch of the screening universe — split out from a single /api/screen
 * call specifically so each request's outbound fetch count (one per symbol
 * for historical bars, plus one chunked quotes call) stays under Cloudflare
 * Workers' 50-subrequest-per-invocation cap on the Free plan. The client
 * (src/components/screener.tsx) calls this once per batch, then sends the
 * combined results to /api/screen/finalize. See CLAUDE.md for the full
 * rationale — this was a real production 502 ("Too many subrequests"), not
 * a preemptive optimization.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const symbols = Array.isArray(body?.symbols) ? body.symbols.filter((s: unknown): s is string => typeof s === "string") : null;

  if (!symbols || symbols.length === 0) {
    return NextResponse.json({ error: "symbols (non-empty string array) is required." }, { status: 400 });
  }

  try {
    const constituents = SCREENING_UNIVERSE.filter((c) => symbols.includes(c.symbol));

    const [quotes, bars] = await Promise.all([getQuotes(symbols), getHistoricalBars(symbols)]);

    const metrics = buildMetrics(constituents, quotes, bars).map(computeRawMetrics);

    if (metrics.length === 0) {
      // Surface a total batch failure instead of letting it vanish into a short list downstream.
      return NextResponse.json(
        { error: `Yahoo Finance returned no usable data for this batch (${quotes.size} quotes, ${[...bars.values()].filter((b) => b.length > 0).length} bar series of ${symbols.length} symbols).` },
        { status: 502 }
      );
    }

    return NextResponse.json({ metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch market data for this batch.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
