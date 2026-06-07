// apps/web/app/products/[id]/product-share.ts

export type ProductShareResult = "shared" | "copied" | "cancelled" | "failed";
export type ProductShareStatus = Extract<ProductShareResult, "copied" | "failed"> | null;

interface ProductShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
}

export function createProductShareUrl(origin: string, productId: string): string {
  return new URL(`/products/${encodeURIComponent(productId)}`, origin).toString();
}

export async function shareProductUrl({
  navigatorRef,
  title,
  text,
  url,
}: {
  navigatorRef: ProductShareNavigator;
  title: string;
  text: string;
  url: string;
}): Promise<ProductShareResult> {
  if (typeof navigatorRef.share === "function") {
    try {
      await navigatorRef.share({
        title,
        text,
        url,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }

      return "failed";
    }
  }

  if (typeof navigatorRef.clipboard?.writeText === "function") {
    try {
      await navigatorRef.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}

export function toVisibleProductShareStatus(result: ProductShareResult): ProductShareStatus {
  return result === "copied" || result === "failed" ? result : null;
}

export function formatProductShareStatus(status: ProductShareStatus): string {
  if (status === "copied") {
    return "已複製連結";
  }

  if (status === "failed") {
    return "目前無法分享";
  }

  return "";
}
