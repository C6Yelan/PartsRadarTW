// apps/web/app/products/[id]/page.tsx
// 串接 Next.js 商品詳細頁 route、metadata 產生與返回連結正規化。

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizeProductId } from "../../_shared/product-id";
import { normalizeProductDetailReturnHref } from "../../_shared/return-href";
import { getPublicProductDetail } from "./data";
import { createProductDetailMetadata } from "./metadata";
import ProductDetail from "./product-detail";

// Next.js app route 提供的商品詳細頁參數契約。
interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

// 依商品 id 建立商品詳細頁 SEO / Open Graph metadata，查詢失敗時由 metadata builder 回退安全預設。
export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return createProductDetailMetadata(getPublicProductDetail, id);
}

// 商品詳細頁 server entrypoint，先確認公開商品並將初始資料交給既有 client 介面 hydration。
export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const normalizedProductId = normalizeProductId(id);

  if (!normalizedProductId) {
    notFound();
  }

  const product = await getPublicProductDetail(normalizedProductId);

  if (!product) {
    notFound();
  }

  return (
    <ProductDetail
      initialProduct={product}
      key={normalizedProductId}
      productId={normalizedProductId}
      returnHref={normalizeProductDetailReturnHref(resolvedSearchParams.returnTo)}
    />
  );
}
