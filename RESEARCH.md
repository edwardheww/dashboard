# Factor research log

A running ledger of every scoring factor considered for the screener, what
happened when it was tested, and why. This exists because a lot of that
history only ever lived in chat context — several rejected factors' actual
backtest code was written, run, reported, and then deleted per the standing
"remove what's ruled out" practice, and was **never committed to git**, so
it isn't recoverable from history either. This file is what's left. Update
it whenever a factor is proposed, tested, or ruled out — don't let this
happen again.

## The bar for promotion

A factor only gets added to `src/lib/scoring.ts` (and from there, the live
app) if it clears the same bar trend cleared:

- Positive **and stable** — median-based, not just mean-based — on a
  held-out test period, not just in-sample.
- Survives outlier-robustness checks (exclude single best cycle, symmetric
  trim) — not carried by 1-2 extreme events.
- Backed by verified (not recalled) published research, or at minimum not
  contradicted by it.

Nothing described below as "rejected" or "dead end" has been wired into the
live app. Trend is currently the only factor that has ever cleared this bar.

## Live

### Trend / momentum — the only surviving factor

`trendRaw = average([price/sma50-1, sma50/sma100-1, return6m])`, percentile-ranked.
6-12 month formation window, matching Jegadeesh & Titman and Moskowitz, Ooi
& Pedersen (2012). Live app uses the Nasdaq-100 mega-cap universe, where a
fresh check (2026-08-08) confirms trend is robust: positive median excess
in train and test, and — unlike everything below — survives outlier
exclusion. On Next Gen 100, trend's median excess is also positive at
baseline (train +3.47%, test +1.81%) but **not robust**: excluding the
single best test-period cycle flips test median excess negative (+1.81% →
-0.53%). Worth knowing before reading the Next Gen 100 factor re-test below
— every "beats trend" comparison there is beating a fragile baseline. See
`src/lib/scoring.ts`'s header comment for the up-to-date technical
definition — this file tracks the *research history*, that file tracks the
*current implementation*.

## Confirmed diagnostics (not a factor — a robustness check on trend itself)

| Diagnostic | Method | Citation | Finding |
|---|---|---|---|
| Overnight vs. intraday decomposition of trend's own returns | Decomposed each realized trend-only pick's open-to-open trade return into its overnight (close-to-open) and intraday (open-to-close) leg products, same 43 cycles, compared to the universe average | Lou, Polk & Skouras (2019, *JFE*) | Confirmed strongly on this universe: trend's excess return over the benchmark is overwhelmingly overnight-driven, in both periods — TRAIN excess +7.04pp overnight vs. +0.51pp intraday; TEST +18.14pp overnight vs. +2.24pp intraday. Doesn't change anything (trend already captures this implicitly via its close-to-close inputs), but it's a genuine independent confirmation that trend's edge here matches the paper's general pattern for momentum strategies. |

## Rejected (built, backtested, failed)

