import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite 只用于本地开发与测试，不打进 Vercel 函数。
  serverExternalPackages: ["@electric-sql/pglite","pdfjs-dist"],
  // PDF.js 动态加载 worker 和字库，静态追踪无法自动识别这些路径。
  outputFileTracingIncludes: {
    "/api/{sources,chat}": [
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/wasm/**/*",
    ],
  },
};

export default nextConfig;
