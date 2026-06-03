// apps/web/app/products/[id]/page.tsx
import type { Metadata } from "next";
import ProductDetail from "./product-detail";
import { createProductDetailMetadata, type ProductMetadataReadClient } from "./metadata";
import { normalizeReturnHref } from "./return-href";

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

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

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams]);

  return (
    <ProductDetail productId={id} returnHref={normalizeReturnHref(resolvedSearchParams.returnTo)} />
  );
}
