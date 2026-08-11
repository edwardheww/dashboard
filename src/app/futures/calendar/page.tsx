import { FuturesNav } from "@/components/futures/futures-nav";
import { CalendarView } from "@/components/futures/calendar-view";

export default function CalendarPage() {
  return (
    <div className="flex flex-1 justify-center px-6 py-10 sm:px-10">
      <main className="flex w-full max-w-4xl flex-col gap-10">
        <header className="flex items-baseline justify-between gap-4 border-b border-line pb-5">
          <div>
            <h1 className="text-lg font-medium uppercase tracking-wider text-ink">
              Calendar
            </h1>
            <p className="mt-1 text-sm text-ink-dim">
              FOMC decision dates, plus whatever you log manually.
            </p>
          </div>
          <FuturesNav />
        </header>

        <CalendarView />
      </main>
    </div>
  );
}
