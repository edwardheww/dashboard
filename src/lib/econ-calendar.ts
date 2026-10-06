/**
 * Futures calendar: FOMC decision dates plus whatever you log manually.
 * No ForexFactory-style scraping: FF has no official API, actively blocks
 * automated requests, and its terms don't permit scraping.
 *
 * FRED-sourced releases (CPI/PPI/NFP/GDP/PCE/Retail Sales) were tried here
 * and removed (2026-08-11) — manual entry covers everything now, including
 * those. FRED itself is still used elsewhere (the news-sentiment macro
 * layer, src/lib/fred.ts) — just not for this calendar anymore.
 */
import { listManualCalendarEventsInRange } from "./manual-calendar";

export type CalendarEvent = {
  id?: number; // present only for manual events — needed to delete them
  name: string;
  date: string; // YYYY-MM-DD
  typicalTimeET: string;
  source: "fed" | "manual";
};

/**
 * Fed's official 2-day FOMC meeting schedule (decision/press-conference
 * falls on the second day, ~2:00 PM ET). Sourced from
 * https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 * (fetched 2026-08-11) — the Fed publishes each year's dates roughly a
 * year ahead and rarely revises them, but this list needs a manual refresh
 * once 2028 dates are published.
 */
const FOMC_MEETINGS: string[] = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
  "2027-01-27",
  "2027-03-17",
  "2027-04-28",
  "2027-06-09",
  "2027-07-28",
  "2027-09-15",
  "2027-10-27",
  "2027-12-08",
];

/** `from`/`to` are inclusive YYYY-MM-DD bounds — used to fill a calendar month grid (including the leading/trailing days from adjacent months). */
export async function fetchEventsInRange(from: string, to: string): Promise<CalendarEvent[]> {
  const fomcEvents: CalendarEvent[] = FOMC_MEETINGS.filter((date) => date >= from && date <= to).map((date) => ({
    name: "FOMC Rate Decision",
    date,
    typicalTimeET: "2:00 PM ET",
    source: "fed",
  }));

  const manualEvents: CalendarEvent[] = (await listManualCalendarEventsInRange(from, to)).map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    typicalTimeET: e.time,
    source: "manual",
  }));

  return [...fomcEvents, ...manualEvents].sort((a, b) => a.date.localeCompare(b.date));
}
