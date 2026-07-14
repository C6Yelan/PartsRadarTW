// apps/web/app/public-info/components/PublicInfoPageLayout.tsx
// 統一 About、Privacy 與 Terms 的公開資訊頁 shell、標題、內容寬度與 footer。

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "../../_shared/icons";
import SiteDisclaimer from "../../site-disclaimer";
import TopbarBrandNavigation from "../../TopbarBrandNavigation";

export default function PublicInfoPageLayout({
  children,
  intro,
  introTitle,
  lastUpdated,
  subtitle,
  title,
}: {
  children: ReactNode;
  intro: ReactNode;
  introTitle: string;
  lastUpdated: { dateTime: string; label: string };
  subtitle: string;
  title: string;
}) {
  return (
    <div className="app-shell public-info-shell">
      <header className="topbar public-info-topbar">
        <TopbarBrandNavigation />
        <div className="public-info-topbar-title">
          <h1>{title}</h1>
          <span>{subtitle}</span>
        </div>
        <Link className="back-link public-info-back-link" href="/">
          <ArrowLeftIcon />
          返回查詢
        </Link>
      </header>

      <main className="public-info-page">
        <section className="public-info-hero">
          <strong>{introTitle}</strong>
          <p>{intro}</p>
        </section>

        {children}

        <p className="public-info-updated-at">
          最後更新：<time dateTime={lastUpdated.dateTime}>{lastUpdated.label}</time>
        </p>
      </main>

      <SiteDisclaimer />
    </div>
  );
}
