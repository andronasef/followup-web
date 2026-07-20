import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // SSE payloads are small and must flush immediately — Next's built-in
  // gzip/brotli buffers streamed responses, which would silently break
  // Server-Sent Events. Traefik/Coolify compresses static assets instead.
  compress: false,
  async headers() {
    return [
      {
        // A cached sw.js can never be replaced by a newer one — CLAUDE.md's
        // explicit warning about shipping an un-updatable service worker.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
