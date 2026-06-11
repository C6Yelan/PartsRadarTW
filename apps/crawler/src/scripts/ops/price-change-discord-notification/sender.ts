// apps/crawler/src/scripts/ops/price-change-discord-notification/sender.ts

import {
  type DiscordWebhookSendOptions,
  type DiscordWebhookSendResult,
  sendDiscordWebhookMessage,
} from "../discord-webhook";
import { createPriceChangeDiscordMessages } from "./messages";
import { readCrawlRunPriceChangeSummary } from "./reader";
import type {
  PriceChangeDiscordClient,
  PriceChangeDiscordNotificationOptions,
  PriceChangeDiscordNotificationResult,
} from "./types";

export async function sendCrawlRunPriceChangeDiscordNotification({
  client,
  crawlRunId,
  options,
  sendDiscordWebhook = sendDiscordWebhookMessage,
}: {
  client: PriceChangeDiscordClient;
  crawlRunId: string;
  options: PriceChangeDiscordNotificationOptions;
  sendDiscordWebhook?: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
}): Promise<PriceChangeDiscordNotificationResult> {
  if (!options.publicWebhookUrl) {
    return {
      status: "skipped",
      reason: "missing_webhook_url",
      changeCount: 0,
      listedCount: 0,
      messageCount: 0,
    };
  }

  const readResult = await readCrawlRunPriceChangeSummary(client, crawlRunId);
  const { changes } = readResult;

  if (changes.length === 0) {
    return {
      status: "skipped",
      reason: "no_price_changes",
      changeCount: 0,
      listedCount: 0,
      messageCount: 0,
      snapshotCount: readResult.snapshotCount,
      unmatchedSnapshotCount: readResult.unmatchedSnapshotCount,
      unchangedSnapshotCount: readResult.unchangedSnapshotCount,
      currencyMismatchCount: readResult.currencyMismatchCount,
    };
  }

  const messages = createPriceChangeDiscordMessages(changes, options);
  const httpStatuses: number[] = [];

  for (const message of messages) {
    const result = await sendDiscordWebhook({
      webhookUrl: options.publicWebhookUrl,
      message,
    });

    if (result.status === "sent") {
      httpStatuses.push(result.httpStatus);
      continue;
    }

    if (result.status === "rate_limited") {
      return {
        status: "rate_limited",
        changeCount: changes.length,
        listedCount: Math.min(changes.length, options.maxItems),
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        retryAfterMs: result.retryAfterMs,
        global: result.global,
      };
    }

    if (result.status === "failed") {
      return {
        status: "failed",
        changeCount: changes.length,
        listedCount: Math.min(changes.length, options.maxItems),
        messageCount: messages.length,
        sentMessageCount: httpStatuses.length,
        httpStatus: result.httpStatus,
        message: result.message,
      };
    }

    return {
      status: "skipped",
      reason: "sender_skipped",
      changeCount: changes.length,
      listedCount: Math.min(changes.length, options.maxItems),
      messageCount: messages.length,
    };
  }

  return {
    status: "sent",
    changeCount: changes.length,
    listedCount: Math.min(changes.length, options.maxItems),
    messageCount: messages.length,
    httpStatuses,
  };
}
