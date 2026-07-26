// apps/crawler/src/scripts/ops/discord-bot/public-price-report/scheduler.ts
// 掃描已完成的 scheduled crawl run，對啟用的公開報告頻道發送尚未送出的價格報告。

import { CRAWL_RUN_STATUSES } from "../../../../coolpc/crawl-run";
import {
  MAX_DUE_PUBLIC_PRICE_REPORT_SETTINGS_PER_CYCLE,
  MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE,
} from "../constants";
import type {
  DiscordBotClient,
  DiscordBotMessage,
  DiscordBotOptions,
  DiscordMessageSendResult,
} from "../types";
import type {
  DiscordPublicReportAccessProbeResult,
  PublicReportDisabledAccessStatus,
} from "./access-policy";
import { sendPublicPriceReportForCrawlRun } from "./delivery-flow";
import { PUBLIC_PRICE_REPORT_SETTING_SELECT, type PublicPriceReportSetting } from "./settings";

// 單輪公開價格報告排程處理摘要，供 Discord bot daemon log 與維運觀察使用。
export interface PublicPriceReportSummary {
  settingCount: number;
  processedCount: number;
  sentCount: number;
  skippedCount: number;
  rateLimitedCount: number;
  failedCount: number;
  retryNotBefore: Date | null;
  globalRateLimited: boolean;
  globalAuthFailed: boolean;
}

// 對所有啟用的公開報告設定處理待發 crawl run，並彙總本輪發送結果。
export async function sendPendingPublicPriceReports({
  client,
  options,
  now = new Date(),
  sendChannelMessages,
  probeAccess,
  unavailableGuildIds = new Set(),
  onAccessDisabled,
}: {
  client: DiscordBotClient;
  options: Pick<DiscordBotOptions, "publicBaseUrl">;
  now?: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordMessageSendResult>;
  probeAccess: (setting: PublicPriceReportSetting) => Promise<DiscordPublicReportAccessProbeResult>;
  unavailableGuildIds?: ReadonlySet<string>;
  onAccessDisabled: (event: {
    setting: PublicPriceReportSetting;
    accessStatus: PublicReportDisabledAccessStatus;
    providerErrorCode: number | null;
  }) => void | Promise<void>;
}): Promise<PublicPriceReportSummary> {
  const summary: PublicPriceReportSummary = {
    settingCount: 0,
    processedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
    retryNotBefore: null,
    globalRateLimited: false,
    globalAuthFailed: false,
  };

  const settings = await client.discordPublicPriceReportSetting.findMany({
    where: {
      enabled: true,
      accessStatus: "ACTIVE",
      OR: [{ retryNotBefore: null }, { retryNotBefore: { lte: now } }],
      ...(unavailableGuildIds.size > 0
        ? {
            discordGuildId: {
              notIn: [...unavailableGuildIds],
            },
          }
        : {}),
    },
    select: PUBLIC_PRICE_REPORT_SETTING_SELECT,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PUBLIC_PRICE_REPORT_SETTINGS_PER_CYCLE,
  });

  summary.settingCount = settings.length;

  for (const setting of settings) {
    const settingSummary = await sendPendingPublicPriceReportsForSetting({
      client,
      setting,
      options,
      now,
      sendChannelMessages,
      probeAccess,
      onAccessDisabled,
    });

    summary.processedCount += settingSummary.processedCount;
    summary.sentCount += settingSummary.sentCount;
    summary.skippedCount += settingSummary.skippedCount;
    summary.rateLimitedCount += settingSummary.rateLimitedCount;
    summary.failedCount += settingSummary.failedCount;
    summary.retryNotBefore = earliestDate(summary.retryNotBefore, settingSummary.retryNotBefore);
    summary.globalRateLimited ||= settingSummary.globalRateLimited;
    summary.globalAuthFailed ||= settingSummary.globalAuthFailed;

    if (summary.globalRateLimited || summary.globalAuthFailed) {
      break;
    }
  }

  return summary;
}

// 處理單一公開報告設定尚未送出的 scheduled crawl run，支援失敗與限流項目重試。
async function sendPendingPublicPriceReportsForSetting({
  client,
  setting,
  options,
  now,
  sendChannelMessages,
  probeAccess,
  onAccessDisabled,
}: {
  client: DiscordBotClient;
  setting: PublicPriceReportSetting;
  options: Pick<DiscordBotOptions, "publicBaseUrl">;
  now: Date;
  sendChannelMessages: (
    channelId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordMessageSendResult>;
  probeAccess: (setting: PublicPriceReportSetting) => Promise<DiscordPublicReportAccessProbeResult>;
  onAccessDisabled: (event: {
    setting: PublicPriceReportSetting;
    accessStatus: PublicReportDisabledAccessStatus;
    providerErrorCode: number | null;
  }) => void | Promise<void>;
}): Promise<Omit<PublicPriceReportSummary, "settingCount">> {
  const summary: Omit<PublicPriceReportSummary, "settingCount"> = {
    processedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
    retryNotBefore: null,
    globalRateLimited: false,
    globalAuthFailed: false,
  };
  const cursorAt = setting.notificationCursorAt ?? setting.createdAt;
  const crawlRuns = await client.crawlRun.findMany({
    where: {
      triggerType: "SCHEDULED",
      status: {
        in: [CRAWL_RUN_STATUSES.SUCCESS_CHANGED, CRAWL_RUN_STATUSES.SUCCESS_WITH_ERRORS],
      },
      finishedAt: {
        not: null,
        gt: cursorAt,
      },
      OR: [
        {
          publicPriceReportDeliveries: {
            none: {
              channelId: setting.channelId,
            },
          },
        },
        {
          publicPriceReportDeliveries: {
            some: {
              channelId: setting.channelId,
              status: {
                in: ["FAILED", "RATE_LIMITED"],
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
    },
    orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
    take: MAX_DUE_PUBLIC_PRICE_REPORTS_PER_CYCLE,
  });

  for (const crawlRun of crawlRuns) {
    summary.processedCount += 1;

    const result = await sendPublicPriceReportForCrawlRun({
      client,
      setting,
      crawlRunId: crawlRun.id,
      publicBaseUrl: options.publicBaseUrl,
      now,
      sendChannelMessages,
      probeAccess,
      onAccessDisabled,
    });

    if (result.status === "CANCELLED") {
      continue;
    }

    if (result.status === "SENT") {
      summary.sentCount += 1;
    } else if (result.status === "SKIPPED") {
      summary.skippedCount += 1;
    } else if (result.status === "RATE_LIMITED") {
      summary.rateLimitedCount += 1;
    } else {
      summary.failedCount += 1;
    }

    summary.retryNotBefore = earliestDate(summary.retryNotBefore, result.retryNotBefore);
    summary.globalRateLimited ||= result.globalRateLimited;
    summary.globalAuthFailed ||= result.globalAuthFailed;

    if (result.status === "FAILED" || result.status === "RATE_LIMITED" || result.globalAuthFailed) {
      break;
    }
  }

  return summary;
}

function earliestDate(current: Date | null, candidate: Date | null): Date | null {
  if (!candidate) {
    return current;
  }

  return !current || candidate < current ? candidate : current;
}
