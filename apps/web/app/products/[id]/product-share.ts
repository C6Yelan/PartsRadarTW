// apps/web/app/products/[id]/product-share.ts
// 處理商品詳細頁 canonical URL 複製與狀態文字。

export type ProductShareResult = "copied" | "failed";
export type ProductShareStatus = ProductShareResult | null;

// 抽出複製連結所需的 browser navigator 能力，讓測試可注入 Clipboard fake。
interface ProductShareNavigator {
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
}

// 建立商品 canonical 分享 URL，刻意排除 returnTo 等目前頁面 query state。
export function createProductShareUrl(origin: string, productId: string): string {
  return new URL(`/products/${encodeURIComponent(productId)}`, origin).toString();
}

// 將商品 canonical URL 複製到剪貼簿；能力缺失或寫入失敗時回傳安全失敗狀態。
export async function shareProductUrl({
  navigatorRef,
  url,
}: {
  navigatorRef: ProductShareNavigator;
  url: string;
}): Promise<ProductShareResult> {
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

// 將複製結果狀態轉成商品詳細頁按鈕下方的短提示文字。
export function formatProductShareStatus(status: ProductShareStatus): string {
  if (status === "copied") {
    return "已複製到剪貼簿";
  }

  if (status === "failed") {
    return "無法自動複製，請從瀏覽器網址列複製連結。";
  }

  return "";
}
