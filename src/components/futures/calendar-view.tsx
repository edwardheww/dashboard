"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@/lib/econ-calendar";
import { noTradeReasons } from "@/lib/no-trade-days";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKS_IN_GRID = 6;
// Each event type maps to its standard release time (BLS/BEA/Census/ISM/
// Fed/ECB scheduling conventions, all Eastern Time) — one fixed slot per
// type, so there's no separate time field to fill in. Two caveats worth
// knowing: "Powell" only has one true fixed slot, the FOMC press
// conference — standalone speeches/congressional testimony outside a
// scheduled FOMC meeting genuinely vary and aren't represented here.
// "Interest Rate" is treated as the Fed's own decision (same slot as
// FOMC) since that's what's overwhelmingly meant by that label in a
// US/NQ-futures context. Bank Holiday has no release time at all — market's
// just closed.
const EVENT_TIMES: Record<string, string> = {
  CPI: "8:30 AM ET",
  PPI: "8:30 AM ET",
  NFE: "8:30 AM ET",
  NFP: "8:30 AM ET",
  PCE: "8:30 AM ET",
  GDP: "8:30 AM ET",
  UN: "8:30 AM ET",
  PMI: "10:00 AM ET",
  ECB: "8:15 AM ET",
  FOMC: "2:00 PM ET",
  "FOMC Minutes": "2:00 PM ET",
  "Interest Rate": "2:00 PM ET",
  Powell: "2:30 PM ET",
  "Bank Holiday": "—",
  Others: "—",
};
const EVENT_TYPES = Object.keys(EVENT_TIMES);

const inputClass =
  "border border-line bg-void px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateKey(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  return d.toISOString().slice(0, 10);
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

type GridCell = {
  date: string;
  day: number;
  inCurrentMonth: boolean;
};

function buildGrid(year: number, month: number): GridCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysInPrevMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: GridCell[] = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    cells.push({ date: toDateKey(prevYear, prevMonth, day), day, inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toDateKey(year, month, day), day, inCurrentMonth: true });
  }

  const totalCells = WEEKS_IN_GRID * 7;
  let nextDay = 1;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  while (cells.length < totalCells) {
    cells.push({ date: toDateKey(nextYear, nextMonth, nextDay), day: nextDay, inCurrentMonth: false });
    nextDay++;
  }

  return cells;
}

