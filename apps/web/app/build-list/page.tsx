// apps/web/app/build-list/page.tsx
// 提供 /build-list route entrypoint，將配單頁互動交給 client component。

import type { Metadata } from "next";
import BuildListPageClient from "./BuildListPageClient";

export const metadata: Metadata = {
  title: "配單 | PartsRadarTW",
  description: "在瀏覽器中整理電腦零組件配單與價格估算。",
  alternates: {
    canonical: "/build-list",
  },
  robots: {
    index: false,
    follow: false,
  },
};

// 接線 Next.js route 與配單 client-side 頁面。
export default function BuildListPage() {
  return <BuildListPageClient />;
}
