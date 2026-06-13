// apps/crawler/src/scripts/ops/discord-bot/registration.ts

import { createPriceReportCommand } from "./commands";
import { sendDiscordRestRequest } from "./rest";
import type { DiscordBotOptions, DiscordRestResult, FetchImpl } from "./types";

export type DiscordCommandRegistrationResult =
  | {
      status: "ok";
      httpStatus: number;
      body: unknown | null;
      clearedGuildCommands: boolean;
    }
  | Exclude<DiscordRestResult<unknown>, { status: "ok" }>;

export async function registerDiscordBotCommands({
  token,
  applicationId,
  guildId,
  apiBaseUrl,
  fetchImpl = fetch,
}: Pick<DiscordBotOptions, "token" | "applicationId" | "guildId" | "apiBaseUrl"> & {
  fetchImpl?: FetchImpl;
}): Promise<DiscordCommandRegistrationResult> {
  const globalResult = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/commands`,
    body: [createPriceReportCommand()],
  });

  if (globalResult.status !== "ok") {
    return globalResult;
  }

  if (!guildId) {
    return {
      ...globalResult,
      clearedGuildCommands: false,
    };
  }

  const guildCleanupResult = await sendDiscordRestRequest<unknown>({
    token,
    apiBaseUrl,
    fetchImpl,
    method: "PUT",
    path: `/applications/${applicationId}/guilds/${guildId}/commands`,
    body: [],
  });

  if (guildCleanupResult.status !== "ok") {
    return guildCleanupResult;
  }

  return {
    ...globalResult,
    clearedGuildCommands: true,
  };
}
