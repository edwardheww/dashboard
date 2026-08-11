import { NextResponse } from "next/server";
import { deleteManualCalendarEvent } from "@/lib/manual-calendar";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id." }, { status: 400 });
  }

  deleteManualCalendarEvent(eventId);
  return NextResponse.json({ ok: true });
}
