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
export function saveLastScan(generatedAt: string, results: StockResult[]): void {
  const db = getDb();
  db.prepare("DELETE FROM scans").run();
  db.prepare("INSERT INTO scans (generated_at, results) VALUES (?, ?)").run(generatedAt, JSON.stringify(results));
}

export function getLastScan(): SavedScan | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM scans ORDER BY id DESC LIMIT 1").get() as ScanRow | undefined;
  return row ? mapRow(row) : null;
}
