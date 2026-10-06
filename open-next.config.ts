import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental-cache override: every page in this app is a client
// component that fetches its own data (no static generation, no ISR), so
// there's nothing for R2/KV-backed caching to do here.
export default defineCloudflareConfig();
