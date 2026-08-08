// apps/web/app/page.tsx
// 定義網站首頁入口，將商品探索 client component 包在載入邊界內。

import type { Metadata } from "next";
import { Suspense } from "react";

import ProductExplorer from "./product-explorer/ProductExplorer";

export const metadata: Metadata = {
  title: "台灣電腦零件價格查詢與追蹤 | PartsRadarTW",
  description:
    "查詢原價屋 CPU、主機板、顯示卡、SSD 等電腦零件價格，支援規格篩選、近期價格變動與 Discord 目標價提醒。",
  alternates: {
    canonical: "/",
  },
};

// 呈現商品查詢首頁，讓 URL query 驅動的探索介面在 client 端完成初始化。
export default function HomePage() {
  return (
    <Suspense fallback={<div className="page-loading">載入查詢工具</div>}>
      <ProductExplorer routeState={{ category: null }}>
        <header className="home-topic">
          <h1>台灣電腦零件價格查詢與追蹤</h1>
          <p>
            查詢原價屋 CPU、主機板、顯示卡、SSD
            等電腦零件價格，並使用規格篩選、近期價格變動與目標價提醒功能。
          </p>
        </header>
      </ProductExplorer>
    </Suspense>
  );
}
