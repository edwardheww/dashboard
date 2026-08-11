import { NextResponse } from "next/server";
import { deleteTradeLogEntry } from "@/lib/trade-log";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isInteger(entryId)) {
    return NextResponse.json({ error: "Invalid trade log id." }, { status: 400 });
  }

  deleteTradeLogEntry(entryId);
  return NextResponse.json({ ok: true });
}
