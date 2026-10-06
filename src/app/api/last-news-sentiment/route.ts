import { NextResponse } from "next/server";
import { getLastNewsSentiment } from "@/lib/last-news-sentiment";

export async function GET() {
  try {
    const sentiment = await getLastNewsSentiment();
    return NextResponse.json({ sentiment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load the last news sentiment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
