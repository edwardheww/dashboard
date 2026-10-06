import { NextResponse } from "next/server";
import { createTradeLogEntry, listTradeLogEntries } from "@/lib/trade-log";
import type { NewTradeLogEntryInput } from "@/lib/trade-log";

export async function GET() {
  try {
    const entries = await listTradeLogEntries();
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load trade log.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function isNumberOrNull(v: unknown): v is number | null | undefined {
  return v === undefined || v === null || typeof v === "number";
}

function isStringOrNull(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === "string";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<NewTradeLogEntryInput> | null;

  if (!body?.entryDate || typeof body.entryDate !== "string") {
    return NextResponse.json({ error: "entryDate is required." }, { status: 400 });
  }
  if (!isNumberOrNull(body.aiAnalysis) || (body.aiAnalysis != null && (body.aiAnalysis < 0 || body.aiAnalysis > 100))) {
    return NextResponse.json({ error: "aiAnalysis must be a number 0-100." }, { status: 400 });
  }
  if (!isNumberOrNull(body.rr)) {
    return NextResponse.json({ error: "rr must be a number." }, { status: 400 });
  }
  if (!isStringOrNull(body.chart)) {
    return NextResponse.json({ error: "chart must be a string (data URL)." }, { status: 400 });
  }

  const entry = await createTradeLogEntry({
    entryDate: body.entryDate,
    aiAnalysis: body.aiAnalysis ?? null,
    rr: body.rr ?? null,
    chart: body.chart ?? null,
  });

  return NextResponse.json({ entry }, { status: 201 });
}
