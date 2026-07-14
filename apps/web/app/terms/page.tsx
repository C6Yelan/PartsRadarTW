// apps/web/app/terms/page.tsx
// 公開說明 PartsRadarTW 的非官方定位、資料限制與合理使用規則。

import type { Metadata } from "next";
import Link from "next/link";
import PublicInfoPageLayout from "../public-info/components/PublicInfoPageLayout";

export const metadata: Metadata = {
  alternates: {
    canonical: "/terms",
  },
  title: "使用條款 | PartsRadarTW",
  description: "PartsRadarTW 的資料來源、使用限制與責任範圍。",
};

export default function TermsPage() {
  return (
    <PublicInfoPageLayout
      intro="這些條款說明資料限制與合理使用方式，不取代來源網站的交易規則。"
      introTitle="本站是非官方的商品與價格資料整理工具。"
      lastUpdated={{ dateTime: "2026-07-14", label: "2026 年 7 月 14 日" }}
      subtitle="資料限制與合理使用規則"
      title="使用條款"
    >
      <section className="public-info-section" id="terms-transactions">
        <h2>資料與交易</h2>
        <ul className="public-info-section-list">
          <li>本站整理原價屋公開頁面的必要商品與價格資訊，不代表原價屋或任何品牌。</li>
          <li>本站不販售商品，不處理付款、訂單、出貨、退換貨或售後服務。</li>
          <li>實際規格、價格、庫存與交易條件應以來源頁面當下內容為準。</li>
        </ul>
      </section>

      <section className="public-info-section" id="terms-availability">
        <h2>正確性與可用性</h2>
        <p>
          資料可能因更新時間、網路狀況、來源版面調整或解析錯誤而延遲、不完整或暫時無法使用。請在做出購買決定前回到來源頁確認。
        </p>
      </section>

      <section className="public-info-section" id="terms-use">
        <h2>合理使用</h2>
        <p>
          請勿在短時間內大量請求、干擾網站運作、嘗試存取未開放功能，或利用本站散布違法與有害內容。必要時，本站可限制明顯影響服務的使用行為。
        </p>
      </section>

      <section className="public-info-section" id="terms-external">
        <h2>外部連結與服務調整</h2>
        <p>
          原價屋與 Discord
          連結由各自服務管理。網站功能與資料範圍可能因維護或來源變更而調整，重大變更會透過
          <Link href="/announcements">網站公告</Link>說明。
        </p>
      </section>
    </PublicInfoPageLayout>
  );
}
