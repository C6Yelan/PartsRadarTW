// apps/crawler/src/scripts/ops/discord-bot/message-text.ts
// 提供 Discord 訊息共用的純文字、TWD、站內連結與台北時間格式化。

import { TIME_ZONE } from "./constants";

// 將輸入文字整理成可放進 Discord payload 的安全長度字串。
export function formatDiscordBotText(value: string, maxLength: number): string {
  const text = replaceControlCharacters(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

// 建立站內商品頁 URL，讓各類 Discord 訊息共用同一個公開連結格式。
export function createProductUrl(publicBaseUrl: string, productId: string): string {
  return new URL(`/products/${productId}`, publicBaseUrl).toString();
}

// DB Currency enum 與目前唯一資料來源都只允許 TWD，Discord 顯示固定使用 NT$。
export function formatTaiwanDollar(amount: number): string {
  return `NT$${amount.toLocaleString("en-US")}`;
}

// 將來源商品文字壓成單行，避免換行破壞 Discord 訊息排版。
export function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// 跳脫 Markdown link label 中會破壞連結語法的字元。
export function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[[\]\\]/g, "\\$&");
}

// 將時間格式化為 Discord 訊息共用的台北時間分鐘粒度。
export function formatTaipeiMinute(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("month")}/${byType.get("day")} ${byType.get("hour")}:${byType.get("minute")} GMT+8`;
}

// 保留換行與常見空白，但替換不可見控制字元，避免破壞 Discord 顯示或 payload。
function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControlCharacter = (code >= 0 && code <= 31) || code === 127;

    return isControlCharacter && !isAllowedWhitespace ? " " : character;
  }).join("");
}
