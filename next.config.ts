import type { NextConfig } from "next";

const basePath = process.env.PAGES_BASE_PATH ?? "";
const isPagesStaticBuild = process.env.PAGES_STATIC_BUILD === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  typescript: isPagesStaticBuild
    ? { tsconfigPath: "tsconfig.pages.json" }
    : undefined,
};

export default nextConfig;
