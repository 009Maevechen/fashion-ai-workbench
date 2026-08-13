import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Keep image codecs as complete runtime dependencies. Bundling their native
  // binaries/WASM into split server chunks can leave Windows desktop builds
  // unable to decode uploads even though the same files work in development.
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode", "libheif-js"],
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
};
export default nextConfig;
