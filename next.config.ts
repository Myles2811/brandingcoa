import type { NextConfig } from "next";

// liveDemoTue: static demo build. The dashboard renders entirely from the captured
// snapshot in src/lib/demo/snapshot.json, so there are no API routes, no server
// actions and no database — `next build` emits a plain static site in ./out that
// Azure Static Web Apps can host with no backend and no environment variables.
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
