// apps/web/app/page.tsx
import { Suspense } from "react";

import ProductExplorer from "./product-explorer/ProductExplorer";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="page-loading">載入查詢工具</div>}>
      <ProductExplorer />
    </Suspense>
  );
}
