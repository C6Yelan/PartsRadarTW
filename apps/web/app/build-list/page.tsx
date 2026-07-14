// apps/web/app/build-list/page.tsx
// 提供 /build-list route entrypoint，將配單頁互動交給 client component。

import type { Metadata } from "next";
import { normalizeBuildListReturnHref } from "../products/[id]/return-href";
import BuildListPageClient from "./BuildListPageClient";

export const metadata: Metadata = {
  title: "配單 | PartsRadarTW",
  description: "在瀏覽器中整理電腦零件配單與價格估算。",
  alternates: {
    canonical: "/build-list",
  },
  robots: {
    index: false,
    follow: false,
  },
};

interface BuildListPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

// 接線 Next.js route、正規化返回來源，再交給配單 client-side 頁面。
export default async function BuildListPage({ searchParams }: BuildListPageProps) {
  const resolvedSearchParams = await searchParams;

  return <BuildListPageClient returnHref={normalizeBuildListReturnHref(resolvedSearchParams.returnTo)} />;
}
