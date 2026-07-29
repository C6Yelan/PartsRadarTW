// apps/crawler/src/scripts/ops/discord-bot/public-price-report/delivery-flow.ts
// 產生單一 crawl run 的公開價格報告、送出 Discord 訊息，並持久化 delivery 結果。

import {
  PriceReportWorkBudgetExceededError,
  readCrawlRunPriceChangeSummary,
} from "@partsradar/db/price-report";
import { MAX_PRICE_REPORT_ITEMS } from "../constants";
import { NO_DISCORD_DELIVERY_ERROR, toDiscordDeliveryErrorFields } from "../delivery-error-fields";
import {
  filterNewProductsForReport,
  filterPriceChangesForReport,
  toPriceReportFilters,
} from "../price-report/filters";
import { createPublicPriceReportMessages } from "../price-report/messages";
import type { DiscordBotClient, DiscordBotMessage, DiscordMessageSendResult } from "../types";
import {
  classifyPublicReportAccessFailure,
  type DiscordPublicReportAccessProbeResult,
  type PublicReportDisabledAccessStatus,
} from "./access-policy";
import {
  deferPublicReportAccessRetry,
  disablePublicReportAccess,
  markPublicReportAccessSucceeded,
} from "./access-state";
import { type PublicPriceReportStatus, recordPublicPriceReportDelivery } from "./delivery";
import type { PublicPriceReportSetting } from "./settings";

