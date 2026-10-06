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
 *    title, up to MAX_HEADLINES raw candidates. Titles only, plus a 1-2
 *    sentence description/dek when the source provides one (CNBC's RSS
 *    does; MarketWatch's and GDELT's don't) — still not full article
 *    bodies, so this is a headline(+dek)-gist read, not a full-article
 *    analysis. Full-article text would mean either scraping (the same
 *    per-publisher ToS/paywall problem already declined for ForexFactory)
 *    or a paid full-text news API (the signup-gated-provider pattern this
 *    project moved away from with FMP) — deliberately not done here.
 *    These sources are general financial news, not a
 *    markets-only feed, so they include real noise (personal-finance
 *    columns, lifestyle pieces, unrelated single-company news) — Groq does
 *    a relevance/significance filter as step 1 of its own prompt (see
 *    buildPrompt) and returns the titles it kept via relevantHeadlines,
 *    matched back to the original headline objects by normalized title
 *    (not by index — an earlier version used indices, but the model
 *    sometimes wrote long numeric arrays without commas between entries,
 *    e.g. [3459151617...] instead of [3,4,5,9,15,16,17,...], which parsed
 *    as one enormous invalid number and silently dropped every headline;
 *    self-delimited title strings don't have that failure mode). Only the
 *    matched headlines survive into the stored/displayed `headlines` array
 *    and into Groq's own scoring reasoning. Still a single Groq call, not
 *    a separate filtering pass — no extra API usage.
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
// See src/lib/groq.ts's comment on this same swap (llama-3.3-70b-versatile
// was removed from Groq's lineup entirely, 2026-08-12).
const MODEL = "openai/gpt-oss-120b";
const SEARCH_QUERIES = ["QQQ", "Nasdaq", "Federal Reserve"];
// Raised from 25: relevance filtering now happens downstream (Groq selects
// which of these actually make the cut — see buildPrompt), so there's more
// room to cast a slightly wider net before that filter runs.
const MAX_HEADLINES = 35;

export type NewsHeadline = {
  title: string;
  publisher: string;
  publishedAt: string;
  description?: string;
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
    "STEP 1 — FILTER. The headlines below are pulled from general financial news sources and include plenty of noise: personal-finance-advice columns, lifestyle/consumer pieces, legal-settlement notices, local political races, foreign bond/mortgage auctions, and single-company news at companies that don't meaningfully move the Nasdaq-100. Before scoring anything, select ONLY the headlines that are RELEVANT to and of SIGNIFICANT IMPACT on Nasdaq-100/NQ futures — meaning they plausibly move broad tech/growth sentiment, not just narrate an unrelated story. This includes: Fed/rates/inflation/other macro data, major tech or AI-sector company news (earnings, product launches, large financing, executive/leadership moves) at companies that actually move the Nasdaq-100, broad market commentary or strategist calls from major banks, and market-moving geopolitical events (war, sanctions, major trade/policy shifts). When genuinely unsure whether a headline clears this bar, leave it out — a smaller, cleaner set beats a padded one.",
    "STEP 2 — SCORE. Base your score and summary STRICTLY on the headlines you selected in step 1 — ignore everything you filtered out, don't let it influence the read even subtly. Do not invent, assume, or recall specific events, numbers, or context not present in the headline titles and descriptions given. Some headlines include a 1-2 sentence description alongside the title (use it, it's real, sourced from the same feed), but most don't and many have title only — you never have a full article body, so if there's no description, or the description is still vague, treat it as vague rather than filling in plausible-sounding specifics.",
    "",
    "You also have two layers of supporting context (not something to filter, just background):",
    "PRICE CONTEXT — NQ=F's recent price action. Descriptive grounding only, not an independently predictive signal. Use it only to note whether price action agrees with or diverges from the news tone (e.g. price grinding higher while headlines stay neutral, or price weak despite upbeat headlines) — that divergence itself is often worth a sentence.",
    "MACRO CONTEXT — VIX and 10Y yield levels, if available. Also descriptive only. A rule-based version of scoring off macro levels alone (VIX/yields/dollar) was tested against real NQ direction and found to have no predictive edge — so do not treat these numbers as directional signals in their own right, only as color for the news-driven read.",
    "",
    "If, after filtering, few or no headlines qualify, say so honestly and score close to 50 (neutral) rather than manufacturing a confident read from noise or from excluded headlines.",
    "Score 0-100: 0 = strongly bearish, 50 = neutral/mixed, 100 = strongly bullish, based primarily on the aggregate tone and substance of the headlines you kept, adjusted only slightly by whether price/macro context corroborates or diverges from that tone.",
    "",
    "HEADLINES (most recent first):",
    JSON.stringify(headlines, null, 2),
    "",
    `PRICE CONTEXT: ${describePrice(context.price)}`,
    `MACRO CONTEXT: ${describeMacro(context.macro)}`,
    "",
    'Respond with strict JSON only, matching this shape: {"relevantHeadlines": ["<exact title of a headline you kept, copied verbatim from above>", "..."], "score": 62, "summary": "2-4 sentence plain-English read grounded only in the headlines you kept, noting any price/macro agreement or divergence", "keyDrivers": ["short phrase citing a specific kept-headline theme or a notable price/macro divergence", "..."]} — relevantHeadlines must be copied EXACTLY (character-for-character) from the titles given above, one string per headline you judged relevant and significant per step 1; keyDrivers should have 2-5 entries (fewer if relevantHeadlines is short).',
  ].join("\n");
}

type RawResponse = {
  score?: unknown;
  summary?: unknown;
  keyDrivers?: unknown;
  relevantHeadlines?: unknown;
};

function validateResponse(
  parsed: unknown
): { score: number; summary: string; keyDrivers: string[]; relevantTitles: string[] } {
  const raw = parsed as RawResponse | null;
  const score = Number(raw?.score);
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const keyDrivers = Array.isArray(raw?.keyDrivers) ? raw.keyDrivers.filter((d): d is string => typeof d === "string") : [];
  const relevantTitles = Array.isArray(raw?.relevantHeadlines)
    ? raw.relevantHeadlines.filter((t): t is string => typeof t === "string")
    : [];

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`Invalid score from Groq: ${raw?.score}`);
  }
  if (!summary) {
    throw new Error("Groq response missing summary.");
  }

  return { score, summary, keyDrivers, relevantTitles };
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
    // See groq.ts's comment on this same pair of params — same fix, and
    // this prompt needs a bigger ceiling since it can echo back up to
    // MAX_HEADLINES titles verbatim in relevantHeadlines.
    reasoning_effort: "low",
    max_completion_tokens: 3000,
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

  const { score, summary, keyDrivers, relevantTitles } = validateResponse(parsed);
  const relevantKeys = new Set(relevantTitles.map(normalizeTitle));
  const relevantHeadlines = headlines.filter((h) => relevantKeys.has(normalizeTitle(h.title)));

  return {
    generatedAt: new Date().toISOString(),
    score,
    summary,
    keyDrivers,
    headlines: relevantHeadlines,
    context,
  };
}
