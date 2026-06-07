// apps/web/app/products/[id]/product-share.ts

export type ProductShareResult = "shared" | "copied" | "cancelled" | "failed";

interface ProductShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
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
