"use client";
// apps/web/app/build-list/GlobalFloatingBuildListLink.tsx
// 在配單頁以外的公開 route 掛載單一浮動配單入口，並沿用既有 persisted intent 狀態。

import { usePathname } from "next/navigation";
import FloatingBuildListLink from "./FloatingBuildListLink";
import { useBuildList } from "./use-build-list";

export default function GlobalFloatingBuildListLink() {
  const pathname = usePathname();
  const { isReady, summary } = useBuildList();

  if (!isReady || pathname === "/build-list") {
    return null;
  }

  return <FloatingBuildListLink summary={summary} />;
}
