// apps/web/app/privacy/page.tsx
// 公開說明 PartsRadarTW 實際使用的技術資訊、瀏覽器儲存與隱私邊界。

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  title: "隱私權政策 | PartsRadarTW",
  description: "PartsRadarTW 的資料處理與瀏覽器儲存說明。",
};

export default function PrivacyPage() {
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
          <h1>隱私權政策</h1>
          <span>資料處理與瀏覽器儲存說明</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page">
        <section className="public-info-hero">
          <p className="public-info-kicker">PRIVACY</p>
          <strong>本站不提供 Web 帳號、付款或購物功能。</strong>
          <p>
            本政策說明瀏覽網站與使用公開 API 時，為維持服務安全與功能所需的最少技術資訊。
          </p>
        </section>

        <section className="public-info-section">
          <h2>適用範圍</h2>
          <p>
            本政策適用於 PartsRadarTW 網站及其公開 API。前往原價屋、Discord 或其他外部網站後，應另依該服務的政策處理。
          </p>
        </section>

        <section className="public-info-section">
          <h2>服務運作所需的技術資訊</h2>
          <ul className="public-info-section-list">
            <li>API 限流會處理 client network identifier，避免單一來源在短時間內過量請求。</li>
            <li>
              限流 bucket 會暫存在程序記憶體；限流診斷紀錄則使用單向雜湊後的截短識別值。兩者都不用來建立個人檔案或跨站追蹤。
            </li>
            <li>
              代管環境或反向代理可能產生包含請求時間、路徑與 user agent
              的必要存取日誌；實際欄位與保存期間依部署設定，僅應保留服務、安全與排錯所需期間。
            </li>
          </ul>
        </section>

        <section className="public-info-section">
          <h2>瀏覽器本機資料</h2>
          <p>
            配單內容使用瀏覽器的 <code>localStorage</code>
            儲存在目前裝置，不會自動上傳為帳號資料，也不會跨裝置同步。清除本站瀏覽器儲存空間即可移除。
          </p>
        </section>

        <section className="public-info-section">
          <h2>分析、廣告與 Cookie</h2>
          <p>
            目前網站不使用非必要的分析服務、廣告追蹤或行銷 Cookie。若未來實際導入，會先更新本政策與必要告知。
          </p>
        </section>

        <section className="public-info-section">
          <h2>查詢與政策更新</h2>
          <p>
            公開聯絡管道尚待確認；公布後會更新於<Link href="/about#contact">關於本站</Link>
            。政策若有實質變更，會同步發布於<Link href="/announcements">網站公告</Link>。
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
