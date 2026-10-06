"use client";

import { useEffect, useState } from "react";
import type { StockResult } from "@/lib/types";
import type { RawStockMetrics } from "@/lib/scoring";
import { SCREENING_UNIVERSE } from "@/lib/universe";
import { formatDateTime } from "@/lib/format";
import { StockPanel } from "./stock-panel";
import { ResultsSkeleton } from "./results-skeleton";

type Status = "initializing" | "idle" | "loading" | "error" | "done";

// Cloudflare Workers (Free plan) caps outbound fetches at 50 per request —
// well under what a single-shot full-universe screen needs (~100+ Yahoo
// Finance calls). Splitting into batches means each one is its own request/
// invocation with its own fresh subrequest budget. 30 leaves comfortable
// headroom (30 bars fetches + 1 chunked quotes fetch = 31, vs. the 50 cap).
const BATCH_SIZE = 30;

function batchSymbols(): string[][] {
  const symbols = SCREENING_UNIVERSE.map((c) => c.symbol);
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE));
  }
  return batches;
}

/** ~30 concurrent outbound fetches per batch occasionally trips a transient failure (observed directly in testing, not hypothetical) — one retry covers it without masking a real, persistent error. */
async function fetchBarsBatch(symbols: string[]): Promise<RawStockMetrics[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/screen/bars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to fetch a batch of market data.");
      }
      const data = await res.json();
      return data.metrics as RawStockMetrics[];
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("unreachable");
}

export function Screener() {
  const [status, setStatus] = useState<Status>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StockResult[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const isLoading = status === "loading";

  // Load whatever the last run produced, so a page refresh (or restarting
  // the dev server) doesn't lose it — persisted server-side, not just in
  // this component's state.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/last-scan");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        if (data.scan) {
          setResults(data.scan.results);
          setGeneratedAt(data.scan.generatedAt);
          setStatus("done");
        } else {
          setStatus("idle");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runScreener() {
    setStatus("loading");
    setError(null);

    try {
      // Sequential, not Promise.all: running all batches concurrently means
      // up to ~24 simultaneous outbound Yahoo Finance fetches at once (6
      // per batch's internal concurrency × 4 batches), which was observed
      // directly to occasionally slow individual fetches enough to trip
      // Cloudflare's "Worker hung" watchdog and kill the whole batch. One
      // batch at a time is slower end-to-end but keeps each batch's actual
      // load (and reliability) the same as testing it in isolation.
      const batchResults: RawStockMetrics[][] = [];
      for (const symbols of batchSymbols()) {
        batchResults.push(await fetchBarsBatch(symbols));
      }

      const res = await fetch("/api/screen/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: batchResults.flat() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Screener run failed.");
      }

      const data = await res.json();
      setResults(data.results);
      setGeneratedAt(data.generatedAt);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Screener run failed.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={runScreener}
          disabled={isLoading}
          className="h-[42px] shrink-0 bg-accent px-6 text-sm font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {isLoading ? "Running…" : "Run screener"}
        </button>

        {status === "done" && generatedAt && (
          <span className="font-mono text-xs text-ink-faint tabular-nums">
            Last run {formatDateTime(generatedAt)}
          </span>
        )}

        {error && (
          <span className="text-sm text-loss" role="alert">
            {error}
          </span>
        )}
      </section>

      {(status === "initializing" || status === "loading") && <ResultsSkeleton />}

      {status === "done" && results && (
        <div className="flex flex-col gap-4">
          {results.map((stock, i) => (
            <div key={stock.ticker} className="animate-reveal" style={{ animationDelay: `${i * 90}ms` }}>
              <StockPanel stock={stock} />
            </div>
          ))}
        </div>
      )}

      {status === "idle" && (
        <div className="animate-fade-in border border-line p-8 text-center">
          <p className="text-sm text-ink-dim">
            Run the screener to surface today&apos;s top 3 Nasdaq-100
            trend/momentum setups, scored and ranked.
          </p>
        </div>
      )}
    </div>
  );
}
