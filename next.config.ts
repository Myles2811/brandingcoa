import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Northern Ireland adapter parses public award PDFs on the Node runtime.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
