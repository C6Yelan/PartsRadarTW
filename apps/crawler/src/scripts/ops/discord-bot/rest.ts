// apps/crawler/src/scripts/ops/discord-bot/rest.ts
// 提供 Discord REST facade：訊息發送、interaction 回覆轉出口，以及使用者可見錯誤訊息泛化。

import { createDiscordMessagePayload } from "./message-payload";
import { sendDiscordRestRequest } from "./rest-request";
import type {
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordDeliveryErrorCategory,
  DiscordDirectMessageChannel,
  DiscordDirectMessageSendResult,
  DiscordInteraction,
  FetchImpl,
} from "./types";

export {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "./interaction-responses";
export { formatDiscordBotText } from "./message-text";
export { formatDiscordRestFailure } from "./rest-failure";
export { sendDiscordRestRequest } from "./rest-request";

// 將 transport boundary 的分類轉成行動導向訊息；不讀取 legacy error_message。
export function formatDiscordDeliveryFailureForUser(failure: {
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
}): string {
  if (failure.errorCategory === "DM_UNAVAILABLE") {
    return "我目前無法傳送私訊給你。請確認你允許此伺服器成員私訊，或先傳訊息給 PartsRadarTW bot 後再試一次。";
  }

  if (failure.errorCategory === "PERMISSIONS") {
    return "我目前缺少完成這次 Discord 發送所需的權限。請伺服器管理員檢查 PartsRadarTW bot 與目標頻道權限後再試一次。";
  }

  if (failure.errorCategory === "RATE_LIMITED") {
    return formatDiscordRateLimitForUser();
  }

  if (failure.errorCategory === "INTERACTION_EXPIRED") {
    return "這次 Discord 指令回應已失效，請重新執行指令。";
  }

  if (failure.errorCategory === "TRANSPORT") {
    return "目前無法連上 Discord，請稍後重試。";
  }

  return "Discord 暫時無法完成通知，請稍後重試；若持續發生，請伺服器管理員檢查 PartsRadarTW bot 設定。";
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
      httpStatus: channelResult.httpStatus,
      errorCategory: channelResult.errorCategory,
      providerErrorCode: channelResult.providerErrorCode,
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
      errorCategory: channelResult.errorCategory,
      providerErrorCode: channelResult.providerErrorCode,
    };
  }

  const channelId = typeof channelResult.body?.id === "string" ? channelResult.body.id : null;

  if (!channelId) {
    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: 0,
      httpStatus: channelResult.httpStatus,
      errorCategory: "PROVIDER",
      providerErrorCode: null,
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
        httpStatus: messageResult.httpStatus,
        errorCategory: messageResult.errorCategory,
        providerErrorCode: messageResult.providerErrorCode,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      errorCategory: messageResult.errorCategory,
      providerErrorCode: messageResult.providerErrorCode,
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
        httpStatus: messageResult.httpStatus,
        errorCategory: messageResult.errorCategory,
        providerErrorCode: messageResult.providerErrorCode,
        retryAfterMs: messageResult.retryAfterMs,
        global: messageResult.global,
      };
    }

    return {
      status: "failed",
      messageCount: messages.length,
      sentMessageCount: httpStatuses.length,
      httpStatus: messageResult.httpStatus,
      errorCategory: messageResult.errorCategory,
      providerErrorCode: messageResult.providerErrorCode,
    };
  }

  return {
    status: "sent",
    messageCount: messages.length,
    httpStatuses,
  };
}
