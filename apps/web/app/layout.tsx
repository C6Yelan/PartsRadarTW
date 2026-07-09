// apps/web/app/layout.tsx
// 定義 Next.js app router 的全站 HTML shell、預設 metadata 與 global CSS 載入入口。

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PartsRadarTW",
  description: "原價屋電腦零組件價格查詢工具",
  icons: {
    icon: "/favicon.svg",
  },
};

// 包住所有 app route 的根版型，維持繁體中文語系與全站共用 body 結構。
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
