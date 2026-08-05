import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "球球星域 · Orbit Arena",
  description: "吞噬光点、智斗对手，在不断变化的星域中成长为最大的球球。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
