import { NextResponse } from "next/server";
import { deleteManualCalendarEvent, updateManualCalendarEvent } from "@/lib/manual-calendar";

type RouteParams = { params: Promise<{ id: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

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

  const event = await updateManualCalendarEvent(eventId, { date, time: time || "—", name });
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json(event);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  await deleteManualCalendarEvent(eventId);
  return NextResponse.json({ ok: true });
}
