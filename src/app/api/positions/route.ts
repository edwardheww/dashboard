import { NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";
import { createPosition, listPositions, withPnl } from "@/lib/positions";
import type { NewPositionInput } from "@/lib/types";

export async function GET() {
  try {
    const positions = await listPositions();
    const openTickers = [...new Set(positions.filter((p) => p.exitPrice === null).map((p) => p.ticker))];

    const quotes = openTickers.length > 0 ? await getQuotes(openTickers) : new Map();

    const withPnlList = positions.map((p) => withPnl(p, quotes.get(p.ticker)?.price ?? null));

    return NextResponse.json({ positions: withPnlList });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load positions.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<NewPositionInput> | null;

  if (!body?.ticker || typeof body.ticker !== "string") {
    return NextResponse.json({ error: "ticker is required." }, { status: 400 });
  }
  if (typeof body.shares !== "number" || body.shares <= 0) {
    return NextResponse.json({ error: "shares must be a positive number." }, { status: 400 });
  }
  if (typeof body.entryPrice !== "number" || body.entryPrice <= 0) {
    return NextResponse.json({ error: "entryPrice must be a positive number." }, { status: 400 });
  }
  if (!body.entryDate || typeof body.entryDate !== "string") {
    return NextResponse.json({ error: "entryDate is required." }, { status: 400 });
  }

  const position = await createPosition({
    ticker: body.ticker,
    shares: body.shares,
    entryPrice: body.entryPrice,
    entryDate: body.entryDate,
    aiTarget: typeof body.aiTarget === "number" ? body.aiTarget : null,
    thesis: typeof body.thesis === "string" ? body.thesis : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  });

  return NextResponse.json({ position }, { status: 201 });
}
