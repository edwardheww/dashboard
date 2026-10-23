# Trading Dashboard

A single-user research dashboard for Nasdaq equities and NQ futures: an AI-assisted stock screener, a position tracker, a futures trade log, and news sentiment, built around one rule: **a signal only ships if it holds up out-of-sample.**

Most of the work here is the research, not the UI. Of ~16 signals tested, one survived (trend/momentum). The rest were backtested, rejected, and removed. The full log, including what failed and why, is in [RESEARCH.md](./RESEARCH.md).

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Cloudflare Workers (via OpenNext) · Cloudflare D1 · Groq (`openai/gpt-oss-120b`) · `yahoo-finance2`

## What it does

**Stock screener.** Scores the Nasdaq-100 on a trend factor, shortlists the top 15, then asks an LLM to pick and justify the top 3 with an overall score, a per-factor breakdown, a suggested price target, and percentage upside. Every number traces back to its inputs; nothing is a black box. The output is a shortlist for further research, not a trade signal.

**Position tracker.** Log entries and exits with thesis and notes, with live P&L and an equity curve.

**Futures view (NQ).**
- *News sentiment:* a 0-100 sentiment read from headlines (Yahoo, MarketWatch, CNBC, GDELT), with price and macro context (VIX, 10Y yield via FRED). Explicitly labelled as a research aid, not a backtested signal.
- *Economic calendar:* CPI, PPI, NFP, GDP, PCE, retail sales (FRED) plus FOMC dates.
- *Trade log:* entries with R:R, a chart screenshot, and notes.

## Research summary

Every candidate had to be positive **and stable** (median-based, not just mean) on a held-out test period, survive outlier-robustness checks (exclude the best cycle, symmetric trim), and be backed by published research, or at least not contradicted by it.

| Area | Tested | Result |
|---|---|---|
| **Trend / momentum** | Price vs 50/100-day averages + 6-month return, percentile-ranked | **Only survivor.** Positive median excess return in train and test on Nasdaq-100 mega-caps, and robust to outlier exclusion. Not robust on the Next Gen 100 (test median excess flips from +1.81% to -0.53% when the best cycle is dropped). |
| Equity factors | 52-week-high proximity, volume, low-volatility, MAX effect, quality, value, overnight momentum, residual momentum | All rejected. Failures were sign-flips between train and test (e.g. value: +0.149 train, -0.162 test), redundancy with trend (residual momentum correlates 0.629 with trend), or screening out the names that drive trend's returns. |
| PEAD (post-earnings drift) | Standalone event study + as a live filter | Effect is real-ish in large-surprise subsamples but fully redundant with trend: the filter never triggered in 43 cycles. |
| Futures macro bias | Rule-based gauge from VIX, 10Y, dollar index, HYG vs next-day NQ direction (n=494) | Rejected. Hit rate 52.9% overall, indistinguishable from a coin flip. |
| Intraday NQ | Gap-fill, VWAP positioning, opening-range breakout, up/down-volume proxy, 20-EMA regime | All five rejected. Correlations flip sign between train and test. The 20-EMA signal's hit rate matched NQ's own up-day base rate, so it added no information beyond drift. |
| Gamma exposure (GEX) | Checked data availability before building a backtest | Not backtestable: Yahoo only exposes live options snapshots, no history. Removed rather than kept as an unvalidated heuristic. |

A useful side-finding: trend's edge on this universe is overwhelmingly **overnight-driven** (train excess +7.04pp overnight vs +0.51pp intraday; test +18.14pp vs +2.24pp), consistent with Lou, Polk & Skouras (2019).

**Caveats, stated plainly:** small samples (the intraday tests have as few as 38 usable sessions, since Yahoo caps 5-minute history at 60 days), survivorship bias in a current-constituents universe, and no transaction costs modelled. These results show what *didn't* work on this data, not that anything is a proven edge.

## Architecture notes

- **Cloudflare Workers subrequest limit.** Workers cap outbound `fetch()` calls at 50 per invocation on the free plan, and one full screen needs ~100 Yahoo calls. The screener is split into batched `/api/screen/bars` requests orchestrated sequentially from the client, then a single `/api/screen/finalize` call for scoring and the LLM step.
- **D1 over SQLite.** The app started on `better-sqlite3`, which can't run on Workers (no native addons). Schema now lives in [`migrations/`](./migrations) and is applied with Wrangler.
- **Secrets stay server-side.** The Groq and FRED keys are read only in server code, never exposed to the client.
- Design decisions and their reasons are documented in the code comments and in `RESEARCH.md`, including what was tried first and why it was dropped.

## Getting started

```bash
npm install
```

Create `.env.local`:

```
GROQ_API_KEY=your_key      # required: powers the screener synthesis and news sentiment
FRED_API_KEY=your_key      # optional: enables the macro layer and economic calendar
```

Apply the database schema locally and start the dev server:

```bash
npm run db:migrate:local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run the backtests

```bash
npm run backtest                      # trend factor, train/test split (--universe=megacap|nextgen100, --lookback=N, --refresh)
npm run backtest:price-factors        # price-based factor tests
npm run backtest:newfactors           # PEAD, quality, value, overnight, residual momentum
npm run backtest:intraday             # NQ intraday ideas (gap-fill, VWAP, ORB, volume proxy, 20-EMA)
```

Historical data is cached locally; pass `--refresh` to re-fetch.

### Deploy to Cloudflare

Set the secrets in Cloudflare (`wrangler secret put GROQ_API_KEY`, and optionally `FRED_API_KEY`), create the D1 database named in `wrangler.jsonc`, then:

```bash
npm run db:migrate:remote
npm run deploy
```

## Project structure

```
src/app/api/     Route handlers (screen, positions, trade-log, news sentiment, calendar)
src/lib/         Scoring, Yahoo/FRED/GDELT clients, Groq prompts, D1 access
src/components/  UI (screener, positions, futures views)
scripts/         Backtest scripts (run with tsx)
migrations/      D1 schema migrations
RESEARCH.md      Full factor research log: tested, rejected, and why
```

## Disclaimer

For research and education only. Nothing here is financial advice. Market data comes from Yahoo Finance's unofficial API and may be delayed, incomplete, or change without notice.
