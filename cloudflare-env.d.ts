// Hand-maintained — do NOT replace with `npm run cf-typegen`'s output.
// Tried that: wrangler inlines the same Workers runtime globals
// (fetch/Request/Response with Workers' signatures) as a non-module script,
// which collides with lib.dom's versions and breaks typing across every
// client component's `await res.json()` call project-wide (`Response.json()`
// starts returning `unknown`/`{}` instead of `any`, everywhere). Confirmed
// by testing both the raw `@cloudflare/workers-types` package and wrangler's
// generated file directly — same collision either way.
//
// The fix: only ever bring in `D1Database` as a scoped named import (a real
// module import, not an ambient global reference), and declare just the one
// global we actually need (CloudflareEnv, for getCloudflareContext()) by
// hand. If wrangler.jsonc's bindings ever change, update the interface below
// to match — don't regenerate this file.
import type { D1Database } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
  }
}

export {};
