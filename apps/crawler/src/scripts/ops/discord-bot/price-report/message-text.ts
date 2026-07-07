// apps/crawler/src/scripts/ops/discord-bot/price-report/message-text.ts
// 提供價格報告訊息組裝時需要的金額、站內連結與 Discord Markdown 文字格式化工具。

// 將價格報告中的金額格式化為台幣優先的顯示文字，非 TWD 幣別保留原始代碼。
export function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

// 格式化帶正負號的價格差，供價格變動摘要顯示。
export function formatSignedTaiwanDollar(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";

  return `${sign}${formatTaiwanDollar(Math.abs(amount), currency)}`;
}

// 建立站內商品頁 URL，讓 Discord 報告連回 PartsRadarTW 商品詳細頁。
export function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

// 將來源商品文字壓成單行，避免換行破壞 Discord 報告排版。
export function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// 轉義 Markdown link label 會破壞連結語法的字元。
export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

// 轉義一般 Discord Markdown 文字，避免商品分類名稱意外觸發格式語法。
export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_~`|[\]])/g, "\\$1");
}
