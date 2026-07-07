// apps/crawler/src/scripts/ops/discord-bot/interaction-responses.ts
// 封裝 Discord interaction callback 與 deferred response API，統一建立 payload 與失敗處理。

import {
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE,
  DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE,
  DISCORD_INTERACTION_CALLBACK_DEFERRED_UPDATE_MESSAGE,
  DISCORD_INTERACTION_CALLBACK_MODAL,
} from "./constants";
import { createDiscordMessagePayload } from "./message-payload";
import { formatDiscordRestFailure } from "./rest-failure";
import { sendDiscordRestRequest } from "./rest-request";
import type {
  DiscordBotMessage,
  DiscordInteraction,
  DiscordModal,
  DiscordRestResult,
  FetchImpl,
} from "./types";

// 立即回覆 interaction 訊息；預設使用 ephemeral，避免指令錯誤或個人設定公開到頻道。
export async function sendInteractionResponse({
  token,
  apiBaseUrl,
  interaction,
  fetchImpl,
  message,
  content,
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  message?: DiscordBotMessage;
  content?: string;
}): Promise<void> {
  const result = await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE,
      data: createDiscordMessagePayload(message ?? content ?? "OK", true),
    },
  });

  assertDiscordInteractionResponseSucceeded("message", result);
}

// 回覆 modal callback，讓 Discord 開啟使用者輸入表單。
export async function sendModalInteractionResponse({
  token,
  apiBaseUrl,
  interaction,
  fetchImpl,
  modal,
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  modal: DiscordModal;
}): Promise<void> {
  const result = await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_MODAL,
      data: modal,
    },
  });

  assertDiscordInteractionResponseSucceeded("modal", result);
}

// 先延後回覆需要較久處理的 interaction，後續再 patch original response。
export async function deferInteractionResponse({
  token,
  apiBaseUrl,
  interaction,
  fetchImpl,
  ephemeral = false,
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  ephemeral?: boolean;
}): Promise<void> {
  const result = await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE,
      data: ephemeral ? { flags: DISCORD_EPHEMERAL_MESSAGE_FLAG } : undefined,
    },
  });

  assertDiscordInteractionResponseSucceeded("deferred", result);
}

// 延後更新既有 message component，避免按鈕或選單互動超過 Discord callback 時限。
export async function deferInteractionMessageUpdate({
  token,
  apiBaseUrl,
  interaction,
  fetchImpl,
}: {
  token: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
}): Promise<void> {
  const result = await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: `/interactions/${interaction.id}/${interaction.token}/callback`,
    body: {
      type: DISCORD_INTERACTION_CALLBACK_DEFERRED_UPDATE_MESSAGE,
    },
  });

  assertDiscordInteractionResponseSucceeded("deferred update", result);
}

// 編輯先前 deferred 的 original interaction response，送出最終訊息內容。
export async function editDeferredInteractionResponse({
  token,
  applicationId,
  apiBaseUrl,
  interaction,
  fetchImpl,
  message,
  content,
}: {
  token: string;
  applicationId: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  fetchImpl: FetchImpl;
  message?: DiscordBotMessage;
  content?: string;
}): Promise<void> {
  const result = await sendDiscordRestRequest({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PATCH",
    path: `/webhooks/${applicationId}/${interaction.token}/messages/@original`,
    body: createDiscordMessagePayload(message ?? content ?? "OK"),
  });

  assertDiscordInteractionResponseSucceeded("deferred message", result);
}

// 將 Discord REST 失敗統一轉成例外，交由上層安全格式化後記錄或回覆。
function assertDiscordInteractionResponseSucceeded(
  responseKind: "message" | "modal" | "deferred" | "deferred update" | "deferred message",
  result: DiscordRestResult<unknown>,
): void {
  if (result.status === "ok") {
    return;
  }

  throw new Error(
    `Discord ${responseKind} interaction response failed: ${formatDiscordRestFailure(result)}`,
  );
}
