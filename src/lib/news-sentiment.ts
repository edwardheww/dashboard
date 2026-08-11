/**
 * Multi-source sentiment score (0-100, 0=strongly bearish, 100=strongly
 * bullish) for Nasdaq-100 (NQ) futures — a qualitative research aid, NOT a
 * backtested signal. Different category from trend (real train/test
 * validation) or the rejected macro bias score (tested against real NQ
 * direction and failed): there's no way to backtest "was this paragraph's
 * read correct" at scale the way a number can be checked against history.
 * Treat the score as Groq's grounded synthesis of current headlines plus
 * descriptive price/macro context, not a measurement — the UI shows the
 * headlines and context it's based on for exactly this reason, so it's
 * checkable rather than taken on faith.
 *
 * Three layers feed the read:
 *  - News: Yahoo Finance search + MarketWatch/CNBC RSS + GDELT, deduped by
 *    title. Headline titles only (no full article bodies) — this is a
 *    headline-gist read, not a full-article analysis.
 *  - Price: NQ=F momentum (1d/5d change, position vs 20/50-day SMA) via the
 *    same Yahoo source the rest of the app uses.
 *  - Macro: VIX and 10Y yield level/change via FRED, if FRED_API_KEY is
 *    set — optional, silently omitted otherwise.
 * Price and macro are descriptive grounding only, never independently
 * weighted into a directional score — see fetchMacroSnapshot/fetchPriceContext
 * doc comments and RESEARCH.md for why a rule-based version of that was
 * already tried and rejected.
 */
import YahooFinance from "yahoo-finance2";
import Groq from "groq-sdk";
import { fetchRssHeadlines } from "./rss";
import { fetchGdeltHeadlines } from "./gdelt";
import { fetchMacroSnapshot, type MacroSnapshot } from "./fred";
import { fetchPriceContext, type PriceContext } from "./price-context";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const MODEL = "llama-3.3-70b-versatile";
const SEARCH_QUERIES = ["QQQ", "Nasdaq", "Federal Reserve"];
const MAX_HEADLINES = 25;

export type NewsHeadline = {
  title: string;
  publisher: string;
  publishedAt: string;
};

export type SentimentContext = {
  price: PriceContext | null;
  macro: MacroSnapshot | null;
};

export type NewsSentiment = {
  generatedAt: string;
  score: number;
  summary: string;
  keyDrivers: string[];
  headlines: NewsHeadline[];
  context: SentimentContext;
};

async function fetchYahooHeadlines(): Promise<NewsHeadline[]> {
  const results = await Promise.all(
    SEARCH_QUERIES.map((q) => yf.search(q, { newsCount: 10 }).catch(() => ({ news: [] })))
  );

  const headlines: NewsHeadline[] = [];
  for (const result of results) {
    for (const item of result.news ?? []) {
      if (!item.title) continue;
      headlines.push({
        title: item.title,
        publisher: item.publisher ?? "Yahoo Finance",
        publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime).toISOString() : new Date().toISOString(),
      });
    }
  }
  return headlines;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

async function fetchHeadlines(): Promise<NewsHeadline[]> {
  const [yahoo, rss, gdelt] = await Promise.all([
    fetchYahooHeadlines().catch(() => []),
    fetchRssHeadlines().catch(() => []),
    fetchGdeltHeadlines().catch(() => []),
  ]);

  const seen = new Set<string>();
  const headlines: NewsHeadline[] = [];
  for (const item of [...yahoo, ...rss, ...gdelt]) {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    headlines.push(item);
  }

  return headlines.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_HEADLINES);
}

function describePrice(price: PriceContext | null): string {
  if (!price) return "Not available.";
  const vsSma20 = price.sma20 !== null ? (price.lastClose >= price.sma20 ? "above" : "below") : "n/a";
  const vsSma50 = price.sma50 !== null ? (price.lastClose >= price.sma50 ? "above" : "below") : "n/a";
  return [
    `${price.symbol} last close ${price.lastClose.toFixed(2)}`,
    `1d change ${price.change1d >= 0 ? "+" : ""}${price.change1d.toFixed(2)}%`,
    `5d change ${price.change5d >= 0 ? "+" : ""}${price.change5d.toFixed(2)}%`,
    `price is ${vsSma20} its 20-day SMA and ${vsSma50} its 50-day SMA`,
  ].join(", ");
}

