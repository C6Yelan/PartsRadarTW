import ProductDetail from "./product-detail";

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

function normalizeReturnHref(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }

  const url = new URL(candidate, "https://partsradar.local");

  if (url.origin !== "https://partsradar.local" || url.pathname !== "/") {
    return "/";
  }

  return `${url.pathname}${url.search}`;
}