export async function sendPublicPriceReportForCrawlRun({
  client,
  setting,
  crawlRunId,
  publicBaseUrl,
  now,
  sendChannelMessages,
  probeAccess,
  onAccessDisabled,
}: {
  client: DiscordBotClient;
  setting: PublicPriceReportSetting;
  crawlRunId: string;
  publicBaseUrl: string;
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
}): Promise<{
  status: PublicPriceReportStatus | "CANCELLED";
  retryNotBefore: Date | null;
  globalRateLimited: boolean;
  globalAuthFailed: boolean;
}> {
  let readResult: Awaited<ReturnType<typeof readCrawlRunPriceChangeSummary>>;

  try {
    readResult = await readCrawlRunPriceChangeSummary(client, crawlRunId);
  } catch (error) {
    if (!(error instanceof PriceReportWorkBudgetExceededError)) {
      throw error;
    }

    process.stderr.write(
      `${JSON.stringify({
        level: "warn",
        event: "price_report_work_budget_exceeded",
        scope: error.scope,
        limit: error.limit,
        observedRows: error.observedRows,
      })}\n`,
    );

    if (!(await readActivePublicReportSetting(client, setting))) {
      return {
        status: "CANCELLED",
        retryNotBefore: null,
        globalRateLimited: false,
        globalAuthFailed: false,
      };
    }

    const recorded = await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId: setting.channelId,
      publicPriceReportSettingId: setting.id,
      status: "FAILED",
      itemCount: 0,
      messageCount: 0,
      deliveredAt: null,
      ...NO_DISCORD_DELIVERY_ERROR,
    });

    return {
      status: recorded ? "FAILED" : "CANCELLED",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  const filters = toPriceReportFilters(setting);
  const changes = filterPriceChangesForReport(readResult.changes, filters);
  const newProducts = filterNewProductsForReport(readResult.newProducts, filters);
  const channelId = setting.channelId;
  const settingStillActive = await readActivePublicReportSetting(client, setting);

  if (!settingStillActive) {
    return {
      status: "CANCELLED",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  if (changes.length === 0 && newProducts.length === 0) {
    const recorded = await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      publicPriceReportSettingId: setting.id,
      status: "SKIPPED",
      itemCount: 0,
      messageCount: 0,
      deliveredAt: null,
      ...NO_DISCORD_DELIVERY_ERROR,
    });

    return {
      status: recorded ? "SKIPPED" : "CANCELLED",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  const messages = createPublicPriceReportMessages(
    { priceChanges: changes, newProducts },
    {
      publicBaseUrl,
      generatedAt: now,
    },
  );
  const result = await sendChannelMessages(channelId, messages);
  const itemCount = Math.min(changes.length + newProducts.length, MAX_PRICE_REPORT_ITEMS);

  if (!(await readActivePublicReportSetting(client, setting))) {
    return {
      status: "CANCELLED",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  if (result.status === "sent") {
    const recorded = await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      publicPriceReportSettingId: setting.id,
      status: "SENT",
      itemCount,
      messageCount: messages.length,
      deliveredAt: now,
      ...toDiscordDeliveryErrorFields(result),
    });
    if (!recorded) {
      return {
        status: "CANCELLED",
        retryNotBefore: null,
        globalRateLimited: false,
        globalAuthFailed: false,
      };
    }
    await markPublicReportAccessSucceeded({ client, settingId: setting.id, now });

    return {
      status: "SENT",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  if (result.status === "rate_limited") {
    const recorded = await recordPublicPriceReportDelivery({
      client,
      crawlRunId,
      channelId,
      publicPriceReportSettingId: setting.id,
      status: "RATE_LIMITED",
      itemCount,
      messageCount: messages.length,
      deliveredAt: null,
      ...toDiscordDeliveryErrorFields(result),
    });
    if (!recorded) {
      return {
        status: "CANCELLED",
        retryNotBefore: null,
        globalRateLimited: false,
        globalAuthFailed: false,
      };
    }

    const decision = await classifyPublicReportAccessFailure({
      result,
      settingFailureCount: setting.consecutiveAccessFailures,
      now,
      probeAccess: () => probeAccess(setting),
    });
    await deferPublicReportAccessRetry({
      client,
      settingId: setting.id,
      providerErrorCode: decision.providerErrorCode,
      retryNotBefore: decision.kind === "retry" ? decision.retryNotBefore : now,
      now,
    });

    return {
      status: "RATE_LIMITED",
      retryNotBefore: decision.kind === "retry" ? decision.retryNotBefore : now,
      globalRateLimited: result.global,
      globalAuthFailed: false,
    };
  }

  const recorded = await recordPublicPriceReportDelivery({
    client,
    crawlRunId,
    channelId,
    publicPriceReportSettingId: setting.id,
    status: "FAILED",
    itemCount,
    messageCount: messages.length,
    deliveredAt: null,
    ...toDiscordDeliveryErrorFields(result),
  });
  if (!recorded) {
    return {
      status: "CANCELLED",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  const decision = await classifyPublicReportAccessFailure({
    result,
    settingFailureCount: setting.consecutiveAccessFailures,
    now,
    probeAccess: () => probeAccess(setting),
  });

  if (decision.kind === "abort") {
    return {
      status: "FAILED",
      retryNotBefore: null,
      globalRateLimited: false,
      globalAuthFailed: true,
    };
  }

  if (decision.kind === "retry") {
    await deferPublicReportAccessRetry({
      client,
      settingId: setting.id,
      providerErrorCode: decision.providerErrorCode,
      retryNotBefore: decision.retryNotBefore,
      now,
    });

    return {
      status: "FAILED",
      retryNotBefore: decision.retryNotBefore,
      globalRateLimited: false,
      globalAuthFailed: false,
    };
  }

  const transitionCount = await disablePublicReportAccess({
    client,
    where: { settingId: setting.id },
    accessStatus: decision.accessStatus,
    providerErrorCode: decision.providerErrorCode,
    now,
  });

  if (transitionCount > 0) {
    await onAccessDisabled({
      setting,
      accessStatus: decision.accessStatus,
      providerErrorCode: decision.providerErrorCode,
    });
  }

  return {
    status: "FAILED",
    retryNotBefore: null,
    globalRateLimited: false,
    globalAuthFailed: false,
  };
}

async function readActivePublicReportSetting(
  client: DiscordBotClient,
  setting: PublicPriceReportSetting,
): Promise<{ id: string } | null> {
  return client.discordPublicPriceReportSetting.findFirst({
    where: {
      id: setting.id,
      discordGuildId: setting.discordGuildId,
      channelId: setting.channelId,
      enabled: true,
      accessStatus: "ACTIVE",
    },
    select: { id: true },
  });
}
