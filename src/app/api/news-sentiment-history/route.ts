import { NextResponse } from "next/server";
import { listNewsSentimentHistory } from "@/lib/last-news-sentiment";

export async function GET() {
  try {
    const history = await listNewsSentimentHistory();
    return NextResponse.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load news sentiment history.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
