import type { Metadata } from "next";
import "./globals.css";
import "./game-features.css";

export const metadata: Metadata = {
  title: "球球星域 · Orbit Arena",
  description: "吞噬光点、消耗体型加速，并通过好友房间一起征战星海。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
