import { NextResponse } from "next/server";
import { fetchNewsSentiment } from "@/lib/news-sentiment";
import { saveLastNewsSentiment } from "@/lib/last-news-sentiment";

export async function POST() {
  try {
    const data = await fetchNewsSentiment();

    try {
      saveLastNewsSentiment(data);
    } catch {
      // Persistence is a convenience, not the point of the request — a save
      // failure shouldn't turn a successful generate into a failed response.
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compute news sentiment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
