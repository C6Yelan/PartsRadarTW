// apps/web/app/not-found.tsx
// 提供 App Router 找不到頁面時的全站 404 畫面，保留品牌入口與來源聲明。

import Link from "next/link";
import { ArrowLeftIcon } from "./_shared/icons";
import SiteDisclaimer from "./site-disclaimer";
import TopbarBrandNavigation from "./TopbarBrandNavigation";

// 顯示未知路由的回首頁引導，讓使用者回到商品查詢流程。
export default function NotFound() {
  return (
    <div className="app-shell not-found-shell">
      <header className="topbar public-info-topbar">
        <TopbarBrandNavigation />
        <div className="public-info-topbar-title">
          <h1>頁面不存在</h1>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>
      <main className="not-found-content">
        <section className="not-found-panel" aria-labelledby="not-found-title">
          <h1 id="not-found-title">找不到這個頁面</h1>
          <p>網址可能已失效，或目前沒有對應的商品查詢頁面。</p>
          <Link className="external-action" href="/">
            返回商品查詢
          </Link>
        </section>
      </main>
      <SiteDisclaimer />
    </div>
  );
}
