// apps/web/app/products/[id]/detail/link-health-notice.tsx
// 顯示商品詳細頁來源連結健康狀態的低干擾提示。

import type { ProductDetailBody, ProductLinkHealth } from "./types";

// 依商品來源連結健康狀態，在購買按鈕下方顯示需要使用者注意的提示。
export default function LinkHealthNotice({ product }: { product: ProductDetailBody }) {
  const notices = [toLinkHealthNotice("原價屋連結", product.source.health)].filter(
    (notice): notice is string => Boolean(notice),
  );

  if (notices.length === 0) {
    return null;
  }

  return (
    <p className="link-health-note" role="status">
      {notices.join("　")}
    </p>
  );
}

// 將 link health 狀態轉成使用者可理解的來源連結提示；正常或無紀錄時不顯示。
function toLinkHealthNotice(label: string, health: ProductLinkHealth | null) {
  if (!health || health.status === "ok") {
    return null;
  }

  return health.status === "broken" ? `${label}可能已失效` : `${label}暫時無法確認`;
}
