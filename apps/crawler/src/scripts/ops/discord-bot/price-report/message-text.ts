// apps/crawler/src/scripts/ops/discord-bot/price-report/message-text.ts
// 提供價格報告特有的 signed 金額與一般 Discord Markdown 文字格式化工具。

import { formatTaiwanDollar } from "../message-text";

// 格式化帶正負號的價格差，供價格變動摘要顯示。
export function formatSignedTaiwanDollar(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";

  return `${sign}${formatTaiwanDollar(Math.abs(amount))}`;
}

// 轉義一般 Discord Markdown 文字，避免商品分類名稱意外觸發格式語法。
export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\*_~`|[\]])/g, "\\$1");
}
