// apps/web/app/page.tsx
// 定義網站首頁入口，將商品探索 client component 包在載入邊界內。

import type { Metadata } from "next";
import { Suspense } from "react";

import {
  findActivePinnedAnnouncement,
  PUBLIC_ANNOUNCEMENTS,
} from "./announcements/data";
import ProductExplorer from "./product-explorer/ProductExplorer";

export const metadata: Metadata = {
  title: "PartsRadarTW",
  description: "原價屋電腦零組件價格查詢工具",
  alternates: {
    canonical: "/",
  },
};

export const revalidate = 3600;

// 呈現商品查詢首頁，讓 URL query 驅動的探索介面在 client 端完成初始化。
export default function HomePage() {
  const announcement = findActivePinnedAnnouncement(PUBLIC_ANNOUNCEMENTS, new Date());

  return (
    <Suspense fallback={<div className="page-loading">載入查詢工具</div>}>
      <ProductExplorer announcement={announcement} />
    </Suspense>
  );
}