function describeMacro(macro: MacroSnapshot | null): string {
  if (!macro || (!macro.vix && !macro.yield10y)) return "Not available.";
  const parts: string[] = [];
  if (macro.vix) parts.push(`VIX ${macro.vix.value.toFixed(2)} (${macro.vix.change >= 0 ? "+" : ""}${macro.vix.change.toFixed(2)} vs prior reading)`);
  if (macro.yield10y) parts.push(`10Y Treasury yield ${macro.yield10y.value.toFixed(2)}% (${macro.yield10y.change >= 0 ? "+" : ""}${macro.yield10y.change.toFixed(2)}pp vs prior reading)`);
  return parts.join(", ");
}

function buildPrompt(headlines: NewsHeadline[], context: SentimentContext): string {
  return [
    "You are reading today's real financial news headlines, plus price and macro context, to give a trader a same-day market sentiment read ahead of trading Nasdaq-100 (NQ) futures.",
    "",
    "You have three layers of input:",
    "1. NEWS HEADLINES — the primary basis for your read. Base your score and summary STRICTLY on the headlines below (their titles and timing). Do not invent, assume, or recall specific events, numbers, or context not present in these headlines. You only have headline titles, not full articles — if a headline is vague, treat it as vague, don't fill in plausible-sounding specifics.",
    "2. PRICE CONTEXT — NQ=F's recent price action. This is descriptive grounding only, not an independently predictive signal. Use it only to note whether price action agrees with or diverges from the news tone (e.g. price grinding higher while headlines stay neutral, or price weak despite upbeat headlines) — that divergence itself is often worth a sentence.",
    "3. MACRO CONTEXT — VIX and 10Y yield levels, if available. Also descriptive only. A rule-based version of scoring off macro levels alone (VIX/yields/dollar) was tested against real NQ direction and found to have no predictive edge — so do not treat these numbers as directional signals in their own right, only as color for the news-driven read (e.g. \"headlines are calm and VIX is low, consistent readings\" vs \"headlines are calm but VIX is elevated, a discordant signal\").",
    "",
    "If the headlines are sparse, generic, or don't clearly point a direction, say so honestly and score close to 50 (neutral) rather than manufacturing a confident read.",
    "Score 0-100: 0 = strongly bearish, 50 = neutral/mixed, 100 = strongly bullish, based primarily on the aggregate tone and substance of the headlines, adjusted only slightly by whether price/macro context corroborates or diverges from that tone.",
    "",
    "NEWS HEADLINES (most recent first):",
    JSON.stringify(headlines, null, 2),
    "",
    `PRICE CONTEXT: ${describePrice(context.price)}`,
    `MACRO CONTEXT: ${describeMacro(context.macro)}`,
    "",
    'Respond with strict JSON only, matching this shape: {"score": 62, "summary": "2-4 sentence plain-English read grounded primarily in the headlines, noting any price/macro agreement or divergence", "keyDrivers": ["short phrase citing a specific headline theme or a notable price/macro divergence", "..."]} — keyDrivers should have 2-5 entries.',
  ].join("\n");
}

type RawResponse = {
  score?: unknown;
  summary?: unknown;
  keyDrivers?: unknown;
};

function validateResponse(parsed: unknown): { score: number; summary: string; keyDrivers: string[] } {
  const raw = parsed as RawResponse | null;
  const score = Number(raw?.score);
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const keyDrivers = Array.isArray(raw?.keyDrivers) ? raw.keyDrivers.filter((d): d is string => typeof d === "string") : [];

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`Invalid score from Groq: ${raw?.score}`);
  }
  if (!summary) {
    throw new Error("Groq response missing summary.");
  }

  return { score, summary, keyDrivers };
}

function apiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error("GROQ_API_KEY is not set. Add it to .env.local (see .env.local.example).");
  }
  return key;
}

export async function fetchNewsSentiment(): Promise<NewsSentiment> {
  const [headlines, price, macro] = await Promise.all([
    fetchHeadlines(),
    fetchPriceContext().catch(() => null),
    fetchMacroSnapshot().catch(() => null),
  ]);

  if (headlines.length === 0) {
    throw new Error("No headlines returned from any news source.");
  }

  const context: SentimentContext = { price, macro };

  const client = new Groq({ apiKey: apiKey() });
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: buildPrompt(headlines, context) }],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Groq returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq response was not valid JSON.");
  }

  const { score, summary, keyDrivers } = validateResponse(parsed);

  return {
    generatedAt: new Date().toISOString(),
    score,
    summary,
    keyDrivers,
    headlines,
    context,
  };
}
