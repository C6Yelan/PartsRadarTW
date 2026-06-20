// apps/crawler/src/scripts/ops/discord-bot/rest.ts

import { toSafeCliErrorMessage } from "../../shared/script-utils";
import {
  DISCORD_EMBED_DESCRIPTION_MAX_LENGTH,
  DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH,
  DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH,
  DISCORD_EMBED_MAX_FIELDS,
  DISCORD_EMBED_TITLE_MAX_LENGTH,
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_INTERACTION_CALLBACK_CHANNEL_MESSAGE,
  DISCORD_INTERACTION_CALLBACK_DEFERRED_CHANNEL_MESSAGE,
  DISCORD_INTERACTION_CALLBACK_DEFERRED_UPDATE_MESSAGE,
  DISCORD_INTERACTION_CALLBACK_MODAL,
  DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
} from "./constants";
import type {
  DiscordBotEmbed,
  DiscordBotMessage,
  DiscordBotMessageSendResult,
  DiscordDirectMessageChannel,
  DiscordDirectMessageSendResult,
  DiscordInteraction,
  DiscordModal,
  DiscordRestOptions,
  DiscordRestResult,
  FetchImpl,
} from "./types";

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

export async function sendDiscordInteractionMessages({
  token,
  applicationId,
  apiBaseUrl,
  interaction,
  messages,
  fetchImpl = fetch,
}: {
  token: string;
  applicationId: string;
  apiBaseUrl: string;
  interaction: DiscordInteraction;
  messages: DiscordBotMessage[];
  fetchImpl?: FetchImpl;
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

function createDiscordMessagePayload(
  message: DiscordBotMessage | string,
  ephemeral = false,
): Record<string, unknown> {
  const normalizedMessage = normalizeDiscordBotMessage(message);

  return {
    content: normalizedMessage.content,
    embeds: normalizedMessage.embeds,
    components: normalizedMessage.components,
    flags: ephemeral ? DISCORD_EPHEMERAL_MESSAGE_FLAG : undefined,
    allowed_mentions: {
      parse: [],
    },
  };
}

function normalizeDiscordBotMessage(message: DiscordBotMessage | string): DiscordBotMessage {
  if (typeof message === "string") {
    return {
      content: formatDiscordBotText(message, DISCORD_MESSAGE_CONTENT_MAX_LENGTH),
    };
  }

  const content =
    typeof message.content === "string"
      ? formatDiscordBotText(message.content, DISCORD_MESSAGE_CONTENT_MAX_LENGTH)
      : undefined;
  const embeds = message.embeds?.map(normalizeDiscordBotEmbed).filter((embed) => {
    return Boolean(embed.title || embed.description || (embed.fields && embed.fields.length > 0));
  });

  if (
    !content &&
    (!embeds || embeds.length === 0) &&
    (!message.components || message.components.length === 0)
  ) {
    return {
      content: "價格報告目前沒有可顯示內容。",
    };
  }

  return {
    content,
    embeds: embeds && embeds.length > 0 ? embeds : undefined,
    components: message.components,
  };
}

function normalizeDiscordBotEmbed(embed: DiscordBotEmbed): DiscordBotEmbed {
  return {
    title:
      typeof embed.title === "string"
        ? formatDiscordBotText(embed.title, DISCORD_EMBED_TITLE_MAX_LENGTH)
        : undefined,
    description:
      typeof embed.description === "string"
        ? formatDiscordBotText(embed.description, DISCORD_EMBED_DESCRIPTION_MAX_LENGTH)
        : undefined,
    color: typeof embed.color === "number" ? embed.color : undefined,
    fields: embed.fields?.slice(0, DISCORD_EMBED_MAX_FIELDS).map((field) => ({
      name: formatDiscordBotText(field.name, DISCORD_EMBED_TITLE_MAX_LENGTH),
      value: formatDiscordBotText(field.value, DISCORD_EMBED_FIELD_VALUE_MAX_LENGTH),
      inline: field.inline,
    })),
    footer: embed.footer
      ? {
          text: formatDiscordBotText(embed.footer.text, DISCORD_EMBED_FOOTER_TEXT_MAX_LENGTH),
        }
      : undefined,
    timestamp: embed.timestamp,
  };
}

export async function sendDiscordRestRequest<T>({
  token,
  apiBaseUrl,
  fetchImpl = fetch,
  method,
  path,
  body,
}: DiscordRestOptions & {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
}): Promise<DiscordRestResult<T>> {
  try {
    const response = await fetchImpl(createDiscordApiUrl(apiBaseUrl, path), {
      method,
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
        "user-agent": "PartsRadarTW Discord bot (+https://github.com/C6Yelan/PartsRadarTW)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 429) {
      const rateLimitBody = await readDiscordJson<{
        retry_after?: unknown;
        global?: unknown;
      }>(response);
      const retryAfterMs =
        parseRetryAfterHeader(response.headers) ?? resolveRetryAfterMsFromBody(rateLimitBody);

      return {
        status: "rate_limited",
        httpStatus: 429,
        retryAfterMs,
        global: rateLimitBody?.global === true,
      };
    }

    if (!response.ok) {
      const errorBody = await readDiscordJson<unknown>(response);

      return {
        status: "failed",
        httpStatus: response.status,
        message: formatDiscordApiError(response.status, errorBody),
        retryAfterMs: parseRetryAfterHeader(response.headers),
      };
    }

    return {
      status: "ok",
      httpStatus: response.status,
      body: await readDiscordJson<T>(response),
    };
  } catch (error) {
    return {
      status: "failed",
      httpStatus: null,
      message: toSafeCliErrorMessage(error),
    };
  }
}

async function readDiscordJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function resolveRetryAfterMsFromBody(body: { retry_after?: unknown } | null): number {
  const retryAfter = typeof body?.retry_after === "number" ? body.retry_after : null;

  return retryAfter !== null && Number.isFinite(retryAfter) ? Math.ceil(retryAfter * 1000) : 0;
}

function parseRetryAfterHeader(headers: Headers): number | undefined {
  const retryAfter = headers.get("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const retryAfterSeconds = Number(retryAfter);

  return Number.isFinite(retryAfterSeconds) ? Math.ceil(retryAfterSeconds * 1000) : undefined;
}

function createDiscordApiUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
}

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

function formatDiscordApiError(httpStatus: number, body: unknown): string {
  const details = isRecord(body) ? body : null;
  const code =
    typeof details?.code === "string" || typeof details?.code === "number"
      ? ` code=${details.code}`
      : "";
  const message =
    typeof details?.message === "string" && details.message.trim()
      ? ` message=${details.message.trim()}`
      : "";
  const errors =
    details?.errors === undefined ? "" : ` errors=${serializeDiscordErrors(details.errors)}`;

  return `Discord API returned HTTP ${httpStatus}.${code}${message}${errors}`;
}

function serializeDiscordErrors(errors: unknown): string {
  try {
    return JSON.stringify(errors).slice(0, 2_000);
  } catch {
    return "unserializable";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatDiscordRestFailure(
  result: Exclude<DiscordRestResult<unknown>, { status: "ok" }>,
): string {
  if (result.status === "rate_limited") {
    return `rate_limited retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`;
  }

  return `failed httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(
    result.message,
  )}`;
}

export function formatDiscordBotText(value: string, maxLength: number): string {
  const text = replaceControlCharacters(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isAllowedWhitespace = code === 9 || code === 10 || code === 13;
    const isControlCharacter = (code >= 0 && code <= 31) || code === 127;

    return isControlCharacter && !isAllowedWhitespace ? " " : character;
  }).join("");
}
