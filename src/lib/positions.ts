import { getDb } from "./db";
import type { NewPositionInput, Position, PositionUpdateInput, PositionWithPnl } from "./types";

type PositionRow = {
  id: number;
  ticker: string;
  shares: number;
  entry_price: number;
  entry_date: string;
  exit_price: number | null;
  exit_date: string | null;
  ai_target: number | null;
  thesis: string | null;
  notes: string | null;
  created_at: string;
};

function mapRow(row: PositionRow): Position {
  return {
    id: row.id,
    ticker: row.ticker,
    shares: row.shares,
    entryPrice: row.entry_price,
    entryDate: row.entry_date,
    exitPrice: row.exit_price,
    exitDate: row.exit_date,
    aiTarget: row.ai_target,
    thesis: row.thesis,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function createPosition(input: NewPositionInput): Position {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO positions (ticker, shares, entry_price, entry_date, ai_target, thesis, notes, created_at)
    VALUES (@ticker, @shares, @entryPrice, @entryDate, @aiTarget, @thesis, @notes, @createdAt)
  `);
  const result = stmt.run({
    ticker: input.ticker.toUpperCase(),
    shares: input.shares,
    entryPrice: input.entryPrice,
    entryDate: input.entryDate,
    aiTarget: input.aiTarget ?? null,
    thesis: input.thesis ?? null,
    notes: input.notes ?? null,
    createdAt: new Date().toISOString(),
  });
  return getPosition(Number(result.lastInsertRowid))!;
}

export function listPositions(): Position[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM positions ORDER BY entry_date DESC, id DESC").all() as PositionRow[];
  return rows.map(mapRow);
}

export function getPosition(id: number): Position | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as PositionRow | undefined;
  return row ? mapRow(row) : null;
}

/** Partial update — closing a position, correcting an exit already set, or editing notes are all just "whichever fields are present." */
export function updatePosition(id: number, input: PositionUpdateInput): Position | null {
  const db = getDb();
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.exitPrice !== undefined) {
    sets.push("exit_price = ?");
    values.push(input.exitPrice);
  }
  if (input.exitDate !== undefined) {
    sets.push("exit_date = ?");
    values.push(input.exitDate);
  }
  if (input.notes !== undefined) {
    sets.push("notes = ?");
    values.push(input.notes);
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE positions SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  }
  return getPosition(id);
}

export function deletePosition(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM positions WHERE id = ?").run(id);
}

export function withPnl(position: Position, currentPrice: number | null): PositionWithPnl {
  if (position.exitPrice !== null) {
    const pnl = (position.exitPrice - position.entryPrice) * position.shares;
    const pnlPct = ((position.exitPrice - position.entryPrice) / position.entryPrice) * 100;
    return { ...position, status: "closed", currentPrice: null, pnl, pnlPct };
  }

  if (currentPrice === null) {
    return { ...position, status: "open", currentPrice: null, pnl: null, pnlPct: null };
  }

  const pnl = (currentPrice - position.entryPrice) * position.shares;
  const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  return { ...position, status: "open", currentPrice, pnl, pnlPct };
}
