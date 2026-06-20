// apps/crawler/src/scripts/ops/discord-bot/registration.ts

import { createPriceReportCommand, createWatchCommand } from "./commands";
import { sendDiscordRestRequest } from "./rest";
import type { DiscordBotOptions, DiscordRestResult, FetchImpl } from "./types";

export async function registerDiscordBotCommands({
  token,
  applicationId,
  apiBaseUrl,
  fetchImpl = fetch,
}: Pick<DiscordBotOptions, "token" | "applicationId" | "apiBaseUrl"> & {
  fetchImpl?: FetchImpl;
}): Promise<DiscordRestResult<unknown>> {
  return sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/commands`,
    body: [createPriceReportCommand(), createWatchCommand()],
  });
}
