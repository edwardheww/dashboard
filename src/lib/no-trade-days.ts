/**
 * No-trade-day rules for the futures calendar grid — pure date/event-name
 * logic, no fetching, safe to import into a client component.
 *
 * What's automatic vs. what needs a manual calendar entry:
 * - Weekends: always automatic (pure date math).
 * - FOMC statement days: automatic — matches the hardcoded FOMC schedule's
 *   "FOMC Rate Decision" event (see econ-calendar.ts), which already shows
 *   up on the calendar with no manual entry needed.
 * - CPI / NFP / NFE / PCE / FOMC Minutes releases: NOT automatic. FRED-
 *   sourced release dates were removed from this calendar (see
 *   econ-calendar.ts's doc comment) — these only block a day if you've
 *   manually logged that event via "+ Add event" on that date.
 * - Holiday-adjacent days: automatic, from the hardcoded US market holiday
 *   table below.
 */

type Holiday = {
  date: string; // YYYY-MM-DD, the market's actual observed closure date
  name: string;
  major: boolean; // Christmas / New Year's / Thanksgiving / July 4th — gets the day-before-AND-day-of rule
};

/**
 * NYSE/Nasdaq market holidays, 2026-2027 (matches FOMC_MEETINGS' coverage
 * in econ-calendar.ts). Observed dates verified against nyse.com/markets/
 * hours-calendars (fetched 2026-08-11) and cross-checked by computing each
 * date's actual weekday — e.g. July 4 2026 is a Saturday, so the market
 * observes it Friday July 3; July 4 2027 is a Sunday, observed Monday
 * July 5. Needs a manual refresh once 2028 dates are published, same as
 * FOMC_MEETINGS.
 */
const US_MARKET_HOLIDAYS: Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day", major: true },
  { date: "2026-01-19", name: "MLK Day", major: false },
  { date: "2026-02-16", name: "Presidents Day", major: false },
  { date: "2026-04-03", name: "Good Friday", major: false },
  { date: "2026-05-25", name: "Memorial Day", major: false },
  { date: "2026-06-19", name: "Juneteenth", major: false },
  { date: "2026-07-03", name: "Independence Day (observed)", major: true },
  { date: "2026-09-07", name: "Labor Day", major: false },
  { date: "2026-11-26", name: "Thanksgiving", major: true },
  { date: "2026-12-25", name: "Christmas", major: true },
  { date: "2027-01-01", name: "New Year's Day", major: true },
  { date: "2027-01-18", name: "MLK Day", major: false },
  { date: "2027-02-15", name: "Presidents Day", major: false },
  { date: "2027-03-26", name: "Good Friday", major: false },
  { date: "2027-05-31", name: "Memorial Day", major: false },
  { date: "2027-06-18", name: "Juneteenth (observed)", major: false },
  { date: "2027-07-05", name: "Independence Day (observed)", major: true },
  { date: "2027-09-06", name: "Labor Day", major: false },
  { date: "2027-11-25", name: "Thanksgiving", major: true },
  { date: "2027-12-24", name: "Christmas (observed)", major: true },
];

const HIGH_IMPACT_RELEASE_NAMES = new Set(["CPI", "NFP", "NFE", "PCE", "FOMC Minutes"]);
const FOMC_STATEMENT_NAMES = new Set(["FOMC", "FOMC Rate Decision"]);

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function isWeekend(dateKey: string): boolean {
  const wd = weekday(dateKey);
  return wd === 0 || wd === 6;
}

/** Returns every no-trade reason that applies to this date — empty array means it's a normal trading day. */
export function noTradeReasons(dateKey: string, eventsThatDay: { name: string }[]): string[] {
  const reasons: string[] = [];

  if (isWeekend(dateKey)) reasons.push("Weekend");

  if (eventsThatDay.some((e) => FOMC_STATEMENT_NAMES.has(e.name))) {
    reasons.push("FOMC statement day");
  }
  for (const event of eventsThatDay) {
    if (HIGH_IMPACT_RELEASE_NAMES.has(event.name)) reasons.push(`${event.name} release`);
  }

  const majorHoliday = US_MARKET_HOLIDAYS.find((h) => h.major && (h.date === dateKey || addDays(h.date, -1) === dateKey));
  if (majorHoliday) {
    reasons.push(majorHoliday.date === dateKey ? majorHoliday.name : `Day before ${majorHoliday.name}`);
  }

  const longWeekendHoliday = US_MARKET_HOLIDAYS.find((h) => weekday(h.date) === 1 && addDays(h.date, -3) === dateKey);
  if (longWeekendHoliday) reasons.push(`Long weekend before ${longWeekendHoliday.name}`);

  return reasons;
}
