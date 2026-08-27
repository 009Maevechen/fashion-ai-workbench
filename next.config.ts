import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // `next build` 与 `next dev` 共用 .next 会互相污染。验证构建时可通过
  // NEXT_DIST_DIR 指定独立目录，避免覆盖正在运行的开发服务产物。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Keep image codecs as complete runtime dependencies. Bundling their native
  // binaries/WASM into split server chunks can leave Windows desktop builds
  // unable to decode uploads even though the same files work in development.
  serverExternalPackages: ["sharp", "heic-convert", "heic-decode", "libheif-js"],
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
};
export default nextConfig;
