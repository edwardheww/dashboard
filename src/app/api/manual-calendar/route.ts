import { NextResponse } from "next/server";
import { createManualCalendarEvent } from "@/lib/manual-calendar";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : "";
  const time = typeof body?.time === "string" ? body.time.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Event name is required." }, { status: 400 });
  }

  const event = createManualCalendarEvent({ date, time: time || "—", name });
  return NextResponse.json(event, { status: 201 });
}
