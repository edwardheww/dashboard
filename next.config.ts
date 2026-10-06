import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Lets `next dev` resolve Cloudflare bindings (D1, etc.) the same way the
// deployed Worker does, so getCloudflareContext() works locally too.
initOpenNextCloudflareForDev();
