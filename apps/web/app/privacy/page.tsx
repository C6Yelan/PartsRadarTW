// apps/web/app/privacy/page.tsx
// 公開說明 PartsRadarTW 的資料使用、瀏覽器儲存與隱私邊界。

import type { Metadata } from "next";
import Link from "next/link";
import PublicInfoPageLayout from "../public-info/components/PublicInfoPageLayout";

export const metadata: Metadata = {
  alternates: {
    canonical: "/privacy",
  },
  title: "隱私權政策 | PartsRadarTW",
  description: "PartsRadarTW 的資料處理與瀏覽器儲存說明。",
};

export default function PrivacyPage() {
  return (
    <PublicInfoPageLayout
      intro="本政策說明網站為了提供功能與維持安全，可能使用哪些必要資料。"
      introTitle="本站不提供網站帳號、付款或購物功能。"
      lastUpdated={{ dateTime: "2026-07-14", label: "2026 年 7 月 14 日" }}
      subtitle="資料處理與瀏覽器儲存說明"
      title="隱私權政策"
    >
      <section className="public-info-section" id="privacy-scope">
        <h2>適用範圍</h2>
        <p>
          本政策適用於 PartsRadarTW。前往原價屋、Discord 或其他外部網站後，應另依該服務的政策處理。
        </p>
      </section>

      <section className="public-info-section" id="privacy-operation">
        <h2>網站運作與安全</h2>
        <ul className="public-info-section-list">
          <li>網站會限制短時間內的過量請求，避免服務受到濫用。</li>
          <li>
            為了維持安全與排查問題，系統可能記錄請求時間、瀏覽頁面、瀏覽器與網路來源等必要資訊。
          </li>
          <li>這些資訊不會用來建立個人檔案、投放廣告或跨網站追蹤。</li>
        </ul>
      </section>

      <section className="public-info-section" id="privacy-browser-data">
        <h2>瀏覽器本機資料</h2>
        <p>
          配單內容儲存在目前使用的瀏覽器，不會自動上傳，也不會跨裝置同步。清除本站的瀏覽器資料即可移除。
        </p>
      </section>

      <section className="public-info-section" id="privacy-analysis">
        <h2>分析與廣告</h2>
        <p>目前網站不使用廣告追蹤或非必要的使用者分析。若未來有所變更，會先更新本政策。</p>
      </section>

      <section className="public-info-section" id="privacy-requests">
        <h2>聯絡、權利請求與政策更新</h2>
        <p>
          使用者可透過
          <a href="mailto:contact@partsradar.net">contact@partsradar.net</a>
          提出資料使用查詢、更正、停止使用、刪除、安全問題與網站錯誤回報。請勿在信件中附上密碼、付款資料或其他私人資訊。
        </p>
        <p>
          政策若有重要變更，會發布於<Link href="/announcements">網站公告</Link>。
        </p>
      </section>
    </PublicInfoPageLayout>
  );
}
