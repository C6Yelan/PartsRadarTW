// apps/web/app/products/[id]/page.tsx
import ProductDetail from "./product-detail";
import { normalizeReturnHref } from "./return-href";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  return (
    <ProductDetail productId={id} returnHref={normalizeReturnHref(resolvedSearchParams.returnTo)} />
  );
}
