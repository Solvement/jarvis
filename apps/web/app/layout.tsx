import type { Metadata } from "next";
import { Noto_Serif_SC } from "next/font/google";
import "./globals.css";

// 报纸式标题字体；构建时自托管，读者不向 Google 发请求。
const serif = Noto_Serif_SC({ weight: ["600", "900"], subsets: ["latin"], preload: false, display: "swap", variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Jarvis · 开源与论文阅读台",
  description: "GitHub 与 Hugging Face 三榜，源码级精读与可追溯知识库。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={serif.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
