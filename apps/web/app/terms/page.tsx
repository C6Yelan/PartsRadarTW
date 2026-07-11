// apps/web/app/terms/page.tsx
// 公開說明 PartsRadarTW 的非官方定位、資料限制與合理使用規則。

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  alternates: {
    canonical: "/terms",
  },
  title: "使用條款 | PartsRadarTW",
  description: "PartsRadarTW 的資料來源、使用限制與責任範圍。",
};

export default function TermsPage() {
  return (
    <div className="app-shell public-info-shell">
      <header className="topbar public-info-topbar">
        <Link className="brand-lockup" href="/">
          <BrandMarkIcon />
          <span>
            <span className="brand-name">PartsRadarTW</span>
            <span className="brand-subtitle">原價屋零件查詢</span>
          </span>
        </Link>
        <div className="public-info-topbar-title">
          <h1>使用條款</h1>
          <span>資料限制與合理使用規則</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page">
        <section className="public-info-hero">
          <p className="public-info-kicker">TERMS</p>
          <strong>使用本站即表示你理解這是一項非官方、非商業的資料整理服務。</strong>
          <p>條款維持簡短，目的在說清楚資料限制與合理使用，不取代來源網站的交易規則。</p>
        </section>

        <section className="public-info-section">
          <h2>資料與交易</h2>
          <ul className="public-info-section-list">
            <li>本站整理原價屋公開頁面的必要商品與價格資訊，不代表原價屋或任何品牌。</li>
            <li>本站不販售商品，不處理付款、訂單、出貨、退換貨或售後服務。</li>
            <li>實際規格、價格、庫存與交易條件應以來源頁面當下內容為準。</li>
          </ul>
        </section>

        <section className="public-info-section">
          <h2>正確性與可用性</h2>
          <p>
            資料可能因更新時間、網路狀況、來源版面調整或解析錯誤而延遲、不完整或暫時無法使用。請在做出購買決定前回到來源頁確認。
          </p>
        </section>

        <section className="public-info-section">
          <h2>合理使用</h2>
          <p>
            請勿繞過 rate limit、大量自動化請求、干擾服務、探測非公開介面，或利用本站散布違法與有害內容。必要時可限制濫用流量。
          </p>
        </section>

        <section className="public-info-section">
          <h2>外部連結與服務調整</h2>
          <p>
            本站提供的原價屋與 Discord 連結由各自服務管理。網站功能、資料範圍與可用性可能因維護或來源變更而調整，重大變更會盡量透過
            <Link href="/announcements">網站公告</Link>說明。
          </p>
        </section>

        <p className="public-info-updated-at">
          最後更新：<time dateTime="2026-07-12">2026 年 7 月 12 日</time>
        </p>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
