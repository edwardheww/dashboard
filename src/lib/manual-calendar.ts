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

export async function createManualCalendarEvent(input: NewManualCalendarEventInput): Promise<ManualCalendarEvent> {
  const db = getDb();
  const result = await db
    .prepare("INSERT INTO manual_calendar_events (date, time, name, created_at) VALUES (?, ?, ?, ?)")
    .bind(input.date, input.time, input.name, new Date().toISOString())
    .run();
  return (await getManualCalendarEvent(Number(result.meta.last_row_id)))!;
}

export async function getManualCalendarEvent(id: number): Promise<ManualCalendarEvent | null> {
  const db = getDb();
  const row = await db.prepare("SELECT * FROM manual_calendar_events WHERE id = ?").bind(id).first<Row>();
  return row ? mapRow(row) : null;
}

export async function listManualCalendarEventsInRange(from: string, to: string): Promise<ManualCalendarEvent[]> {
  const db = getDb();
  const { results } = await db
    .prepare("SELECT * FROM manual_calendar_events WHERE date >= ? AND date <= ? ORDER BY date ASC, time ASC")
    .bind(from, to)
    .all<Row>();
  return results.map(mapRow);
}

export async function updateManualCalendarEvent(id: number, input: NewManualCalendarEventInput): Promise<ManualCalendarEvent | null> {
  const db = getDb();
  await db
    .prepare("UPDATE manual_calendar_events SET date = ?, time = ?, name = ? WHERE id = ?")
    .bind(input.date, input.time, input.name, id)
    .run();
  return getManualCalendarEvent(id);
}

export async function deleteManualCalendarEvent(id: number): Promise<void> {
  const db = getDb();
  await db.prepare("DELETE FROM manual_calendar_events WHERE id = ?").bind(id).run();
}
