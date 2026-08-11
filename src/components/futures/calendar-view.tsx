"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@/lib/econ-calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKS_IN_GRID = 6;

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
  const [formDate, setFormDate] = useState(todayIso());
  const [formTime, setFormTime] = useState("");
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formDate) return setFormError("Date is required.");
    if (!formName.trim()) return setFormError("Event name is required.");

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/manual-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: formDate, time: formTime.trim(), name: formName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to add event.");
      }
      setFormDate(todayIso());
      setFormTime("");
      setFormName("");
      setFormOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/manual-calendar/${id}`, { method: "DELETE" });
    if (!res.ok) return;
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
            onClick={() => setFormOpen((o) => !o)}
            className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-accent"
          >
            {formOpen ? "Cancel" : "+ Add event"}
          </button>
        </div>
      </div>

      {formOpen && (
        <form onSubmit={handleAdd} className="animate-reveal flex flex-wrap items-end gap-3 border border-line bg-panel p-4">
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
          <div>
            <label className="text-[11px] uppercase tracking-wider text-ink-faint" htmlFor="cal-time">Time</label>
            <input
              id="cal-time"
              type="text"
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
              placeholder="8:30 AM ET"
              className={`${inputClass} mt-2 block w-32`}
            />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="text-[11px] uppercase tracking-wider text-ink-faint" htmlFor="cal-name">Event</label>
            <input
              id="cal-name"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="ISM Manufacturing PMI"
              className={`${inputClass} mt-2 block w-full`}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="h-[34px] bg-accent px-4 text-[11px] font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add"}
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
            return (
              <div
                key={cell.date}
                className={`flex min-h-[90px] flex-col gap-1 bg-panel p-2 ${isToday ? "border border-accent" : ""}`}
              >
                <span
                  className={`font-mono text-xs tabular-nums ${
                    !cell.inCurrentMonth ? "text-ink-faint/50" : isToday ? "font-medium text-accent" : "text-ink-dim"
                  }`}
                >
                  {cell.day}
                </span>
                {events === null ? null : (
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.map((event, i) => (
                      <div key={i} className="group flex items-center gap-1">
                        <span
                          title={`${event.name} — ${event.typicalTimeET}`}
                          className="truncate text-[10px] uppercase tracking-wide text-accent"
                        >
                          {event.name}
                        </span>
                        {event.source === "manual" && event.id !== undefined && (
                          <button
                            type="button"
                            onClick={() => handleDelete(event.id!)}
                            aria-label={`Delete ${event.name}`}
                            className="hidden shrink-0 text-[10px] leading-none text-ink-faint transition-colors duration-300 hover:text-loss group-hover:inline"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
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
