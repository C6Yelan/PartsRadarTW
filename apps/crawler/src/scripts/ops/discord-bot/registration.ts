// apps/crawler/src/scripts/ops/discord-bot/registration.ts

import { createPriceReportCommand } from "./commands";
import { sendDiscordRestRequest } from "./rest";
import type { DiscordBotOptions, DiscordRestResult, FetchImpl } from "./types";

export async function registerDiscordBotCommands({
  token,
  applicationId,
  guildId,
  apiBaseUrl,
  fetchImpl = fetch,
}: Pick<DiscordBotOptions, "token" | "applicationId" | "guildId" | "apiBaseUrl"> & {
  fetchImpl?: FetchImpl;
}): Promise<DiscordRestResult<unknown>> {
  const globalResult = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/commands`,
    body: [createPriceReportCommand({ includeDmContexts: true })],
  });

  if (globalResult.status !== "ok" || !guildId) {
    return globalResult;
  }

  const guildResult = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/guilds/${guildId}/commands`,
    body: [createPriceReportCommand({ includeDmContexts: false })],
  });

  return guildResult;
}
