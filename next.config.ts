import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The dev server is opened at 127.0.0.1 while Next treats that host as
  // cross-origin. Without this, the HMR socket is rejected, the React debug
  // channel never closes, and client components never hydrate.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
