import ProductDetail from "./product-detail";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ProductDetail productId={id} />;
}
