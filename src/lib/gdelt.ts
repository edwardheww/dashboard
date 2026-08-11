/**
 * GDELT's free public DOC 2.0 API — no key required, but aggressively
 * rate-limited (roughly one request per 5s per source IP; over that, it
 * returns a plain-text throttle notice instead of JSON). Fine for this
 * feature's usage pattern (one request per manual button click), but
 * treated as fully best-effort: any failure or rate-limit here just means
 * GDELT's headlines are missing from that run, never a failed generate.
 */
export type GdeltHeadline = {
  title: string;
  publisher: string;
  publishedAt: string;
};

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const QUERY = '(nasdaq OR "federal reserve" OR "stock market") sourcelang:english';

function parseGdeltDate(seendate: string): string {
  // GDELT's seendate format: YYYYMMDDTHHMMSSZ
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi, s] = m;
  const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function fetchGdeltHeadlines(): Promise<GdeltHeadline[]> {
  try {
    const url = `${ENDPOINT}?query=${encodeURIComponent(QUERY)}&mode=artlist&maxrecords=10&format=json&sort=datedesc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return []; // rate-limit responses come back as a plain-text notice, not JSON
    }

    const articles = (data as { articles?: unknown[] })?.articles;
    if (!Array.isArray(articles)) return [];

    const headlines: GdeltHeadline[] = [];
    for (const a of articles) {
      const title = (a as { title?: unknown }).title;
      const seendate = (a as { seendate?: unknown }).seendate;
      const domain = (a as { domain?: unknown }).domain;
      if (typeof title !== "string" || !title) continue;
      headlines.push({
        title,
        publisher: typeof domain === "string" ? domain : "GDELT",
        publishedAt: typeof seendate === "string" ? parseGdeltDate(seendate) : new Date().toISOString(),
      });
    }
    return headlines;
  } catch {
    return [];
  }
}