export function CalendarView() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth());
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formDate, setFormDate] = useState(todayIso());
  const [formName, setFormName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const todayKey = new Date().toISOString().slice(0, 10);
  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setEvents(null);
      setError(null);
      try {
        const from = grid[0].date;
        const to = grid[grid.length - 1].date;
        const res = await fetch(`/api/econ-calendar?from=${from}&to=${to}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error ?? "Failed to load economic calendar.");
        setEvents(body.events);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load economic calendar.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [grid]);

  async function refresh() {
    try {
      const from = grid[0].date;
      const to = grid[grid.length - 1].date;
      const res = await fetch(`/api/econ-calendar?from=${from}&to=${to}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load economic calendar.");
      setEvents(body.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load economic calendar.");
    }
  }

  function openAddForm() {
    setEditingId(null);
    setFormDate(todayIso());
    setFormName("");
    setFormError(null);
    setFormOpen(true);
  }

  function startEdit(event: CalendarEvent) {
    if (event.id === undefined) return;
    setEditingId(event.id);
    setFormDate(event.date);
    setFormName(event.name);
    setFormError(null);
    setFormOpen(true);
  }

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormDate(todayIso());
    setFormName("");
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formDate) return setFormError("Date is required.");
    if (!formName) return setFormError("Event is required.");

    setFormError(null);
    setSubmitting(true);
    try {
      const url = editingId ? `/api/manual-calendar/${editingId}` : "/api/manual-calendar";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: formDate, time: EVENT_TIMES[formName] ?? "—", name: formName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Failed to ${editingId ? "update" : "add"} event.`);
      }
      resetForm();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Failed to ${editingId ? "update" : "add"} event.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/manual-calendar/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    if (editingId === id) resetForm();
    await refresh();
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events ?? []) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setViewYear(now.getUTCFullYear());
    setViewMonth(now.getUTCMonth());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goToPrevMonth}
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center border border-line text-ink-dim transition-colors duration-300 hover:border-accent hover:text-ink"
          >
            ‹
          </button>
          <h2 className="w-40 text-center text-sm font-medium uppercase tracking-wider text-ink">
            {monthLabel(viewYear, viewMonth)}
          </h2>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center border border-line text-ink-dim transition-colors duration-300 hover:border-accent hover:text-ink"
          >
            ›
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={goToToday}
            className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-accent"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => (formOpen ? resetForm() : openAddForm())}
            className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-accent"
          >
            {formOpen ? "Cancel" : "+ Add event"}
          </button>
        </div>
      </div>

      {formOpen && (
        <form onSubmit={handleSubmit} className="animate-reveal flex flex-wrap items-end gap-3 border border-line bg-panel p-4">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-ink-faint" htmlFor="cal-date">Date</label>
            <input
              id="cal-date"
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className={`${inputClass} mt-2 block`}
            />
          </div>
          <div className="min-w-[180px]">
            <label className="flex items-baseline justify-between text-[11px] uppercase tracking-wider text-ink-faint" htmlFor="cal-name">
              <span>Event</span>
              {formName && <span className="font-mono normal-case text-ink-faint">{EVENT_TIMES[formName]}</span>}
            </label>
            <select
              id="cal-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className={`${inputClass} mt-2 block w-full`}
            >
              <option value="" disabled>
                Select…
              </option>
              {EVENT_TYPES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="h-[34px] bg-accent px-4 text-[11px] font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {editingId ? (submitting ? "Saving…" : "Save") : submitting ? "Adding…" : "Add"}
          </button>
          {formError && (
            <span className="text-sm text-loss" role="alert">
              {formError}
            </span>
          )}
        </form>
      )}

      {error && (
        <div className="animate-fade-in border border-line p-8 text-center">
          <p className="text-sm text-loss">{error}</p>
        </div>
      )}

      {!error && (
        <div className="animate-fade-in grid grid-cols-7 gap-px border border-line bg-line">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="bg-panel px-2 py-2 text-center text-[11px] uppercase tracking-wider text-ink-faint">
              {wd}
            </div>
          ))}
          {grid.map((cell) => {
            const isToday = cell.date === todayKey;
            const dayEvents = eventsByDate.get(cell.date) ?? [];
            const blockReasons = events === null ? [] : noTradeReasons(cell.date, dayEvents);
            const isBlocked = blockReasons.length > 0;
            const isNonWeekendBlock = blockReasons.some((r) => r !== "Weekend");
            return (
              <div
                key={cell.date}
                title={isBlocked ? blockReasons.join(", ") : undefined}
                className={`flex min-h-[90px] flex-col gap-1 p-2 ${isBlocked ? "bg-void" : "bg-panel"} ${isToday ? "border border-accent" : ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      !cell.inCurrentMonth ? "text-ink-faint/50" : isToday ? "font-medium text-accent" : isBlocked ? "text-ink-faint" : "text-ink-dim"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {isNonWeekendBlock && cell.inCurrentMonth && (
                    <span className="text-[8px] uppercase tracking-wide text-loss/70">No trade</span>
                  )}
                </div>
                {events === null ? null : (
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.map((event, i) =>
                      event.source === "manual" && event.id !== undefined ? (
                        <div key={i} className="group flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(event)}
                            title={`Edit — ${event.name} at ${event.typicalTimeET}`}
                            className="truncate text-left text-[10px] uppercase tracking-wide text-accent transition-colors duration-300 hover:text-ink"
                          >
                            {event.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(event.id!)}
                            aria-label={`Delete ${event.name}`}
                            className="hidden shrink-0 text-[10px] leading-none text-ink-faint transition-colors duration-300 hover:text-loss group-hover:inline"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span
                          key={i}
                          title={`${event.name} — ${event.typicalTimeET}`}
                          className="truncate text-[10px] uppercase tracking-wide text-accent"
                        >
                          {event.name}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
