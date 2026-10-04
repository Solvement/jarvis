import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite 只用于本地开发与测试，不打进 Vercel 函数。
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
