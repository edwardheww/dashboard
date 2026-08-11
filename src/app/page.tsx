import { Nav } from "@/components/nav";
import { Screener } from "@/components/screener";

export default function Home() {
  return (
    <div className="flex flex-1 justify-center px-6 py-10 sm:px-10">
      <main className="flex w-full max-w-4xl flex-col gap-10">
        <header className="flex items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-lg font-medium uppercase tracking-wider text-ink">
              Nasdaq AI Screener
            </h1>
            <p className="mt-1 text-sm text-ink-dim">
              AI-scored 2-3 month trend/momentum setups from the Nasdaq-100,
              ranked with a traceable factor breakdown.
            </p>
          </div>
          <Nav />
        </header>

        <Screener />
      </main>
    </div>
  );
}
