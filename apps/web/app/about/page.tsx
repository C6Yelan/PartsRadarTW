// apps/web/app/about/page.tsx
// 說明 PartsRadarTW 的用途、資料來源、公開功能與聯絡邊界。

import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon } from "../_shared/icons";
import PublicInfoPageLayout from "../public-info/components/PublicInfoPageLayout";

export const metadata: Metadata = {
  alternates: {
    canonical: "/about",
  },
  title: "關於與聯絡 | PartsRadarTW",
  description: "PartsRadarTW 的用途、資料來源、公開功能與聯絡方式。",
};

export default function AboutPage() {
  return (
    <PublicInfoPageLayout
      intro="PartsRadarTW 是非官方、非商業的個人專案，不販售商品，也不代表原價屋或任何硬體品牌。"
      introTitle="讓公開商品資料更容易搜尋、比較與整理。"
      lastUpdated={{ dateTime: "2026-07-14", label: "2026 年 7 月 14 日" }}
      subtitle="用途、資料來源與聯絡方式"
      title="關於與聯絡"
    >
      <section className="public-info-section" id="about-purpose">
        <h2>專案用途</h2>
        <p>本站協助使用者查詢零件、比較近期價格變動，並在瀏覽器中整理個人配單。</p>
      </section>

      <section className="public-info-section" id="about-source">
        <h2>資料從哪裡來</h2>
        <p>
          商品名稱、分類、價格與來源連結整理自原價屋公開頁面。資料更新可能有延遲，購買前請回到來源頁確認。
        </p>
      </section>

      <section className="public-info-section" id="about-features">
        <h2>目前提供的功能</h2>
        <ul className="public-info-section-list">
          <li>依商品名稱、分類、廠商與類別專屬條件搜尋零件。</li>
          <li>
            在<Link href="/price-report">價格變動總覽</Link>查看近期降價、漲價與新品。
          </li>
          <li>使用瀏覽器本機配單整理數量與預估總價，不需註冊帳號。</li>
          <li>
            透過<Link href="/discord">Discord 通知</Link>頁查看提醒功能的使用方式。
          </li>
        </ul>
      </section>

      <section className="public-info-section" id="contact">
        <h2>聯絡與回報</h2>
        <p>
          專案原始碼與公開資訊可在
          <a
            aria-label="GitHub repository（在新分頁開啟）"
            href="https://github.com/C6Yelan/PartsRadarTW"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
            <ExternalLinkIcon className="public-external-link-icon" />
          </a>
          查看。
        </p>
        <p>
          若想回報網站問題、內容錯誤或提供建議，請來信至
          <a href="mailto:contact@partsradar.net">contact@partsradar.net</a>
          {"。"}
        </p>
        <p>
          請勿透過原價屋客服回報本站問題；來信時也請勿提供密碼、付款資料或其他敏感個人資訊。
        </p>
      </section>
    </PublicInfoPageLayout>
  );
}
