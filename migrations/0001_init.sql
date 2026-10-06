-- Initial schema, migrated from the better-sqlite3 runtime-created schema
-- (src/lib/db.ts, pre-Cloudflare). D1 doesn't run CREATE TABLE IF NOT EXISTS
-- at request time the way that did — schema changes are migration files
-- applied via `wrangler d1 migrations apply`, see package.json scripts.

CREATE TABLE positions (
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
);

CREATE TABLE scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  results TEXT NOT NULL
);

CREATE TABLE news_sentiment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  score REAL NOT NULL,
  summary TEXT NOT NULL,
  key_drivers TEXT NOT NULL,
  headlines TEXT NOT NULL,
  context TEXT
);

CREATE TABLE manual_calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE trade_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  ai_analysis REAL,
  cvd REAL,
  rr REAL,
  chart_5m_15m TEXT,
  chart_1m TEXT,
  created_at TEXT NOT NULL
);
