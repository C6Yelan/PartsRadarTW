// apps/crawler/src/scripts/ops/discord-bot/rest.ts
// 提供 Discord REST facade：訊息發送、interaction 回覆轉出口，以及使用者可見錯誤訊息泛化。

import { createDiscordMessagePayload } from "./message-payload";
import { formatDiscordBotText } from "./message-text";
import { sendDiscordRestRequest } from "./rest-request";
import type {
  DiscordBotMessage,
  DiscordDeliveryErrorCategory,
  DiscordDirectMessageChannel,
  DiscordInteraction,
  DiscordMessageSendResult,
  FetchImpl,
} from "./types";

export {
  deferInteractionMessageUpdate,
  deferInteractionResponse,
  editDeferredInteractionResponse,
  sendInteractionResponse,
  sendModalInteractionResponse,
} from "./interaction-responses";
export { formatDiscordRestFailure } from "./rest-failure";
export { sendDiscordRestRequest } from "./rest-request";

export function formatDiscordDirectMessageFailureForUser(failure: {
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
}): string {
  if (failure.errorCategory === "DM_UNAVAILABLE" || failure.errorCategory === "PERMISSIONS") {
    return "我目前無法傳送私訊給你。請在伺服器的隱私設定中允許伺服器成員傳送私訊，或先傳一則私訊給 PartsRadarTW bot 後再試一次。";
  }

  if (failure.errorCategory === "RATE_LIMITED") {
    return formatDiscordDirectMessageRateLimitForUser();
  }

  return "目前無法傳送私訊給你，請稍後再試；若持續發生，請確認已允許 PartsRadarTW bot 傳送私訊。";
}

export function formatDiscordDirectMessageFailureFieldValue(failure: {
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
}): string {
  return formatDiscordBotText(formatDiscordDirectMessageFailureForUser(failure), 220);
}

export function formatDiscordDirectMessageRateLimitForUser(): string {
  return "Discord 暫時無法傳送私訊，系統會稍後再試。";
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
}): Promise<DiscordMessageSendResult> {
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
      errorCategory: normalizeDiscordDirectMessageFailureCategory(channelResult),
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

  const messageResult = await sendDiscordChannelMessages({
    token,
    apiBaseUrl,
    channelId,
    messages,
    fetchImpl,
  });

  if (messageResult.status !== "failed") {
    return messageResult;
  }

  return {
    ...messageResult,
    errorCategory: normalizeDiscordDirectMessageFailureCategory(messageResult),
  };
}

function normalizeDiscordDirectMessageFailureCategory(failure: {
  errorCategory: DiscordDeliveryErrorCategory;
  httpStatus: number | null;
  providerErrorCode: number | null;
}): DiscordDeliveryErrorCategory {
  if (
    failure.errorCategory === "DM_UNAVAILABLE" ||
    failure.errorCategory === "PERMISSIONS" ||
    failure.httpStatus === 403 ||
    failure.providerErrorCode === 50001 ||
    failure.providerErrorCode === 50007 ||
    failure.providerErrorCode === 50013
  ) {
    return "DM_UNAVAILABLE";
  }

  return failure.errorCategory;
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
}): Promise<DiscordMessageSendResult> {
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
}): Promise<DiscordMessageSendResult> {
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
