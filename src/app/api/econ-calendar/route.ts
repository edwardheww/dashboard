import { NextRequest, NextResponse } from "next/server";
import { fetchEventsInRange } from "@/lib/econ-calendar";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from and to (YYYY-MM-DD) query params are required." }, { status: 400 });
  }

  try {
    const events = await fetchEventsInRange(from, to);
    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load economic calendar.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
