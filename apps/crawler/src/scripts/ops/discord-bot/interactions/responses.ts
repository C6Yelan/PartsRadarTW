// apps/crawler/src/scripts/ops/discord-bot/interactions/responses.ts
// 提供 Discord interaction handler 共用的安全回覆 helper，統一處理不支援、缺少使用者與功能停用情境。

import { sendInteractionResponse } from "../rest";
import type { DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";

// 回覆目前 bot 版本無法處理的 interaction，避免 handler 靜默失敗。
export async function sendUnsupportedInteractionResponse({
  interaction,
  options,
  fetchImpl,
}: {
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
}): Promise<void> {
  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: "這個 PartsRadarTW bot 版本尚未支援此操作。",
  });
}

// 回覆缺少 Discord user id 的互動，讓後續 handler 不必處理匿名或不完整 payload。
export async function sendMissingUserResponse({
  interaction,
  options,
  fetchImpl,
}: {
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
}): Promise<void> {
  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content: "無法辨識這次操作的 Discord 使用者。",
  });
}

// 回覆功能旗標停用訊息，讓 command、component 與 modal 入口共用相同送出方式。
export async function sendFeatureDisabledResponse({
  interaction,
  options,
  fetchImpl,
  content,
}: {
  interaction: DiscordInteraction;
  options: DiscordBotOptions;
  fetchImpl: FetchImpl;
  content: string;
}): Promise<void> {
  await sendInteractionResponse({
    token: options.token,
    apiBaseUrl: options.apiBaseUrl,
    interaction,
    fetchImpl,
    content,
  });
}
