// apps/web/app/page.tsx
// 定義網站首頁入口，將商品探索 client component 包在載入邊界內。

import type { Metadata } from "next";
import { Suspense } from "react";

import { resolvePublicSiteUrl } from "./_shared/public-site";
import ProductExplorer from "./product-explorer/ProductExplorer";

export const HOMEPAGE_DESCRIPTION =
  "查詢原價屋 CPU、主機板、顯示卡、SSD 等電腦零件價格，支援規格篩選、近期價格變動、歷史價格與 Discord 目標價提醒。";

export const metadata: Metadata = {
  title: "台灣電腦零件價格查詢與追蹤 | PartsRadarTW",
  description: HOMEPAGE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
};

export function createHomepageStructuredData(publicSiteUrl?: string | null) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PartsRadarTW",
    url: `${resolvePublicSiteUrl(publicSiteUrl)}/`,
    description: HOMEPAGE_DESCRIPTION,
    inLanguage: "zh-TW",
  } as const;
}

export function serializeHomepageStructuredData(publicSiteUrl?: string | null) {
  return JSON.stringify(createHomepageStructuredData(publicSiteUrl)).replace(/</g, "\\u003c");
}

// 呈現商品查詢首頁，讓 URL query 驅動的探索介面在 client 端完成初始化。
export default function HomePage() {
  return (
    <>
      <script id="website-structured-data" type="application/ld+json">
        {serializeHomepageStructuredData()}
      </script>
      <Suspense fallback={<div className="page-loading">載入查詢工具</div>}>
        <ProductExplorer routeState={{ category: null }} />
      </Suspense>
    </>
  );
}
