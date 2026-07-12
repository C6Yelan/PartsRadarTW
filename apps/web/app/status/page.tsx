// apps/web/app/status/page.tsx
// 提供公開資料更新狀態頁的 route metadata 與 client entrypoint。

import type { Metadata } from "next";
import StatusPageClient from "./StatusPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/status",
  },
  title: "資料更新狀態 | PartsRadarTW",
  description: "查看 PartsRadarTW 各商品分類最近檢查與成功更新狀態。",
};

export default function StatusPage() {
  return <StatusPageClient />;
}
