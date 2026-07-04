// apps/crawler/src/scripts/ops/discord-bot/interaction-responses.ts

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
