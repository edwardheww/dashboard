import Link from "next/link";
import type { StockResult } from "@/lib/types";
import { formatSignedPct, formatUsd } from "@/lib/format";
import { FactorBar } from "./factor-bar";

export function StockPanel({ stock }: { stock: StockResult }) {
  const upsidePositive = stock.upsidePct >= 0;

  const logTradeHref = `/positions?${new URLSearchParams({
    ticker: stock.ticker,
    entryPrice: String(stock.price),
    aiTarget: String(stock.priceTarget),
    thesis: stock.thesis,
  }).toString()}`;

  return (
    <article className="border border-line bg-panel">
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line p-5">
        <div className="flex items-start gap-4">
          <span className="pt-1 font-mono text-sm text-ink-faint tabular-nums">
            {String(stock.rank).padStart(2, "0")}
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className="font-mono text-xl font-medium text-ink">
                {stock.ticker}
              </h3>
              <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                {stock.sector}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-dim">{stock.name}</p>
            <p className="mt-3 max-w-prose text-sm text-ink-dim">{stock.thesis}</p>
          </div>
        </div>

        <div className="flex items-start gap-8 text-right">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">
              Last
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-ink-dim">
              {formatUsd(stock.price)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">
              Score
            </p>
            <p className="mt-1 font-mono text-2xl tabular-nums text-accent">
              {stock.overallScore}
            </p>
            <Link
              href={logTradeHref}
              className="mt-1 inline-block text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-accent"
            >
              Log trade →
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-4 p-5">
        {stock.factors.map((factor) => (
          <div key={factor.key} className="w-40">
            <FactorBar factor={factor} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-8 border-t border-line px-5 py-4">
        <div>
          <p
            className="text-[11px] uppercase tracking-wider text-ink-faint"
            title="Model-estimated target for the end of a ~2-3 month hold, not a sourced analyst consensus."
          >
            AI target (2-3mo)
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-ink">
            {formatUsd(stock.priceTarget)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">
            Upside
          </p>
          <p
            className={`mt-1 font-mono text-sm tabular-nums ${
              upsidePositive ? "text-accent" : "text-loss"
            }`}
          >
            {formatSignedPct(stock.upsidePct)}
          </p>
        </div>
        <div>
          <p
            className="text-[11px] uppercase tracking-wider text-ink-faint"
            title="Typical outcome-band width over the ~2-3 month hold (square-root-of-time scaled ATR) — not a symmetric bound. Momentum trades carry documented crash risk (Daniel & Moskowitz 2016): downside can exceed this more than upside."
          >
            Typical move (hold)
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-ink-dim">
            {stock.typicalMovePct !== null ? `${stock.typicalMovePct.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>
    </article>
  );
}
