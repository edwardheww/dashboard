@AGENTS.md

# Project conventions

## Verification

Do not perform browser-based visual verification (Playwright, screenshots, or similar) for UI changes in this project. Ship the change and let the user check it visually themselves in their own browser. Static checks (typecheck, build, lint) are still fine and expected.

## Engineering principles

Write neat, sustainable code: favor clarity and simplicity over cleverness, avoid speculative abstraction, and keep the codebase easy for a future contributor (human or agent) to pick up cold.

## API key protection

This is a single-user app with two external API keys: Groq's (`GROQ_API_KEY`, required) and FRED's (`FRED_API_KEY`, optional — gates the news-sentiment macro layer, silently skipped if unset). Both server-side only, in `.env.local` — never as a client-facing input field, never in client-side state. Treat them as secrets at all times:

- Never log them (server console, client console, error messages, analytics).
- Never commit them to the repo or write them to a file other than `.env.local` (locally) or Cloudflare's secret/env-var store (in production — see Persistence & deployment below).
- Send each key only to its own provider's API, never to any third-party service, telemetry, or logging pipeline.
- `.env.local` is gitignored via the `.env*` pattern — keep it that way. `.env.local.example` documents the required variable names with empty values; never put a real key in that file.

## Persistence & deployment

Deployed on Cloudflare via the OpenNext adapter (`@opennextjs/cloudflare`) — chosen deliberately, so don't reintroduce a Node-only persistence layer without re-litigating this. Data lives in **Cloudflare D1** (`src/lib/db.ts`, binding name `DB`), not a local SQLite file:

- D1 was the second choice here, not the first — this app originally used `better-sqlite3` against a local file. That's incompatible with Cloudflare Workers outright: Workers run on `workerd`, not Node, and even with the `nodejs_compat` flag there's no support for loading compiled native addons like better-sqlite3's `.node` binary. D1 is Cloudflare's own SQLite-compatible database, accessed via a binding — the schema/SQL mostly carried over unchanged, only the client API did not.
- Every `getDb()` caller is `async` now (D1's `prepare().bind().run()/.all()/.first()` all return Promises, unlike better-sqlite3's synchronous calls) — don't add a new DB-touching function without `async`/`await`.
- Schema changes are migration files in `migrations/`, applied via `npm run db:migrate:local` / `db:migrate:remote` (wraps `wrangler d1 migrations apply`) — not a runtime `CREATE TABLE IF NOT EXISTS` the way the old better-sqlite3 setup worked. Add a new numbered migration file for any schema change; don't edit `0001_init.sql` after it's been applied anywhere.
- Local dev (`next dev`) still works against a local D1 instance via `initOpenNextCloudflareForDev()` in `next.config.ts` — no separate "dev database" hack needed.
- `@cloudflare/workers-types` is installed for D1's types, but never reference it via `/// <reference types="@cloudflare/workers-types" />` or a bare `import "@cloudflare/workers-types"` — its default (non-module) typings declare `fetch`/`Request`/`Response` globally with Workers' signatures, which collides with lib.dom's versions and silently breaks typing on every client component's `await res.json()` project-wide (hit this directly while migrating — `Response.json()` started returning `unknown` everywhere). Always `import type { D1Database } from "@cloudflare/workers-types"` (a scoped named import) instead — see `cloudflare-env.d.ts` and `src/lib/db.ts` for the pattern.
- `cloudflare-env.d.ts` is **hand-maintained, not generated** — there's deliberately no `cf-typegen` npm script. `wrangler types` produces the exact same global-collision problem as the bullet above (it inlines the same Workers runtime globals as a non-module script), confirmed by testing it directly. If `wrangler.jsonc`'s bindings change, update `cloudflare-env.d.ts`'s `CloudflareEnv` interface by hand instead of regenerating it.

## Workers subrequest limit (why the screener is split into `/api/screen/bars` + `/api/screen/finalize`)

Cloudflare Workers caps outbound `fetch()` calls at **50 per invocation on the Free plan** (10,000 on Paid) — this is a hard per-request ceiling, not a daily/monthly quota, and it's not configurable past the plan's own limit. A single-shot screener run needs ~102 Yahoo Finance calls (one per Nasdaq-100 symbol) + a few quote-batch calls + 1 Groq call — comfortably over 50, confirmed live in production as a real 502 (`wrangler tail` showed the literal runtime error: `Too many subrequests by single Worker invocation`).

Fixed by splitting the universe into batches, each its own client-initiated request (`src/lib/scoring.ts`'s `computeRawMetrics`/`finalizeScoring` split, `src/app/api/screen/bars` + `src/app/api/screen/finalize`, orchestrated from `src/components/screener.tsx`). Two things worth knowing if you touch this:

- **Batches must be fetched sequentially from the client, not with `Promise.all`.** Running all batches concurrently means every batch's internal Yahoo Finance concurrency stacks on top of the others (~24 simultaneous outbound fetches at peak with 4 batches × 6-wide internal concurrency each) — confirmed live to occasionally slow individual fetches enough to trip Cloudflare's own "Worker hung" watchdog and kill the batch (`wrangler tail` showed: *"The Workers runtime canceled this request because it detected that your Worker's code had hung and would never generate a response"*). Sequential batches keep each one's real load identical to testing it in isolation, at the cost of a slower end-to-end run (~5-15s instead of a few seconds) — acceptable for a manual button-triggered screen.
- A server-side orchestrator can't work around the subrequest cap by fanning out to its own sub-endpoints via internal `fetch()` calls — those internal fetches still count against the *outer* request's own budget. The only way to get a fresh subrequest budget per batch is a genuinely separate incoming request, which means client-side orchestration, not a clever server-side loop.

If this app ever moves to Workers Paid (10,000/request), none of this needs to be undone — the split version still works fine, just with a few extra unnecessary round trips.

## Market data

All market data (live quotes, historical OHLCV bars) comes from Yahoo Finance's unofficial API via the `yahoo-finance2` package (`src/lib/yahoo.ts`) — no API key, no signup, no daily quota. FMP was the original provider but was dropped entirely: its free tier turned out to gate almost everything (batch quotes, constituent lists, news, screeners) behind a paid plan, while Yahoo's free tier gives genuine batch quotes, real-time prices, and fundamentals/analyst/earnings data with no such wall. Don't reintroduce FMP or a similar signup-gated provider without a real reason — the whole point of this switch was removing that constraint.
