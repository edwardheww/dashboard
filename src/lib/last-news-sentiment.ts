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

/**
 * Every generate is kept (insert-only, no delete) — added 2026-08-12 after
 * a run of identical-looking scores across separate days turned out to be
 * unverifiable, because the old delete-then-insert pattern only ever kept
 * the latest row. getLastNewsSentiment() still just wants the newest one,
 * which "ORDER BY id DESC LIMIT 1" already gives regardless of how many
 * rows accumulate — listNewsSentimentHistory() is the new part.
 */
export async function saveLastNewsSentiment(data: NewsSentiment): Promise<void> {
  const db = getDb();
  await db
    .prepare(
      "INSERT INTO news_sentiment (generated_at, score, summary, key_drivers, headlines, context) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      data.generatedAt,
      data.score,
      data.summary,
      JSON.stringify(data.keyDrivers),
      JSON.stringify(data.headlines),
      JSON.stringify(data.context)
    )
    .run();
}

export async function getLastNewsSentiment(): Promise<NewsSentiment | null> {
  const db = getDb();
  const row = await db.prepare("SELECT * FROM news_sentiment ORDER BY id DESC LIMIT 1").first<Row>();
  return row ? mapRow(row) : null;
}

export async function listNewsSentimentHistory(limit = 30): Promise<NewsSentiment[]> {
  const db = getDb();
  const { results } = await db.prepare("SELECT * FROM news_sentiment ORDER BY id DESC LIMIT ?").bind(limit).all<Row>();
  return results.map(mapRow);
}
