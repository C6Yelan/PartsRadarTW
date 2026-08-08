// apps/web/app/price-report/page.tsx
// 提供公開、唯讀的價格變動總覽頁面與搜尋引擎 metadata。

import type { Metadata } from "next";
import { Suspense } from "react";
import PriceReportPageClient from "./PriceReportPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/price-report",
  },
  title: "電腦零件降價與價格變動 | PartsRadarTW",
  description: "查看原價屋電腦零件近期降價、漲價與新增商品，掌握 CPU、顯示卡、SSD 等零件價格變動。",
};

export default function PriceReportPage() {
  return (
    <Suspense fallback={<div className="page-loading">載入價格變動總覽</div>}>
      <PriceReportPageClient />
    </Suspense>
  );
}
