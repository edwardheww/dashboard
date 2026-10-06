import { getDb } from "./db";

export type TradeLogEntry = {
  id: number;
  entryDate: string;
  aiAnalysis: number | null;
  rr: number | null;
  chart: string | null;
  createdAt: string;
};

export type NewTradeLogEntryInput = {
  entryDate: string;
  aiAnalysis?: number | null;
  rr?: number | null;
  chart?: string | null;
};

type Row = {
  id: number;
  entry_date: string;
  ai_analysis: number | null;
  rr: number | null;
  chart: string | null;
  created_at: string;
};

function mapRow(row: Row): TradeLogEntry {
  return {
    id: row.id,
    entryDate: row.entry_date,
    aiAnalysis: row.ai_analysis,
    rr: row.rr,
    chart: row.chart,
    createdAt: row.created_at,
  };
}

export async function createTradeLogEntry(input: NewTradeLogEntryInput): Promise<TradeLogEntry> {
  const db = getDb();
  const result = await db
    .prepare(`INSERT INTO trade_log (entry_date, ai_analysis, rr, chart, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(input.entryDate, input.aiAnalysis ?? null, input.rr ?? null, input.chart ?? null, new Date().toISOString())
    .run();
  return (await getTradeLogEntry(Number(result.meta.last_row_id)))!;
}

export async function getTradeLogEntry(id: number): Promise<TradeLogEntry | null> {
  const db = getDb();
  const row = await db.prepare("SELECT * FROM trade_log WHERE id = ?").bind(id).first<Row>();
  return row ? mapRow(row) : null;
}

export async function listTradeLogEntries(): Promise<TradeLogEntry[]> {
  const db = getDb();
  const { results } = await db.prepare("SELECT * FROM trade_log ORDER BY entry_date DESC, id DESC").all<Row>();
  return results.map(mapRow);
}

export async function deleteTradeLogEntry(id: number): Promise<void> {
  const db = getDb();
  await db.prepare("DELETE FROM trade_log WHERE id = ?").bind(id).run();
}
