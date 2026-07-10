// apps/crawler/src/scripts/ops/discord-bot/rest-failure.ts
// 將 Discord REST 失敗結果轉成只含結構化欄位的後台 log / exception 摘要。

import type { DiscordRestResult } from "./types";

// 格式化非成功 REST 結果；使用者可見訊息不得直接使用這個技術摘要。
export function formatDiscordRestFailure(
  result: Exclude<DiscordRestResult<unknown>, { status: "ok" }>,
): string {
  if (result.status === "rate_limited") {
    return `rate_limited httpStatus=429 providerErrorCode=${result.providerErrorCode ?? "none"} retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`;
  }

  return `failed category=${result.errorCategory} httpStatus=${result.httpStatus ?? "none"} providerErrorCode=${result.providerErrorCode ?? "none"}`;
}
