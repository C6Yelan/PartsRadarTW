// apps/web/app/page.tsx
// 定義網站首頁入口，將商品探索 client component 包在載入邊界內。

import type { Metadata } from "next";
import { Suspense } from "react";

import ProductExplorer from "./product-explorer/ProductExplorer";

export const metadata: Metadata = {
  title: "PartsRadarTW",
  description: "原價屋電腦零件價格查詢工具",
  alternates: {
    canonical: "/",
  },
};

// 呈現商品查詢首頁，讓 URL query 驅動的探索介面在 client 端完成初始化。
export default function HomePage() {
  return (
    <Suspense fallback={<div className="page-loading">載入查詢工具</div>}>
      <ProductExplorer routeState={{ category: null }} />
    </Suspense>
  );
}
