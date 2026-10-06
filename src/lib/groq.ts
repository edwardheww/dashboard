import Groq from "groq-sdk";
import type { ScoredStock } from "./scoring";

// llama-3.3-70b-versatile was removed from Groq's lineup (2026-08-12,
// confirmed via /v1/models — it's not deprecated-with-notice, just gone).
// openai/gpt-oss-120b is the closest capability tier still available on
// this account, verified directly against our exact json_object usage
// before switching. If this breaks again, check `curl .../v1/models`
// first — Groq has been rotating this lineup fast.
const MODEL = "openai/gpt-oss-120b";

export type AiPick = {
  symbol: string;
  rank: number;
  overallScore: number;
  priceTarget: number;
  thesis: string;
};

type RawPick = {
  symbol?: unknown;
  rank?: unknown;
  overallScore?: unknown;
  priceTarget?: unknown;
  thesis?: unknown;
};

function validatePicks(parsed: unknown, validSymbols: Set<string>): AiPick[] {
  const picks = (parsed as { picks?: RawPick[] } | null)?.picks;
  if (!Array.isArray(picks) || picks.length !== 3) {
    throw new Error("Groq response did not contain exactly 3 picks.");
  }

  const result = picks.map((p): AiPick => {
    const symbol = typeof p.symbol === "string" ? p.symbol.toUpperCase() : "";
    const rank = Number(p.rank);
    const overallScore = Number(p.overallScore);
    const priceTarget = Number(p.priceTarget);
    const thesis = typeof p.thesis === "string" ? p.thesis.trim() : "";

    if (!validSymbols.has(symbol)) {
      throw new Error(`Groq picked a symbol outside the shortlist: ${symbol}`);
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > 3) {
      throw new Error(`Invalid rank for ${symbol}: ${p.rank}`);
    }
    if (!Number.isFinite(overallScore) || overallScore < 0 || overallScore > 100) {
      throw new Error(`Invalid overallScore for ${symbol}: ${p.overallScore}`);
    }
    if (!Number.isFinite(priceTarget) || priceTarget <= 0) {
      throw new Error(`Invalid priceTarget for ${symbol}: ${p.priceTarget}`);
    }
    if (!thesis) {
      throw new Error(`Missing thesis for ${symbol}`);
    }

    return { symbol, rank, overallScore, priceTarget, thesis };
  });

  const ranks = new Set(result.map((p) => p.rank));
  if (ranks.size !== 3) {
    throw new Error("Groq picks did not use distinct ranks 1-3.");
  }
  const symbols = new Set(result.map((p) => p.symbol));
  if (symbols.size !== 3) {
    throw new Error("Groq picks did not use 3 distinct symbols.");
  }

  return result.sort((a, b) => a.rank - b.rank);
}

function buildPrompt(shortlist: ScoredStock[]): string {
  const candidates = shortlist.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    sector: s.sector,
    price: s.price,
    compositeQuantScore: s.composite,
    factors: Object.fromEntries(s.factors.map((f) => [f.key, f.score])),
    rawMetrics: s.raw,
  }));

  return [
    "You are a momentum analyst helping an experienced trader pick setups from a shortlist of Nasdaq-100 mega-cap candidates.",
    "Every pick is a position held roughly 2-3 months, matching the formation/holding horizon actually tested in the momentum literature (Jegadeesh & Titman; Moskowitz, Ooi & Pedersen 2012) — score and reason on that horizon, not on a swing-trade timeframe of days/weeks and not on a buy-and-hold multi-year view.",
    "House style is pure trend/momentum continuation: favor a stock with a structurally intact multi-month uptrend — see the trend factor and sma20/sma50/sma100/return1m/return6m in rawMetrics (price above sma50, sma50 above sma100, positive 6-month drift; sma20 and return1m give near-term color, e.g. a brief recent pause is fine within a longer uptrend). A stock with a broken or weak multi-month trend is not a fit, regardless of any other narrative.",
    "This is deliberately a single-factor screen: the trend factor is the only percentile-ranked score you're given (0-100, higher is better, computed relative to this same shortlist's peers). Other factors (proximity to 52-week high, volume) were tested via backtest and dropped — they didn't survive out-of-sample robustness checks, so don't reintroduce that kind of reasoning (e.g. don't reward or penalize based on distance from a 52-week high) unless the data given actually supports it.",
    "rawMetrics also includes atrPct (1-day average true range as % of price) and typicalMoveOverHoldPct (that scaled to the ~2-3 month hold via square-root-of-time) — these describe the WIDTH of a typical outcome band, not direction, and not a hard bound: momentum strategies have documented negative skew (Daniel & Moskowitz 2016) — occasional sharp downside moves bigger than this typical figure, concentrated in exactly this kind of trade. Don't treat typicalMoveOverHoldPct as a symmetric cap, especially on the downside.",
    "No news/headline/earnings-calendar data is provided — reason from the price data given. Don't invent or assume specific news events, earnings dates, or catalysts you weren't given.",
    "Pick exactly 3 stocks from this shortlist only — do not invent tickers outside it.",
    "Rank your 3 picks 1 (best) to 3. Assign each an overallScore 0-100 reflecting your holistic judgment of trend quality for this horizon — you may weigh the underlying trend metrics (sma structure vs. raw 6-month return) differently than a simple average, but stay grounded in the data given, not speculation.",
    "Estimate a realistic price target for the END of the ~2-3 month hold, in USD, informed by rawMetrics.typicalMoveOverHoldPct (rough sizing for how far this stock might move over the hold) and the strength of the trend itself (return6m, sma50 vs sma100 spread) — not a long-term fundamental valuation. Write a short, factual thesis (1-2 sentences, no hype language) naming the specific trend evidence driving the call.",
    "",
    "Shortlist:",
    JSON.stringify(candidates, null, 2),
    "",
    'Respond with strict JSON only, matching this shape: {"picks":[{"symbol":"TICK","rank":1,"overallScore":85,"priceTarget":123.45,"thesis":"..."}, ...exactly 3 entries]}',
  ].join("\n");
}

function apiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to .env.local (see .env.local.example)."
    );
  }
  return key;
}

export async function synthesizeTopPicks(shortlist: ScoredStock[]): Promise<AiPick[]> {
  const client = new Groq({ apiKey: apiKey() });
  const validSymbols = new Set(shortlist.map((s) => s.symbol));

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    // gpt-oss-120b is a reasoning model — its default reasoning_effort
    // ("medium") burns tokens on internal reasoning before writing the
    // answer, and with no explicit cap that occasionally ate the whole
    // budget before any JSON came out (hit this live: "max completion
    // tokens reached before generating a valid document"). "low" cut
    // reasoning tokens from 69 to 9 in testing; max_completion_tokens is
    // a belt-and-suspenders ceiling on top of that.
    reasoning_effort: "low",
    max_completion_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: buildPrompt(shortlist),
      },
    ],
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

  return validatePicks(parsed, validSymbols);
}
