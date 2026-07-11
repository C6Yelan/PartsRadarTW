// apps/crawler/src/scripts/ops/discord-bot/delivery-error-fields.ts
// 將 Discord message send result 映射成 personal / public delivery 共用的結構化錯誤欄位。

import type { DiscordDeliveryErrorCategory, DiscordMessageSendResult } from "./types";

export interface DiscordDeliveryErrorFields {
  errorCategory: DiscordDeliveryErrorCategory | null;
  errorMessage: null;
  httpStatus: number | null;
  providerErrorCode: number | null;
}

export const NO_DISCORD_DELIVERY_ERROR = {
  errorCategory: null,
  errorMessage: null,
  httpStatus: null,
  providerErrorCode: null,
} as const satisfies DiscordDeliveryErrorFields;

// 只回傳分類與必要數值，不產生可持久化的技術摘要。
export function toDiscordDeliveryErrorFields(
  result: DiscordMessageSendResult,
): DiscordDeliveryErrorFields {
  if (result.status === "sent") {
    return NO_DISCORD_DELIVERY_ERROR;
  }

  return {
    errorCategory: result.errorCategory,
    errorMessage: null,
    httpStatus: result.httpStatus,
    providerErrorCode: result.providerErrorCode,
  };
}
