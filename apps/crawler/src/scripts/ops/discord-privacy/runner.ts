// apps/crawler/src/scripts/ops/discord-privacy/runner.ts
// 執行 Discord privacy domain 並只輸出遮罩 subject 與各資料類別筆數。

import type { PrismaClient } from "@partsradar/db";
import {
  eraseDiscordGuildData,
  eraseDiscordUserData,
  inspectDiscordGuildData,
  inspectDiscordUserData,
} from "@partsradar/db/discord-privacy";
import type { DiscordPrivacyCommand } from "./options";

type PrivacyClient = Pick<
  PrismaClient,
  | "$transaction"
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportDelivery"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

export async function runDiscordPrivacyCommand({
  client,
  command,
}: {
  client: PrivacyClient;
  command: DiscordPrivacyCommand;
}): Promise<Record<string, unknown>> {
  const subject = maskDiscordId(command.subjectId);

  if (command.action === "inspect-user") {
    return {
      action: command.action,
      subject,
      dryRun: true,
      counts: await inspectDiscordUserData(client, command.subjectId),
    };
  }

  if (command.action === "inspect-guild") {
    return {
      action: command.action,
      subject,
      dryRun: true,
      counts: await inspectDiscordGuildData(client, command.subjectId),
    };
  }

  if (!command.execute) {
    return {
      action: command.action,
      subject,
      dryRun: true,
      counts:
        command.subjectType === "user"
          ? await inspectDiscordUserData(client, command.subjectId)
          : await inspectDiscordGuildData(client, command.subjectId),
    };
  }

  return {
    action: command.action,
    subject,
    dryRun: false,
    counts:
      command.subjectType === "user"
        ? await eraseDiscordUserData(client, command.subjectId)
        : await eraseDiscordGuildData(client, command.subjectId),
  };
}

export function maskDiscordId(value: string): string {
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}
