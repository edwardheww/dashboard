/**
 * User-entered calendar events (ISM PMI, Fed speeches, FOMC minutes, etc.)
 * — the categories with no free, ToS-clean API source (see econ-calendar.ts
 * doc comment). Typed in by hand after reading ForexFactory or similar
 * directly, rather than scraped or crawled.
 */
import { getDb } from "./db";

export type ManualCalendarEvent = {
  id: number;
  date: string; // YYYY-MM-DD
  time: string; // freeform, e.g. "10:00 AM ET"
  name: string;
  createdAt: string;
};

export type NewManualCalendarEventInput = {
  date: string;
  time: string;
  name: string;
};

type Row = { id: number; date: string; time: string; name: string; created_at: string };

function mapRow(row: Row): ManualCalendarEvent {
  return { id: row.id, date: row.date, time: row.time, name: row.name, createdAt: row.created_at };
}

export function createManualCalendarEvent(input: NewManualCalendarEventInput): ManualCalendarEvent {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO manual_calendar_events (date, time, name, created_at) VALUES (@date, @time, @name, @createdAt)"
  );
  const result = stmt.run({ ...input, createdAt: new Date().toISOString() });
  return getManualCalendarEvent(Number(result.lastInsertRowid))!;
}

export function getManualCalendarEvent(id: number): ManualCalendarEvent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM manual_calendar_events WHERE id = ?").get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function listManualCalendarEventsInRange(from: string, to: string): ManualCalendarEvent[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM manual_calendar_events WHERE date >= ? AND date <= ? ORDER BY date ASC, time ASC")
    .all(from, to) as Row[];
  return rows.map(mapRow);
}

export function deleteManualCalendarEvent(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM manual_calendar_events WHERE id = ?").run(id);
}
