/**
 * Cloudflare D1 (SQLite-compatible, accessed via a binding — not a local
 * file). Migrated off better-sqlite3, which can't run on Cloudflare Workers
 * at all: Workers run on `workerd`, not Node, and even with the
 * nodejs_compat flag there's no support for loading compiled native
 * addons like better-sqlite3's .node binary. Schema lives in migrations/,
 * applied via `wrangler d1 migrations apply` (see package.json), not
 * created at request time the way the old CREATE TABLE IF NOT EXISTS was.
 *
 * getDb() is synchronous (getCloudflareContext() reads from
 * AsyncLocalStorage within a request), but every query method on the
 * returned D1Database is async — this is the one thing that's genuinely
 * different for every caller versus the old better-sqlite3 API, not just a
 * find-and-replace.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

export function getDb(): D1Database {
  const { env } = getCloudflareContext();
  return env.DB;
}
