import { getDb } from "./db";
import type { NewsSentiment, SentimentContext } from "./news-sentiment";

type Row = {
  id: number;
  generated_at: string;
  score: number;
  summary: string;
  key_drivers: string;
  headlines: string;
  context: string | null;
};

const EMPTY_CONTEXT: SentimentContext = { price: null, macro: null };

function mapRow(row: Row): NewsSentiment {
  return {
    generatedAt: row.generated_at,
    score: row.score,
    summary: row.summary,
    keyDrivers: JSON.parse(row.key_drivers),
    headlines: JSON.parse(row.headlines),
    context: row.context ? JSON.parse(row.context) : EMPTY_CONTEXT,
  };
}

/** No history — only the most recent read is kept, persisted across restarts until the next generate replaces it. Mirrors last-scan.ts. */
export function saveLastNewsSentiment(data: NewsSentiment): void {
  const db = getDb();
  db.prepare("DELETE FROM news_sentiment").run();
  db.prepare(
    "INSERT INTO news_sentiment (generated_at, score, summary, key_drivers, headlines, context) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    data.generatedAt,
    data.score,
    data.summary,
    JSON.stringify(data.keyDrivers),
    JSON.stringify(data.headlines),
    JSON.stringify(data.context)
  );
}

export function getLastNewsSentiment(): NewsSentiment | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM news_sentiment ORDER BY id DESC LIMIT 1").get() as Row | undefined;
  return row ? mapRow(row) : null;
}
