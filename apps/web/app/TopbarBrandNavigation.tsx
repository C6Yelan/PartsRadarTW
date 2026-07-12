// apps/web/app/TopbarBrandNavigation.tsx
// 統一全站頂部品牌與主要公開頁面導覽。

"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { BrandMarkIcon } from "./_shared/icons";
import AnnouncementTopbarLink from "./AnnouncementTopbarLink";
import DiscordTopbarLink from "./DiscordTopbarLink";
import PriceReportTopbarLink from "./PriceReportTopbarLink";

export default function TopbarBrandNavigation({
  onHomeClick,
}: {
  onHomeClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div className="topbar-brand-area">
      <Link className="brand-lockup" href="/" onClick={onHomeClick}>
        <BrandMarkIcon />
        <span>
          <span className="brand-name">PartsRadarTW</span>
          <span className="brand-subtitle">原價屋零件查詢</span>
        </span>
      </Link>
      <PriceReportTopbarLink />
      <AnnouncementTopbarLink />
      <DiscordTopbarLink />
    </div>
  );
}
