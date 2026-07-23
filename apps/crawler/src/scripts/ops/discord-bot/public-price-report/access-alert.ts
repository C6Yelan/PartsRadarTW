// 傳送公開報告自動停用的一次性管理員通知，只輸出 Discord id 安全尾碼。

import { sendDiscordWebhookMessage } from "../../discord-webhook";
import type { FetchImpl } from "../types";
import type { PublicReportDisabledAccessStatus } from "./access-policy";
import type { PublicPriceReportSetting } from "./settings";

export async function notifyPublicReportAccessDisabled({
  webhookUrl,
  setting,
  accessStatus,
  providerErrorCode,
  fetchImpl,
  logMessage,
}: {
  webhookUrl: string | null;
  setting: Pick<PublicPriceReportSetting, "discordGuildId" | "channelId">;
  accessStatus: PublicReportDisabledAccessStatus;
  providerErrorCode: number | null;
  fetchImpl: FetchImpl;
  logMessage: (message: string) => void;
}): Promise<void> {
  const result = await sendDiscordWebhookMessage({
    webhookUrl,
    fetchImpl,
    message: {
      username: "PartsRadarTW Ops",
      content:
        "Public report automatically disabled\n" +
        `guild=${safeDiscordIdSuffix(setting.discordGuildId)}\n` +
        `channel=${safeDiscordIdSuffix(setting.channelId)}\n` +
        `reason=${toAlertReason(accessStatus)}\n` +
        `providerCode=${providerErrorCode ?? "none"}`,
    },
  });

  if (result.status === "failed") {
    logMessage(`Public report disabled alert failed. httpStatus=${result.httpStatus ?? "none"}`);
  } else if (result.status === "rate_limited") {
    logMessage(`Public report disabled alert rate limited. retryAfterMs=${result.retryAfterMs}`);
  }
}

function safeDiscordIdSuffix(id: string): string {
  return `...${id.slice(-6)}`;
}

function toAlertReason(accessStatus: PublicReportDisabledAccessStatus): string {
  if (accessStatus === "DISABLED_BOT_REMOVED") {
    return "BOT_REMOVED";
  }

  if (accessStatus === "DISABLED_CHANNEL_GONE") {
    return "CHANNEL_GONE";
  }

  return "PERMISSION";
}
