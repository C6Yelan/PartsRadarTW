// apps/web/app/price-report/page.tsx
// 提供公開、唯讀的價格變動總覽頁面與搜尋引擎 metadata。

import type { Metadata } from "next";
import { Suspense } from "react";
import PriceReportPageClient from "./PriceReportPageClient";

export const metadata: Metadata = {
  alternates: {
    canonical: "/price-report",
  },
  title: "價格變動總覽 | PartsRadarTW",
  description: "查看原價屋電腦零組件近期漲價、降價與新增商品。",
};

export default function PriceReportPage() {
  return (
    <Suspense fallback={<div className="page-loading">載入價格變動總覽</div>}>
      <PriceReportPageClient />
    </Suspense>
  );
}
