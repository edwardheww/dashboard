/**
 * Wire-style business headlines via RSS. Reuters and AP both killed their
 * public RSS feeds years ago (verified: their old feed URLs now redirect to
 * plain HTML), so MarketWatch and CNBC's top-news feeds stand in as the
 * free, no-signup equivalent. Hand-rolled regex extraction rather than an
 * XML library — these feeds are a flat <item><title>/<pubDate></item>
 * structure, not worth a full parser dependency for two fields.
 */
export type RssHeadline = {
  title: string;
  publisher: string;
  publishedAt: string;
};

const FEEDS: { url: string; publisher: string }[] = [
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", publisher: "MarketWatch" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", publisher: "CNBC" },
];

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
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

    headlines.push({ title, publisher, publishedAt });
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
