"use client";
// apps/web/app/build-list/GlobalFloatingBuildListLink.tsx
// 在配單頁以外的公開 route 掛載單一浮動配單入口，並沿用既有 persisted intent 狀態。

import { usePathname, useSearchParams } from "next/navigation";
import FloatingBuildListLink from "./FloatingBuildListLink";
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

  return <FloatingBuildListLink href={`/build-list?${buildListParams}`} summary={summary} />;
}