| Factor | Method tested | Key citation(s) | Why rejected |
|---|---|---|---|
| Proximity to 52-week high | Linear-blend grid search + gated sequential filter, vs. Next Gen 100 and mega-cap universes | George & Hwang (2004) | Didn't survive outlier-robustness checks on either universe. Also see the "dead end" pullback-timing entry below — later literature review found this is expected: reversal-adjacent effects don't hold for high-turnover, high-proximity-to-high stocks like ours. |
| Volume | Linear-blend grid search, same universes as above | — | Didn't survive outlier-robustness checks. |
| Low-volatility | Linear blend (full grid) + gated secondary filter (trend picks shortlist, low-vol re-ranks within it) | Ang, Hodrick, Xing & Zhang (2006) | 0/9 gated configs beat trend-only on both train and test. Targets the same volatile, spike-prone names (TSLA, MSTR, NVDA...) that drive trend's return — screens out what's working rather than refining it. |
| Stability / MAX-effect | Same two methodologies as low-vol, tested together | Bali, Cakici & Whitelaw (2011) | Same failure mode as low-vol — same names, same result. |
| PEAD (post-earnings-announcement drift), standalone event study | Hardened event study: benchmark-relative (excess) returns, outlier-robustness (exclude-best, symmetric trim), dose-response by surprise magnitude, large-surprise-only subsample (`\|surprise%\|>5`, threshold fixed a priori) | Bernard & Thomas (1989) | The naive baseline didn't survive trimming (train spread collapsed from +5.8pp to +0.7pp after dropping ~5% of events). The large-surprise-only subsample WAS robust (+14.1pp train, +14.1pp test, consistent) — but see the next row for why that didn't matter. Effect turned out to be a **post-miss drift**, not post-beat (positive-surprise excess return was only ~1%; almost all the spread came from negative-surprise underperformance). |
| PEAD as a live-app filter | Trend's top-3 picks, with vs. without excluding any candidate that had a >5% earnings miss in the prior 55 trading days. Same 43 cycles as the trend backtest. | — | **0/43 cycles ever triggered the filter.** A large recent miss craters a stock's price, which directly tanks the same inputs trend already selects on (price/sma50, sma50/sma100, 6mo return) — trend was already implicitly avoiding these stocks as a side effect. The standalone PEAD signal is real-ish but fully redundant with trend on this universe, not incremental to it. |
| Quality (profitability + safety) | Pooled cross-sectional Spearman correlation + tercile spread, `financials`/`balance-sheet` fundamentals, train/test split | Novy-Marx (2013)-adjacent | Correlation sign-flipped between train (-0.149) and test (+0.177) — textbook noise. Full-sample correlation ~0. Data depth (~5 quarters, ~15mo) was flagged as a likely-fatal constraint before testing; result confirmed it. |
| Value (earnings yield) | Same pooled cross-sectional design as Quality | — | Same sign-flip failure: +0.149 train, -0.162 test. Same data-depth constraint as Quality. |
| Overnight momentum | Linear-blend weight grid (w=0.0-1.0 step 0.1) with trend, weight chosen on TRAIN median excess, evaluated on TEST at that weight | Lou, Polk & Skouras (2019, *JFE*) | Best TRAIN weight was w=1.0 (pure trend) — every blended weight in between (0.1-0.9) UNDERPERFORMED both pure trend AND pure candidate alone. Standalone (w=0.0) had a weak positive signal (train median +1.18%, test +2.89%) but well below trend's (+2.12%/+12.87%). |
| Residual (idiosyncratic) momentum | Same blend-grid methodology; OLS beta vs. QQQ over a trailing 252-day window, residual cumulated over the 126-day formation window | Blitz, Huij & Martens (2011, *J. Empirical Finance*) | Pooled Spearman correlation between trend's composite and this factor's raw value: **0.629** — highly redundant with trend on this universe (mega-cap tech betas don't vary enough for the market-adjustment to meaningfully differentiate stocks). Grid was flat/identical to pure trend from w=0.1 to 1.0 as a direct consequence. Standalone (w=0.0): test median +4.60% vs. trend's +12.87% — clearly worse alone too. |

## Next Gen 100 re-test (2026-08-08)

Every factor rejected on mega-cap was re-tested against the Next Gen 100
universe too, on the theory that mega-cap's unusual pricing efficiency
might have been masking a real effect elsewhere (see the reversal
literature in the dead-ends table — anomalies are generally strongest in
smaller, less-covered names). All five failed there as well; PEAD's sign
even flipped.

| Factor | Next Gen 100 result | Verdict |
|---|---|---|
| PEAD | Correlation NEGATIVE in both periods (train -0.093, test -0.074 excess) — opposite sign from mega-cap's positive result. No dose-response monotonicity in either period. | Rejected — doesn't just fail to replicate, it inverts. |
| Quality | Same sign-flip failure as mega-cap: train -0.118, test +0.092. | Rejected. |
| Value | Weak but same-sign correlation both periods (train +0.017, test +0.063); tercile median spread looked promising at baseline (train +6.19pp, test +4.96pp). **Failed a targeted robustness check**: a symmetric 5% trim collapsed train's spread to near-zero (+0.57pp median, mean flipped negative), while test happened to hold up (+3.37pp). A signal that only survives trimming in the confirmation half, not the training half, isn't a validated finding — it's the outlier-robustness bar everything else in this file was held to, applied here too. | Rejected. |
| Overnight momentum | Standalone median flips sign between periods (train -4.52%, test +1.39%), worse than trend in both. Blend grid mixed/mostly negative. | Rejected. |
| Residual momentum | Same redundancy-with-trend pattern as mega-cap (blend grid ~flat across most weights). Standalone also flips sign (train -4.19%, test +7.48%) and is highly sensitive to even a small trend weighting (w=0.1 test result far worse than w=0.0). | Rejected. |

Bonus diagnostic: the overnight/intraday decomposition of trend's own Next
Gen 100 returns shows the same overnight-dominant pattern as mega-cap, even
more extreme in test (overnight excess +9.44pp vs. intraday excess
**-8.04pp** — trend's Next Gen 100 picks lose money intraday on average).
Directionally consistent with Lou/Polk/Skouras, though this is decomposing
an already-fragile signal (see the Live section above).

## Futures (2026-08-08) — GEX and macro bias, both tried, both removed

The Futures view started as QQQ-based Gamma Exposure (GEX): net dealer
gamma by strike, computed via Black-Scholes from Yahoo's options chain
(strikes, open interest, implied vol — no greeks provided directly). Built,
verified against live data, then dropped entirely once it became clear it
can't be held to this project's own bar.

**GEX itself: structurally unbacktestable, not just untested.** Tried to
backtest the "gamma regime" (positive net GEX = dealer hedging dampens
moves, negative = amplifies) against NQ's subsequent price action. Checked
directly whether Yahoo's `options()` endpoint supports a historical/as-of
query (passed a past date explicitly) — it doesn't; `openInterest` came
back `undefined`. Yahoo's options data is a live snapshot only, never a
time series of past chains. Every other factor in this file had real
historical data to test against; this one structurally can't, the same way
short interest (below) can't. The only honest path would be logging daily
snapshots forward from today and backtesting prospectively once enough
accumulate (months, not something available now). Removed rather than kept
as an unbacktestable heuristic — `src/lib/gex.ts` and its UI are gone.

**Macro bias (built on top of the Futures view, not GEX-dependent) — tested, rejected.**
A rule-based "Strongly Bullish ... Strongly Bearish" gauge derived from
VIX, 10Y Treasury yield, the dollar index, and HYG (high-yield credit),
each scored ±1/0 against a fixed a-priori threshold and summed. Unlike
GEX, this one *could* be backtested (VIX/TNX/DXY/HYG/NQ=F all have real
historical daily bars) — so it was, against what it would actually need to
do: predict NQ=F's next-trading-day direction.

| Test | Method | Result |
|---|---|---|
| Macro bias → NQ next-day direction | Bias computed from VIX/TNX/DXY/HYG close-to-close % change on day t (thresholds/rule fixed before this ran); predicts NQ's day-t+1 open-to-close return. ~2yr daily data (n=494, 247/247 train/test), chronological split. | Spearman correlation train -0.035, test +0.010 — near zero, sign-flips. Directional hit rate 51.8% train / 54.0% test / 52.9% overall — indistinguishable from a coin flip (SE ≈ ±2.2% on this n). Bucket spread (bullish-score days vs. bearish-score days) was *negative* in both train and test — bearish-score days had higher mean next-day returns than bullish-score days, though the magnitude is too small to call this a real backwards effect rather than noise. |

Rejected — same "positive AND stable on held-out test" bar as everything
else in this file. `src/lib/macro.ts` and its UI are gone too.

**News sentiment — built later the same day, as a labeled research aid, not a signal.**
The "also considered, not built" idea above was revisited and shipped:
Groq-synthesized 0-100 sentiment from real headlines (`src/lib/news-sentiment.ts`),
explicitly framed in the UI as ungrounded-in-backtest — a different risk
category from every factor above (hallucination risk, not statistical
edge; there's no historical "was this paragraph right" series to check a
prose read against the way a number can be checked). Manual/button-triggered
only, to bound Groq usage. See the 2026-08-11 entry below for how this was
later widened.

## Futures news sentiment widened to price + macro context (2026-08-11)

Expanded the news-sentiment feature (not a new factor, no new scoring
number) to feed Groq two more descriptive layers alongside headlines:

- **News breadth**: added MarketWatch + CNBC RSS and GDELT's free DOC 2.0
  API as additional headline sources, deduped with Yahoo's `search()` by
  normalized title. (Reuters/AP's old public RSS feeds are dead — verified
  by curl, they now 301/404 to plain HTML — so MarketWatch/CNBC stand in as
  the free wire-style equivalent.) GDELT is aggressively rate-limited
  (~1 req/5s per IP) and returns a plain-text notice instead of JSON when
  throttled; treated as fully best-effort (`src/lib/gdelt.ts` swallows any
  failure and just omits it from that run).
- **Price context**: NQ=F 1d/5d change and position vs. 20/50-day SMA, via
  the existing Yahoo source (`src/lib/price-context.ts`).
- **Macro context**: VIX and 10Y yield level/change via FRED
  (`src/lib/fred.ts`), gated behind an optional `FRED_API_KEY` — silently
  omitted if unset.

Important distinction from the rejected macro-bias score directly above:
none of this is scored, weighted, or thresholded into a standalone
directional number. The prompt explicitly tells Groq the price/macro
layers are descriptive-only — grounding for noting agreement/divergence
with the news tone — and calls out by name that a rule-based version of
scoring off macro levels alone was tested and found to have no edge, so
Groq shouldn't treat these figures as independently predictive either.
Still a qualitative research aid, not a backtestable factor — same
category as the news-sentiment score itself.

As of this entry, the Futures view is: news sentiment (multi-source, with
price/macro context) plus the trade log. Next quantitative candidate for
the Futures view still needs a real historical dataset to validate
against before anything gets treated as a signal there.

## Futures economic calendar tab (2026-08-11)

Asked whether ForexFactory (or similar) could be scraped for an economic
calendar. Checked directly: FF has no official API, actively blocks
automated requests (a plain fetch got a 403), and its terms don't permit
scraping/reuse — not something to build against. FRED is the free,
official, ToS-clean alternative, already wired in for the macro layer
above, at the cost of being US-only and date-only (no release time).

**Gotcha found while wiring it up**: FRED's "FOMC Press Release" release
(id 101) looks like exactly what you'd want for FOMC dates, but querying
`/fred/release/dates` with `include_release_dates_with_no_data=true`
returns literally every consecutive calendar day, not per-meeting dates —
verified live before shipping it (would have shown "FOMC today" every
day). Excluded that release entirely; FOMC decision dates are instead a
small hardcoded list sourced from the Fed's own published calendar
(federalreserve.gov/monetarypolicy/fomccalendars.htm, fetched 2026-08-11,
2026-2027 only) — needs a manual refresh once 2028 dates are published.
The other six releases (CPI, PPI, Employment Situation/NFP, GDP, PCE,
Retail Sales) all returned sensible upcoming dates and are used as-is.

New tab, `src/app/futures/calendar/page.tsx` — a plain lookup (no LLM
call, no scoring), so unlike news-sentiment it just fetches live on page
load rather than being button-triggered or persisted.

## Intraday NQ direction — five ideas tested, all rejected (2026-08-11/12)

Prompted by a comparison to a different (non-backtested) chat session that
"felt" good at calling intraday direction — flagged directly as an
unverified impression, same illusion-of-skill trap the rule-based
macro-bias score fell into before it was actually checked against data.
Five literature-adjacent or user-proposed, data-feasible ideas were
backtested against real NQ=F history with the same methodology as
everything else in this file (chronological 50/50 train/test split,
Spearman correlation + median-based bucket stats, outlier trim).
`scripts/backtest-intraday.ts` (`npm run backtest:intraday`).

**Data constraints that shaped what could even be tested**: Yahoo's free
API caps 5-minute intraday bars at 60 calendar days of history (verified
live — a platform limit, not a setting) — that's ~39 usable RTH sessions
after filtering for adequate bar coverage, split ~20/19 train/test. True
CVD (bid/ask-classified order flow) isn't available from this source at
all — only bar-level aggregate volume — so "order flow" here is
necessarily an up/down-bar volume proxy, not the real thing.

| Idea | Method | Result |
|---|---|---|
| Gap-and-gap-fill | Spearman(gap %, same-day open-to-close return %) + bucketed by gap direction/size. Daily bars, deep history: 628 observations, 314/314 split — by far the most statistically meaningful of the four. | Correlation sign-flips: train +0.090, test -0.132. Large-gap-down bucket flips hardest — train continuation +0.173% (53% win), test **reverses to -0.702%** (29% win: large gap-downs in the test period mostly bounced, not continued). No stable relationship despite the largest sample size of any test in this file. |
| VWAP-relative positioning | Spearman(distance from session VWAP at 10:30 ET, return from 10:30 to close). 39 sessions, 20/19 split. | Correlation sign-flips: train -0.113, test +0.121, both weak. Bucket win-rates near 40-56% (coin-flip range) with n as low as 7-13 per bucket — too thin to trust even before the sign-flip. |
| Opening-range breakout | First 30min (9:30-10:00 ET) high/low; first breakout after that predicts continuation (+) or reversal (-) into the close. 38 breakout sessions, 19/19 split. | Sign-flips: train median -0.179% (47% win — breakouts *failed* more than they held, in-sample), test +0.091% (58% win). Direction-split buckets (n=7-12) show the same instability. |
| Up/down-volume proxy for order flow | Cumulative (+volume on up-bars, -volume on down-bars) through 11:30 ET vs. rest-of-session return. 39 sessions, 20/19 split. | Near-zero, unstable correlation: train -0.024, test +0.149. Bucket effect size collapses train-to-test (e.g. one bucket: +0.730% train -> +0.018% test). No usable signal, and this is the *weaker* proxy version of CVD to begin with. |
| 20EMA regime + prior-day range follow-through (user-proposed, 2026-08-12) | BULLISH signal if yesterday's close > yesterday's 20EMA AND yesterday's close > the high two days ago (strong follow-through); BEARISH the mirror image (< 20EMA, < low two days ago); else indeterminate. Tests both today's open-to-close and close-to-close return. Daily bars, deep history: 609 observations, 305/304 split. | **Rejected for a subtler reason than the other four**: the signal fires often (bullish 26-31%, bearish 13-15% of days) and superficially "wins" — bullish hit-rate 57% both train and test — but NQ's *unconditional* up-day rate was 55-57% in both periods too (it's just been trending up). The bullish signal's hit rate is statistically indistinguishable from that baseline, not better than it. The bearish signal is the tell: 45% (train) / 44% (test) hit-rate, almost exactly what betting against a 55-57%-up-day instrument gets you by chance — the EMA+follow-through logic adds no information beyond the instrument's baseline drift. Magnitude was also unstable (bullish open-to-close median +0.055% train vs +0.172% test) and bullish close-to-close underperformed its own baseline in test (56% vs 57%). |

**Verdict: all five rejected** — same bar as everything else in this file
(positive AND stable on held-out test, not just train, *and* better than
the relevant baseline — the 20EMA test is the reminder that a raw hit-rate
alone can be misleading on a trending instrument). The gap-fill rejection
is the most trustworthy of the five given its much larger sample; the
three RTH-session tests (VWAP, ORB, volume-proxy) had genuinely thin
samples (single-digit n in some buckets) on top of failing to show a
stable pattern, so those three specifically could be revisited with a
larger sample once more days of 5-minute history accumulate (this data
source only allows a 60-day trailing window at any given time — there's
no way to backfill deeper, only wait and re-run later) — though the two
fully-powered daily-bar tests (gap-fill, 20EMA) already point the same
direction: public/derivable price-action information doesn't have obvious
continuation, reversion, or trend-following edge on this instrument once
checked against its own baseline drift, matching the efficient-market
prior and the earlier macro-bias rejection.

## Dead ends (verified before building, never backtested)

These were ruled out by direct verification of data availability or by a
literature check *before* writing any backtest code — consistent with this
project's "verify, don't recall" practice.

| Idea | What was checked | Result |
|---|---|---|
| Short interest | Yahoo's free API (`defaultKeyStatistics`) | Only exposes a current snapshot, no historical time series. Can't be backtested at all. User decision: drop it. |
| Insider transactions | Direct `quoteSummary({modules:['insiderTransactions']})` check on AAPL, MSFT, NVDA, CRWD | Depth is inconsistent (2.5–13 months) **and** it's almost entirely insider *sales* (0-2 purchases out of 76-150 transactions per symbol). The literature's actual signal (Seyhun 1986; Lakonishok & Lee 2001, *RFS*; Jeng, Metrick & Zeckhauser 2003) is in open-market *purchases* — mega-cap executives are paid in stock and routinely sell for diversification; they essentially never buy on the open market. Structurally unusable for this universe. |
| Fibonacci retracement levels / Fair Value Gaps (FVG) | Literature search (early in this project, pre-dating this file) | No published research support found — folklore, not evidence. Distinct from the trend/volume-conditioning/support-resistance pieces of the same original swing-trading idea, which *were* found to have real backing. |
| Pullback / mean-reversion entry timing (generic "buy the dip in an uptrend") | Literature search: Jegadeesh (1990, *JF*), Lehmann (1990, *QJE*) confirm real short-term (weekly/monthly) reversal exists generically. But more precise, more recent work shows this is conditional on turnover and proximity-to-high, and **reverses to momentum/continuation** for exactly our kind of stock: Jegadeesh, Luo, Subrahmanyam & Titman (2025, *RFS*) — reversal transitions to momentum at longer horizons, negative relation between reversal and momentum profits; "Short-term Momentum" (2022, *RFS*) — high-turnover stocks show continuation not reversal, strongest among the largest/most liquid/most-covered names; Chen, Stivers & Sun (2024, *J. Empirical Finance*) — reversal shifts to momentum for stocks with both high turnover AND high price-to-52-week-high. | Nasdaq-100 mega-caps near their highs (i.e. what trend already selects) sit exactly in the "momentum, not reversal" bucket per all three papers. Literature-contraindicated for this universe — not built. The specific "pull back to a 20/50-day moving average" mechanic itself was never in the academic literature to begin with (same folklore tier as Fibonacci). |

## Proposed, not yet tested

None currently open. Overnight momentum and residual momentum (both proposed
2026-08-08) were tested the same day — see the confirmed-diagnostics and
rejected tables above.

## Data-source constraints learned the hard way

- **Yahoo's `fundamentalsTimeSeries`** (`financials`, `balance-sheet`
  modules): only exposes ~5-7 trailing quarters regardless of the
  requested date range. Confirmed by direct testing, not a query bug. Any
  factor needing deep fundamentals history hits this wall.
- **Yahoo's `earnings` module** (quoteSummary): only the trailing 4
  quarters, but with a precise `reportedDate` timestamp — the one thing
  that made the PEAD event study possible despite the short window.
- **Yahoo's `insiderTransactions` module**: depth varies by symbol
  (2.5-13 months observed), capped around 100-150 records, and for
  mega-caps is almost entirely sales, not purchases.
- **Yahoo's `defaultKeyStatistics`** (short interest): current snapshot
  only, no historical series.
- General pattern: Yahoo's free API is excellent for **price/volume**
  history (deep, full quality) and current-snapshot fundamentals, but weak
  on **historical fundamentals/ownership/short-interest** depth. Factor
  ideas that only need price data (like the two proposed above) don't hit
  this wall; factor ideas needing fundamentals or filings history
  (Quality, Value, insider trading) do.
