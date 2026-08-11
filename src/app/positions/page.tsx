import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { PositionsTracker } from "@/components/positions/positions-tracker";

export default function PositionsPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-10 sm:px-10">
      <main className="flex w-full max-w-4xl flex-col gap-10">
        <header className="flex items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-lg font-medium uppercase tracking-wider text-ink">
              Positions
            </h1>
            <p className="mt-1 text-sm text-ink-dim">
              Manual trade log with live unrealized P&amp;L and a realized
              P&amp;L history.
            </p>
          </div>
          <Nav />
        </header>

        <Suspense fallback={<p className="text-sm text-ink-dim">Loading…</p>}>
          <PositionsTracker />
        </Suspense>
      </main>
    </div>
  );
}
