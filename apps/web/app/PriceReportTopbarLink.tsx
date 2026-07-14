// apps/web/app/PriceReportTopbarLink.tsx
// 提供首頁與配單頁共用的價格變動總覽入口。

import Link from "next/link";

export default function PriceReportTopbarLink() {
  return (
    <Link className="topbar-nav-link" href="/price-report">
      價格變動總覽
    </Link>
  );
}
