import { FuturesNav } from "@/components/futures/futures-nav";
import { NewsSentimentPanel } from "@/components/futures/news-sentiment-panel";

export default function FuturesPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-10 sm:px-10">
      <main className="flex w-full max-w-4xl flex-col gap-10">
        <header className="flex items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-lg font-medium uppercase tracking-wider text-ink">
              Futures
            </h1>
            <p className="mt-1 text-sm text-ink-dim">
              Same-day news sentiment read for Nasdaq-100 (NQ) — a research aid, not a validated signal.
            </p>
          </div>
          <FuturesNav />
        </header>

        <NewsSentimentPanel />
      </main>
    </div>
  );
}
