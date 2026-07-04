// apps/web/app/products/[id]/detail/link-health-notice.tsx
import type { ProductDetailBody, ProductLinkHealth } from "./types";

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

function toLinkHealthNotice(label: string, health: ProductLinkHealth | null) {
  if (!health || health.status === "ok") {
    return null;
  }

  return health.status === "broken" ? `${label}可能已失效` : `${label}暫時無法確認`;
}
