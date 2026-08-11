import { getDb } from "./db";

export type TradeLogEntry = {
  id: number;
  entryDate: string;
  aiAnalysis: number | null;
  cvd: number | null;
  rr: number | null;
  chart5m15m: string | null;
  chart1m: string | null;
  createdAt: string;
};

export type NewTradeLogEntryInput = {
  entryDate: string;
  aiAnalysis?: number | null;
  cvd?: number | null;
  rr?: number | null;
  chart5m15m?: string | null;
  chart1m?: string | null;
};

type Row = {
  id: number;
  entry_date: string;
  ai_analysis: number | null;
  cvd: number | null;
  rr: number | null;
  chart_5m_15m: string | null;
  chart_1m: string | null;
  created_at: string;
};

function mapRow(row: Row): TradeLogEntry {
  return {
    id: row.id,
    entryDate: row.entry_date,
    aiAnalysis: row.ai_analysis,
    cvd: row.cvd,
    rr: row.rr,
    chart5m15m: row.chart_5m_15m,
    chart1m: row.chart_1m,
    createdAt: row.created_at,
  };
}

export function createTradeLogEntry(input: NewTradeLogEntryInput): TradeLogEntry {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO trade_log (entry_date, ai_analysis, cvd, rr, chart_5m_15m, chart_1m, created_at)
    VALUES (@entryDate, @aiAnalysis, @cvd, @rr, @chart5m15m, @chart1m, @createdAt)
  `);
  const result = stmt.run({
    entryDate: input.entryDate,
    aiAnalysis: input.aiAnalysis ?? null,
    cvd: input.cvd ?? null,
    rr: input.rr ?? null,
    chart5m15m: input.chart5m15m ?? null,
    chart1m: input.chart1m ?? null,
    createdAt: new Date().toISOString(),
  });
  return getTradeLogEntry(Number(result.lastInsertRowid))!;
}

export function getTradeLogEntry(id: number): TradeLogEntry | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM trade_log WHERE id = ?").get(id) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function listTradeLogEntries(): TradeLogEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM trade_log ORDER BY entry_date DESC, id DESC").all() as Row[];
  return rows.map(mapRow);
}

export function deleteTradeLogEntry(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM trade_log WHERE id = ?").run(id);
}
