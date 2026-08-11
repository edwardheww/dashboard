import { FuturesNav } from "@/components/futures/futures-nav";
import { TradeLogView } from "@/components/futures/trade-log-view";

export default function TradeLogPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-10 sm:px-10">
      <main className="flex w-full max-w-5xl flex-col gap-10">
        <header className="flex items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-lg font-medium uppercase tracking-wider text-ink">
              Trade Log
            </h1>
            <p className="mt-1 text-sm text-ink-dim">
              Manual NQ trade journal — AI analysis score, CVD, RR, and chart screenshots.
            </p>
          </div>
          <FuturesNav />
        </header>

        <TradeLogView />
      </main>
    </div>
  );
}
