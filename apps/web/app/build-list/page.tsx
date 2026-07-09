// apps/web/app/build-list/page.tsx
// 提供 /build-list route entrypoint，將配單頁互動交給 client component。

import BuildListPageClient from "./BuildListPageClient";

// 接線 Next.js route 與配單 client-side 頁面。
export default function BuildListPage() {
  return <BuildListPageClient />;
}
