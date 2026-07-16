"use client";
// apps/web/app/build-list/GlobalFloatingBuildListLink.tsx
// 在配單頁以外的公開 route 掛載單一浮動配單入口，並沿用既有 persisted intent 狀態。

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CartIcon } from "../_shared/icons";
import { useBuildList } from "./use-build-list";

export default function GlobalFloatingBuildListLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isReady, summary } = useBuildList();

  if (!isReady || pathname === "/build-list") {
    return null;
  }

  const search = searchParams.toString();
  const currentLocation = `${pathname}${search ? `?${search}` : ""}`;
  const buildListParams = new URLSearchParams({ returnTo: currentLocation });

  return (
    <Link
      aria-label={`開啟配單，目前 ${summary.totalQuantity} 件`}
      className="build-list-floating-link"
      href={`/build-list?${buildListParams}`}
      title="開啟配單"
    >
      <CartIcon className="build-list-floating-icon" />
      <span className="build-list-floating-badge" aria-hidden="true">
        {summary.totalQuantity}
      </span>
    </Link>
  );
}
