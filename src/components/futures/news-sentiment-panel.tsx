"use client";

import { useEffect, useState } from "react";
import type { NewsSentiment, SentimentContext } from "@/lib/news-sentiment";
import { formatDateTime, formatSignedNumber } from "@/lib/format";

type Status = "initializing" | "idle" | "loading" | "error" | "done";

function scoreTone(score: number) {
  if (score >= 60) return "text-accent";
  if (score <= 40) return "text-loss";
  return "text-ink";
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 60 ? "bg-accent" : clamped <= 40 ? "bg-loss" : "bg-ink";

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-ink-faint">0</span>
      <div className="relative h-1.5 w-full max-w-xs bg-line">
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink-faint" />
        <div
          className={`absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 ${tone}`}
          style={{ left: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-ink-faint">100</span>
    </div>
  );
}

function ContextRow({ context }: { context: SentimentContext }) {
  const { price, macro } = context;
  const items: { label: string; value: string; tone: string }[] = [];

  if (price) {
    items.push({
      label: "NQ 1D",
      value: `${formatSignedNumber(price.change1d, 2)}%`,
      tone: price.change1d >= 0 ? "text-accent" : "text-loss",
    });
    items.push({
      label: "NQ 5D",
      value: `${formatSignedNumber(price.change5d, 2)}%`,
      tone: price.change5d >= 0 ? "text-accent" : "text-loss",
    });
  }
  if (macro?.vix) {
    items.push({ label: "VIX", value: macro.vix.value.toFixed(1), tone: "text-ink" });
  }
  if (macro?.yield10y) {
    items.push({ label: "10Y", value: `${macro.yield10y.value.toFixed(2)}%`, tone: "text-ink" });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wider text-ink-faint">{item.label}</span>
          <span className={`font-mono text-sm tabular-nums ${item.tone}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function NewsSentimentPanel() {
  const [status, setStatus] = useState<Status>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<NewsSentiment | null>(null);

  // Load whatever the last generate produced, so a refresh doesn't lose it —
  // this is a free DB read, not a Groq call, so it's fine to run on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/last-news-sentiment");
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (cancelled) return;
        if (json.sentiment) {
          setData(json.sentiment);
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

  async function generate() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/news-sentiment", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to load news sentiment.");
      }
      const json = await res.json();
      setData(json);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load news sentiment.");
      setStatus("error");
    }
  }

  const isBusy = status === "loading" || status === "initializing";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={generate}
          disabled={isBusy}
          className="h-[42px] shrink-0 whitespace-nowrap bg-accent px-6 text-sm font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading"
            ? "Reading headlines…"
            : status === "initializing"
              ? "Refresh"
              : data
                ? "Refresh"
                : "Generate news sentiment"}
        </button>
        {data && <span className="font-mono text-xs text-ink-faint tabular-nums">{formatDateTime(data.generatedAt)}</span>}
        {error && (
          <span className="text-sm text-loss" role="alert">
            {error}
          </span>
        )}
      </section>

      {status === "idle" && !data && (
        <div className="animate-fade-in border border-line p-8 text-center">
          <p className="text-sm text-ink-dim">
            Fetches today&apos;s headlines and asks Groq for a grounded read — costs a real API call, so this only
            runs when you ask it to, not automatically.
          </p>
        </div>
      )}

      {data && (
        <div key={data.generatedAt} className="animate-reveal border border-line p-5">
          <div className="flex flex-col gap-2">
            <p className={`font-mono text-4xl tabular-nums ${scoreTone(data.score)}`}>{Math.round(data.score)}</p>
            <ScoreMeter score={data.score} />
          </div>

          <p className="mt-4 max-w-prose text-sm text-ink-dim">{data.summary}</p>

          {data.keyDrivers.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {data.keyDrivers.map((d, i) => (
                <li key={i} className="text-xs text-ink-faint">
                  · {d}
                </li>
              ))}
            </ul>
          )}

          <ContextRow context={data.context} />

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Headlines</p>
            <div className="mt-2 flex flex-col gap-2">
              {data.headlines.map((h, i) => (
                <p key={i} className="text-sm text-ink-dim">
                  {h.title}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
