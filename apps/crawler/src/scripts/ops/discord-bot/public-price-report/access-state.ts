// 更新公開報告設定的 Discord access 狀態，集中處理成功、暫時退避與永久停用。

import { resolveDiscordPublicReportPurgeAfter } from "@partsradar/db/discord-privacy";
import type { DiscordBotClient } from "../types";
import type { PublicReportDisabledAccessStatus } from "./access-policy";

export async function markPublicReportAccessSucceeded({
  client,
  settingId,
  now,
}: {
  client: DiscordBotClient;
  settingId: string;
  now: Date;
}): Promise<void> {
  await client.discordPublicPriceReportSetting.updateMany({
    where: {
      id: settingId,
      accessStatus: "ACTIVE",
    },
    data: {
      lastDiscordErrorCode: null,
      lastAccessCheckedAt: now,
      consecutiveAccessFailures: 0,
      retryNotBefore: null,
    },
  });
}

export async function deferPublicReportAccessRetry({
  client,
  settingId,
  providerErrorCode,
  retryNotBefore,
  now,
}: {
  client: DiscordBotClient;
  settingId: string;
  providerErrorCode: number | null;
  retryNotBefore: Date;
  now: Date;
}): Promise<void> {
  await client.discordPublicPriceReportSetting.updateMany({
    where: {
      id: settingId,
      accessStatus: "ACTIVE",
    },
    data: {
      lastDiscordErrorCode: providerErrorCode,
      lastAccessCheckedAt: now,
      consecutiveAccessFailures: {
        increment: 1,
      },
      retryNotBefore,
    },
  });
}

export async function disablePublicReportAccess({
  client,
  where,
  accessStatus,
  providerErrorCode,
  now,
  includePaused = false,
}: {
  client: DiscordBotClient;
  where: { settingId: string } | { discordGuildId: string } | { channelId: string };
  accessStatus: PublicReportDisabledAccessStatus;
  providerErrorCode: number | null;
  now: Date;
  includePaused?: boolean;
}): Promise<number> {
  const result = await client.discordPublicPriceReportSetting.updateMany({
    where: {
      ...toSettingWhere(where),
      ...(includePaused ? {} : { enabled: true }),
      accessStatus: "ACTIVE",
    },
    data: {
      enabled: false,
      accessStatus,
      disabledAt: now,
      purgeAfter: resolveDiscordPublicReportPurgeAfter({
        accessStatus,
        disabledAt: now,
      }),
      lastDiscordErrorCode: providerErrorCode,
      lastAccessCheckedAt: now,
      consecutiveAccessFailures: {
        increment: 1,
      },
      retryNotBefore: null,
    },
  });

  return result.count;
}

function toSettingWhere(
  where: { settingId: string } | { discordGuildId: string } | { channelId: string },
): { id?: string; discordGuildId?: string; channelId?: string } {
  if ("settingId" in where) {
    return { id: where.settingId };
  }

  return where;
}
