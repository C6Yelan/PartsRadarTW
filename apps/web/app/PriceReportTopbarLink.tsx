// apps/web/app/PriceReportTopbarLink.tsx
// 提供首頁與配單頁共用的價格變動總覽入口。

import Link from "next/link";
import { TrendIcon } from "./_shared/icons";

export default function PriceReportTopbarLink() {
  return (
    <Link className="price-report-topbar-link" href="/price-report" title="價格變動總覽">
      <TrendIcon className="price-report-topbar-icon" />
      <span>價格</span>
    </Link>
  );
}
