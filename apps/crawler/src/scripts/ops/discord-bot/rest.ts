// apps/crawler/src/scripts/ops/discord-bot/rest.ts
// 提供 Discord REST facade：訊息發送、interaction 回覆轉出口，以及使用者可見錯誤訊息泛化。

import { createDiscordMessagePayload } from "./message-payload";
import { sendDiscordRestRequest } from "./rest-request";
import type {
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordDirectMessageChannel,
  DiscordDirectMessageSendResult,
  DiscordInteraction,
  FetchImpl,
} from "./types";

export { formatDiscordBotText } from "./message-text";
export {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "./interaction-responses";
export { formatDiscordRestFailure } from "./rest-failure";
export { sendDiscordRestRequest } from "./rest-request";

// 將內部 Discord delivery 錯誤摘要轉成使用者可理解訊息，避免直接暴露 API 原始錯誤。
export function formatDiscordDeliveryFailureForUser(errorMessage: string | null): string {
  const issue = classifyDiscordDeliveryFailure(errorMessage);

  if (issue === "dm_unavailable") {
    return "我目前無法傳送私訊給你。請確認你允許此伺服器成員私訊，或先傳訊息給 PartsRadarTW bot 後再試一次。";
  }

  if (issue === "missing_access") {
    return "我目前無法存取這個 Discord App 或指令。請伺服器管理員確認 PartsRadarTW bot 仍在伺服器中，且應用程式指令未被停用。";
  }

  if (issue === "missing_permissions") {
    return "我目前缺少 Discord 要求的權限。請伺服器管理員確認 PartsRadarTW bot 的 App / 指令權限設定；公開安裝不需要 Administrator。";
  }

  if (issue === "invalid_token") {
    return "Bot token 可能失效，請聯絡維運者。";
  }

  if (issue === "expired_interaction") {
    return "Discord 指令回應已失效，請重新執行指令；若持續發生請聯絡維運者。";
  }

  if (!errorMessage?.trim()) {
    return "通知失敗，但 Discord 沒有回傳可判讀的原因；系統已保留紀錄供維運檢查。";
  }

  return "Discord 回傳通知失敗；系統已保留紀錄供維運檢查。若持續發生，請重新邀請 bot 或聯絡維運者。";
}

// 將 Discord rate limit 統一轉成使用者可見的稍後重試提示。
export function formatDiscordRateLimitForUser(): string {
  return "Discord 暫時限制訊息發送，系統會稍後重試。";
}

// 建立使用者 DM channel 後逐則發送訊息，回傳給排程與互動流程判斷的 delivery result。
export async function sendDiscordDirectMessages({
  token,
  apiBaseUrl,
  userId,
  messages,
  fetchImpl = fetch,
}: {
  token: string;
  apiBaseUrl: string;
  userId: string;
  messages: DiscordBotMessage[];
  fetchImpl?: FetchImpl;
}): Promise<DiscordDirectMessageSendResult> {
  const channelResult = await sendDiscordRestRequest<DiscordDirectMessageChannel>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "POST",
    path: "/users/@me/channels",
    body: {
      recipient_id: userId,
    },
  });

  if (channelResult.status === "rate_limited") {
    return {
      status: "rate_limited",
      messageCount: messages.length,
      sentMessageCount: 0,
      retryAfterMs: channelResult.retryAfterMs,
      global: channelResult.global,
    };
  }

  if (channelResult.status === "failed") {
    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      message: channelResult.message,
    };
  }

  const channelId = typeof channelResult.body?.id === "string" ? channelResult.body.id : null;

  if (!channelId) {
    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      message: "Discord API returned a DM channel without an id.",
    };
  }

  return sendDiscordChannelMessages({
    token,
    apiBaseUrl,
    channelId,
    messages,
    fetchImpl,
  });
}

// 向指定 Discord channel 逐則發送訊息，遇到限流或失敗時保留已送出數量。
export async function sendDiscordChannelMessages({
  token,
  apiBaseUrl,
  channelId,
  messages,
  fetchImpl = fetch,
}: {
  token: string;
  apiBaseUrl: string;
  channelId: string;
  messages: DiscordBotMessage[];
  fetchImpl?: FetchImpl;
}): Promise<DiscordBotMessageSendResult> {
  const httpStatuses: number[] = [];

  for (const message of messages) {
    const messageResult = await sendDiscordRestRequest<unknown>({
      token,
      apiBaseUrl,
      fetchImpl,
      method: "POST",
      path: `/channels/${channelId}/messages`,
      body: createDiscordMessagePayload(message),
    });

    if (messageResult.status === "ok") {
      httpStatuses.push(messageResult.httpStatus);
      continue;
    }

    if (messageResult.status === "rate_limited") {
      return {
        status: "rate_limited",
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      message: messageResult.message,
    };
  }

  return {
    status: "sent",
    messageCount: messages.length,
    httpStatuses,
  };
}

// 透過 interaction webhook 發送多則回覆；第一則覆寫 deferred original message，後續使用 follow-up。
export async function sendDiscordInteractionMessages({
  token,
  applicationId,
  apiBaseUrl,
  interaction,
  messages,
  fetchImpl = fetch,
  ephemeral = false,
}: {
  token: string;
  applicationId: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  messages: DiscordBotMessage[];
  fetchImpl?: FetchImpl;
  ephemeral?: boolean;
}): Promise<DiscordBotMessageSendResult> {
  const httpStatuses: number[] = [];

  for (const [index, message] of messages.entries()) {
    const path =
      index === 0
        ? `/webhooks/${applicationId}/${interaction.token}/messages/@original`
        : `/webhooks/${applicationId}/${interaction.token}`;
    const method = index === 0 ? "PATCH" : "POST";
    const messageResult = await sendDiscordRestRequest<unknown>({
      token,
      apiBaseUrl,
      fetchImpl,
      method,
      path,
      body: createDiscordMessagePayload(message, ephemeral),
    });

    if (messageResult.status === "ok") {
      httpStatuses.push(messageResult.httpStatus);
      continue;
    }

    if (messageResult.status === "rate_limited") {
      return {
        status: "rate_limited",
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      message: messageResult.message,
    };
  }

  return {
    status: "sent",
    messageCount: messages.length,
    httpStatuses,
  };
}

// 以 Discord error code / message 做最小分類，讓使用者端只看到泛化後的處理建議。
function classifyDiscordDeliveryFailure(
  errorMessage: string | null,
):
  | "dm_unavailable"
  | "missing_access"
  | "missing_permissions"
  | "invalid_token"
  | "expired_interaction"
  | "unknown" {
  const normalized = errorMessage?.toLowerCase() ?? "";

  if (normalized.includes("code=50007") || normalized.includes("cannot send messages")) {
    return "dm_unavailable";
  }

  if (normalized.includes("code=50001") || normalized.includes("missing access")) {
    return "missing_access";
  }

  if (normalized.includes("code=50013") || normalized.includes("missing permissions")) {
    return "missing_permissions";
  }

  if (normalized.includes("http 401") || normalized.includes("unauthorized")) {
    return "invalid_token";
  }

  if (normalized.includes("unknown interaction") || normalized.includes("code=10062")) {
    return "expired_interaction";
  }

  return "unknown";
}
