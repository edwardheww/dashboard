import { NextResponse } from "next/server";
import { getLastScan } from "@/lib/last-scan";

export async function GET() {
  try {
    const scan = getLastScan();
    return NextResponse.json({ scan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load the last scan.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
