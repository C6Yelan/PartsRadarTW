// apps/web/app/privacy/page.tsx
// 公開說明 PartsRadarTW 實際使用的技術資訊、瀏覽器儲存與隱私邊界。

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, BrandMarkIcon } from "../_shared/icons";
import SiteDisclaimer from "../site-disclaimer";

export const metadata: Metadata = {
  alternates: {
    canonical: "/privacy",
  },
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

        <section className="public-info-section public-info-launch-warning" aria-labelledby="launch-readiness-title">
          <h2 id="launch-readiness-title">上線準備狀態</h2>
          <p>
            本站尚未確認正式對外部署環境的存取日誌欄位、保存期間、存取權限與刪除流程，也尚未提供一般使用者可提交隱私權請求、安全問題或錯誤回報的公開管道。
          </p>
          <p>完成上述確認前，本政策不應視為已符合正式公開上線條件。</p>
        </section>

        <section className="public-info-section">
          <h2>服務運作所需的技術資訊</h2>
          <ul className="public-info-section-list">
            <li>API 限流會處理 client network identifier，避免單一來源在短時間內過量請求。</li>
            <li>
              限流 bucket 會暫存在程序記憶體；發生限流拒絕時，診斷紀錄使用 SHA-256
              雜湊前 16 個十六進位字元，不寫入原始 IP。兩者都不用來建立個人檔案或跨站追蹤。
            </li>
            <li>
              代管環境或反向代理可能產生包含請求時間、路徑與 user agent
              的必要存取日誌；實際欄位與保存期間依部署設定，僅應保留服務、安全與排錯所需期間。
            </li>
          </ul>
        </section>

        <section className="public-info-section">
          <h2>部署環境與日誌</h2>
          <p>
            Repository 預設讓 Web 與 PostgreSQL 僅綁定本機介面，並提供選用的 Cloudflare Tunnel
            部署設定；這些檔案不能證明正式環境實際啟用哪些代理或記錄哪些資料。
          </p>
          <p>
            Repository 目前未設定 container 日誌輪替或保存期限。正式公開上線前，部署者必須確認實際欄位、保存期間、存取權限與刪除流程，並更新本節。
          </p>
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

        <section className="public-info-section" id="privacy-requests">
          <h2>聯絡、權利請求與政策更新</h2>
          <p>
            使用者應可提出資料處理查詢、更正、停止利用、刪除、安全問題與網站錯誤回報；但本站目前尚未提供可受理上述請求的專用 email 或公開表單。
          </p>
          <p>
            <a href="https://github.com/C6Yelan/PartsRadarTW" rel="noreferrer" target="_blank">
              GitHub repository
            </a>
            僅供瀏覽公開原始碼，其 Issues 目前限制建立新 issue，不能作為正式請求管道。聯絡準備狀態會更新於
            <Link href="/about#contact">關於本站</Link>；政策若有實質變更，會同步發布於
            <Link href="/announcements">網站公告</Link>。
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
