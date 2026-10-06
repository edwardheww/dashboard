import { getDb } from "./db";
import type { SavedScan, StockResult } from "./types";

type ScanRow = {
  id: number;
  generated_at: string;
  results: string;
};

function mapRow(row: ScanRow): SavedScan {
  return {
    id: row.id,
    generatedAt: row.generated_at,
    results: JSON.parse(row.results) as StockResult[],
  };
}

/** No history — only the most recent scan is kept, persisted across restarts until the next run replaces it. */
export async function saveLastScan(generatedAt: string, results: StockResult[]): Promise<void> {
  const db = getDb();
  await db.prepare("DELETE FROM scans").run();
  await db.prepare("INSERT INTO scans (generated_at, results) VALUES (?, ?)").bind(generatedAt, JSON.stringify(results)).run();
}

export async function getLastScan(): Promise<SavedScan | null> {
  const db = getDb();
  const row = await db.prepare("SELECT * FROM scans ORDER BY id DESC LIMIT 1").first<ScanRow>();
  return row ? mapRow(row) : null;
}
