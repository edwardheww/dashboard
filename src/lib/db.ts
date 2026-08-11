import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "data", "positions.db");

// Next.js dev mode re-evaluates modules on hot reload; cache the connection
// on globalThis so we don't open a new handle to the same file each time.
const globalForDb = globalThis as unknown as { positionsDb?: Database.Database };

function createConnection(): Database.Database {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      shares REAL NOT NULL,
      entry_price REAL NOT NULL,
      entry_date TEXT NOT NULL,
      exit_price REAL,
      exit_date TEXT,
      ai_target REAL,
      thesis TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      results TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS news_sentiment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL,
      score REAL NOT NULL,
      summary TEXT NOT NULL,
      key_drivers TEXT NOT NULL,
      headlines TEXT NOT NULL
    )
  `);
  try {
    db.exec(`ALTER TABLE news_sentiment ADD COLUMN context TEXT`);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("duplicate column name")) throw err;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS manual_calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      ai_analysis REAL,
      cvd REAL,
      rr REAL,
      chart_5m_15m TEXT,
      chart_1m TEXT,
      created_at TEXT NOT NULL
    )
  `);

  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.positionsDb) {
    globalForDb.positionsDb = createConnection();
  }
  return globalForDb.positionsDb;
}
