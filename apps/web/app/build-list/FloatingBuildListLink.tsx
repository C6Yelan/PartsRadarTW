// apps/web/app/build-list/FloatingBuildListLink.tsx
// 提供商品頁面共用的浮動配單入口，只顯示 persisted intent 的商品數量。

import Link from "next/link";
import { CartIcon } from "../_shared/icons";
import type { BuildListIntentSummary } from "./model";

export default function FloatingBuildListLink({ summary }: { summary: BuildListIntentSummary }) {
  return (
    <Link
      aria-label={`開啟配單，目前 ${summary.totalQuantity} 件`}
      className="build-list-floating-link"
      href="/build-list"
      title="開啟配單"
    >
      <CartIcon className="build-list-floating-icon" />
      <span className="build-list-floating-badge" aria-hidden="true">
        {summary.totalQuantity}
      </span>
    </Link>
  );
}
