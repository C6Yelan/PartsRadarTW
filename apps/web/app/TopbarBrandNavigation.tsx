// apps/web/app/TopbarBrandNavigation.tsx
// 統一全站頂部品牌與主要公開頁面導覽。

"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { BrandMarkIcon } from "./_shared/icons";

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
      <Link className="topbar-nav-link" href="/price-report">
        價格變動總覽
      </Link>
      <Link className="topbar-nav-link" href="/announcements">
        公告
      </Link>
      <Link className="discord-topbar-link" href="/discord" title="Discord 通知">
        <DiscordLogoIcon />
        <span>Discord</span>
      </Link>
    </div>
  );
}

function DiscordLogoIcon() {
  return (
    <svg className="discord-logo-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M20.3 4.4A19.8 19.8 0 0 0 15.3 3c-.2.4-.5.9-.6 1.3a18.3 18.3 0 0 0-5.4 0C9.1 3.9 8.9 3.4 8.7 3a19.7 19.7 0 0 0-5 1.4C.5 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6.1 3.1c.5-.7.9-1.4 1.3-2.1-.7-.3-1.4-.6-2.1-1l.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4c-.7.4-1.3.7-2.1 1 .4.7.8 1.4 1.3 2.1a19.9 19.9 0 0 0 6.1-3.1c.5-5.2-.8-9.8-3.5-13.8ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
