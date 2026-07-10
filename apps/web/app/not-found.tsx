// apps/web/app/not-found.tsx
// 提供 App Router 找不到頁面時的全站 404 畫面，保留品牌入口與來源聲明。

import Link from "next/link";
import { BrandMarkIcon } from "./_shared/icons";
import SiteDisclaimer from "./site-disclaimer";

// 顯示未知路由的回首頁引導，讓使用者回到商品查詢流程。
export default function NotFound() {
  return (
    <main className="not-found-shell">
      <Link className="brand-lockup not-found-brand" href="/">
        <BrandMarkIcon />
        <span>
          <span className="brand-name">PartsRadarTW</span>
          <span className="brand-subtitle">原價屋零件查詢</span>
        </span>
      </Link>

      <section className="not-found-panel" aria-labelledby="not-found-title">
        <h1 id="not-found-title">找不到這個頁面</h1>
        <p>網址可能已失效，或目前沒有對應的商品查詢頁面。</p>
        <Link className="external-action" href="/">
          返回商品查詢
        </Link>
      </section>
      <SiteDisclaimer />
    </main>
  );
}
