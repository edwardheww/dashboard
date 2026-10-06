/**
 * Wire-style business headlines via RSS. Reuters and AP both killed their
 * public RSS feeds years ago (verified: their old feed URLs now redirect to
 * plain HTML), so MarketWatch and CNBC's top-news feeds stand in as the
 * free, no-signup equivalent. Hand-rolled regex extraction rather than an
 * XML library — these feeds are a flat <item><title>/<pubDate></item>
 * structure, not worth a full parser dependency for two fields.
 *
 * Uses MarketWatch's "Market Pulse" feed, not "Top Stories" — Top Stories
 * is MarketWatch's general homepage mix and includes a lot of personal-
 * finance-advice-column and lifestyle content with zero market relevance
 * (verified directly: a real pull included pieces on elder care, Social
 * Security claiming, CD investing, "moving tips that saved me $1,000").
 * Market Pulse is real-time market-moving news only. The Groq prompt in
 * news-sentiment.ts also does its own relevance/significance filtering on
 * top of this — this swap just reduces how much noise survives to be
 * filtered in the first place.
 *
 * `description` is included when the feed provides one — CNBC's does (a
 * real 1-2 sentence dek, verified directly against the raw feed), giving
 * Groq more than a bare title to work with; MarketWatch's <description> is
 * always empty in this feed, so those headlines just won't have one. This
 * is still title/dek-level, not full article text — see news-sentiment.ts's
 * doc comment for why full-article scraping isn't done here.
 */
export type RssHeadline = {
  title: string;
  publisher: string;
  publishedAt: string;
  description?: string;
};

const FEEDS: { url: string; publisher: string }[] = [
  { url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", publisher: "MarketWatch" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", publisher: "CNBC" },
];

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x2018;|&#8216;/g, "'")
    .replace(/&#x2019;|&#8217;/g, "'")
    .replace(/&#39;/g, "'")
    .trim();
}

function parseFeed(xml: string, publisher: string): RssHeadline[] {
  const headlines: RssHeadline[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml))) {
    const block = match[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(block);
    if (!titleMatch) continue;
    const title = decodeEntities(titleMatch[1]);
    if (!title) continue;

    const dateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
    const parsedDate = dateMatch ? new Date(dateMatch[1].trim()) : null;
    const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

    const descriptionMatch = /<description>([\s\S]*?)<\/description>/.exec(block);
    const description = descriptionMatch ? decodeEntities(descriptionMatch[1]) : "";

    headlines.push({ title, publisher, publishedAt, ...(description && { description }) });
  }
  return headlines;
}

export async function fetchRssHeadlines(): Promise<RssHeadline[]> {
  const results = await Promise.all(
    FEEDS.map(async ({ url, publisher }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return [];
        return parseFeed(await res.text(), publisher);
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}
