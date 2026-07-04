// apps/crawler/src/scripts/ops/discord-bot/interactions/responses.ts
import { sendInteractionResponse } from "../rest";
import type { DiscordBotOptions, DiscordInteraction, FetchImpl } from "../types";

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
