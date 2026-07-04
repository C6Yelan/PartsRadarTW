// apps/web/app/products/[id]/detail/use-product-detail.ts
import { useEffect, useState } from "react";
import type { ProductDetailBody, ProductDetailLoadState } from "./types";

export function useProductDetail(productId: string) {
  const [state, setState] = useState<ProductDetailLoadState>("idle");
  const [product, setProduct] = useState<ProductDetailBody | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setProduct(null);

    async function loadProductDetail() {
      try {
        const productResponse = await fetch(`/api/products/${productId}`, {
          signal: controller.signal,
        });

        if (productResponse.status === 404) {
          setState("not-found");
          return;
        }

        if (!productResponse.ok) {
          throw new Error("Failed to load product.");
        }

        const nextProduct = (await productResponse.json()) as ProductDetailBody;
        setProduct(nextProduct);
        setState("ready");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState("error");
      }
    }

    void loadProductDetail();

    return () => controller.abort();
  }, [productId]);

  return { product, state };
}
