@AGENTS.md

# Project conventions

## Verification

Do not perform browser-based visual verification (Playwright, screenshots, or similar) for UI changes in this project. Ship the change and let the user check it visually themselves in their own browser. Static checks (typecheck, build, lint) are still fine and expected.

## Engineering principles

Write neat, sustainable code: favor clarity and simplicity over cleverness, avoid speculative abstraction, and keep the codebase easy for a future contributor (human or agent) to pick up cold.

## API key protection

This is a single-user app with exactly one external API key: Groq's, used server-side only, as `GROQ_API_KEY` in `.env.local` — never as a client-facing input field, never in client-side state. Treat it as a secret at all times:

- Never log it (server console, client console, error messages, analytics).
- Never commit it to the repo or write it to a file other than `.env.local`.
- Send it only to Groq's API, never to any third-party service, telemetry, or logging pipeline.
- `.env.local` is gitignored via the `.env*` pattern — keep it that way. `.env.local.example` documents the required variable name with an empty value; never put a real key in that file.

## Market data

All market data (live quotes, historical OHLCV bars) comes from Yahoo Finance's unofficial API via the `yahoo-finance2` package (`src/lib/yahoo.ts`) — no API key, no signup, no daily quota. FMP was the original provider but was dropped entirely: its free tier turned out to gate almost everything (batch quotes, constituent lists, news, screeners) behind a paid plan, while Yahoo's free tier gives genuine batch quotes, real-time prices, and fundamentals/analyst/earnings data with no such wall. Don't reintroduce FMP or a similar signup-gated provider without a real reason — the whole point of this switch was removing that constraint.
