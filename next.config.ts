import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // SSE payloads are small and must flush immediately — Next's built-in
  // gzip/brotli buffers streamed responses, which would silently break
  // Server-Sent Events. Traefik/Coolify compresses static assets instead.
  compress: false,
};

export default nextConfig;
