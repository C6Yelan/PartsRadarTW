// apps/crawler/src/scripts/ops/discord-bot/price-report/message-text.ts
export function formatTaiwanDollar(amount: number, currency: string): string {
  if (currency === "TWD") {
    return `NT$${amount.toLocaleString("en-US")}`;
  }

  return `${currency} ${amount.toLocaleString("en-US")}`;
}

export function formatSignedTaiwanDollar(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";

  return `${sign}${formatTaiwanDollar(Math.abs(amount), currency)}`;
}

export function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

export function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\[\]])/g, "\\$1");
}

export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_~`|[\]])/g, "\\$1");
}
