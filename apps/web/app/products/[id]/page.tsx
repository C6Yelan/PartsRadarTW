// apps/web/app/products/[id]/page.tsx
// 串接 Next.js 商品詳細頁 route、metadata 產生與返回連結正規化。

import type { Metadata } from "next";
import { normalizeProductDetailReturnHref } from "../../_shared/return-href";
import { createProductDetailMetadata, type ProductMetadataReadClient } from "./metadata";
import ProductDetail from "./product-detail";

// Next.js app route 提供的商品詳細頁參數契約。
interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

// 依商品 id 建立商品詳細頁 SEO / Open Graph metadata，查詢失敗時由 metadata builder 回退安全預設。
export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const client: ProductMetadataReadClient = {
    product: {
      async findFirst(args) {
        const { prisma } = await import("@partsradar/db");

        return prisma.product.findFirst(args);
      },
    },
  };

  return createProductDetailMetadata(client, id);
}

// 商品詳細頁 server entrypoint，解析 route 與返回來源後交給 client-side 商品詳細介面。
export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  return (
    <ProductDetail
      key={id}
      productId={id}
      returnHref={normalizeProductDetailReturnHref(resolvedSearchParams.returnTo)}
    />
  );
}
