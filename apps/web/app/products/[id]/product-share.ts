// apps/web/app/products/[id]/product-share.ts
// 處理商品詳細頁分享連結建立、瀏覽器分享 / 剪貼簿 fallback 與狀態文字。

export type ProductShareResult = "shared" | "copied" | "cancelled" | "failed";
export type ProductShareStatus = Extract<ProductShareResult, "copied" | "failed"> | null;

// 抽出分享所需的 browser navigator 能力，讓測試可注入 Web Share 或 Clipboard fake。
interface ProductShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
}

// 建立商品 canonical 分享 URL，刻意排除 returnTo 等目前頁面 query state。
export function createProductShareUrl(origin: string, productId: string): string {
  return new URL(`/products/${encodeURIComponent(productId)}`, origin).toString();
}

// 執行商品分享；目前優先使用 Web Share API，不支援時退回複製商品 URL。
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

// 只讓剪貼簿 fallback 成功與真正失敗顯示頁面狀態，原生分享成功或取消不打擾使用者。
export function toVisibleProductShareStatus(result: ProductShareResult): ProductShareStatus {
  return result === "copied" || result === "failed" ? result : null;
}

// 將分享結果狀態轉成商品詳細頁按鈕下方的短提示文字。
export function formatProductShareStatus(status: ProductShareStatus): string {
  if (status === "copied") {
    return "已複製連結";
  }

  if (status === "failed") {
    return "目前無法分享";
  }

  return "";
}
