// apps/crawler/src/scripts/ops/discord-bot/target-price-notification.ts
// 掃描達標的目標價 watch，負責 claim、分組發送 Discord DM，並記錄通知 delivery 結果。

import { claimDueTargetPriceNotifications } from "@partsradar/db/target-price-notification";
import {
  MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE,
  TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS,
} from "./constants";
import { recordTargetPriceNotificationDelivery } from "./target-price-notification/delivery";
import { createTargetPriceReachedMessages } from "./target-price-notification/messages";
import { groupTargetPriceWatchesByUser } from "./target-price-notification/records";
import type { DiscordBotClient, DiscordBotMessage, DiscordMessageSendResult } from "./types";

const TARGET_PRICE_NOTIFICATION_SCAN_LIMIT = 256;

// 單輪目標價通知掃描結果，供 daemon log 與維運觀察本輪處理狀態。
export interface TargetPriceNotificationSummary {
  scannedCount: number;
  dueCount: number;
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

// 發送所有目前達標且尚未通知的 watch；以 claim lease 避免多個 daemon 重複寄送。
export async function sendDueTargetPriceNotifications({
  client,
  publicBaseUrl,
  now = new Date(),
  sendDirectMessages,
}: {
  client: DiscordBotClient;
  publicBaseUrl: string;
  now?: Date;
  sendDirectMessages: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordMessageSendResult>;
}): Promise<TargetPriceNotificationSummary> {
  const staleClaimBefore = new Date(now.getTime() - TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS);
  const claimBatch = await claimDueTargetPriceNotifications(client, {
    claimedAt: now,
    staleClaimBefore,
    scanLimit: TARGET_PRICE_NOTIFICATION_SCAN_LIMIT,
    claimLimit: MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE,
  });
  const dueWatches = claimBatch.watches;
  const unprocessedClaimIds = new Set(dueWatches.map(({ id }) => id));
  const summary: TargetPriceNotificationSummary = {
    scannedCount: claimBatch.scannedCount,
    dueCount: dueWatches.length,
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  for (const watches of groupTargetPriceWatchesByUser(dueWatches)) {
    summary.processedCount += watches.length;

    for (const watch of watches) {
      unprocessedClaimIds.delete(watch.id);
    }

    const discordUserId = watches[0]?.discordUserId;

    if (!discordUserId) {
      continue;
    }

    const activeClaims = await client.discordTargetPriceWatch.findMany({
      where: {
        id: { in: watches.map(({ id }) => id) },
        discordUserId,
        enabled: true,
        lastNotifiedAt: null,
        notificationClaimedAt: now,
      },
      select: { id: true },
    });
    const activeClaimIds = new Set(activeClaims.map(({ id }) => id));
    const sendableWatches = watches.filter(({ id }) => activeClaimIds.has(id));

    if (sendableWatches.length === 0) {
      continue;
    }

    const messages = createTargetPriceReachedMessages({ watches: sendableWatches, publicBaseUrl });
    let sendResult: DiscordMessageSendResult;

    try {
      sendResult = await sendDirectMessages(discordUserId, messages);
    } catch {
      sendResult = {
        status: "failed",
        messageCount: messages.length,
        sentMessageCount: 0,
        httpStatus: null,
        errorCategory: "TRANSPORT",
        providerErrorCode: null,
      };
    }

    const remainingClaims = await client.discordTargetPriceWatch.findMany({
      where: {
        id: { in: sendableWatches.map(({ id }) => id) },
        discordUserId,
        enabled: true,
        lastNotifiedAt: null,
        notificationClaimedAt: now,
      },
      select: { id: true },
    });
    const remainingClaimIds = new Set(remainingClaims.map(({ id }) => id));
    const persistableWatches = sendableWatches.filter(({ id }) => remainingClaimIds.has(id));

    if (persistableWatches.length === 0) {
      if (sendResult.status === "rate_limited") {
        await releaseUnprocessedClaims(client, unprocessedClaimIds, now);
        break;
      }
      continue;
    }

    if (sendResult.status === "sent") {
      for (const watch of persistableWatches) {
        const updated = await client.discordTargetPriceWatch.updateMany({
          where: {
            id: watch.id,
            enabled: true,
            lastNotifiedAt: null,
            notificationClaimedAt: now,
          },
          data: {
            lastNotifiedAt: now,
            notificationClaimedAt: null,
          },
        });
        if (updated.count === 0) {
          continue;
        }
        const recorded = await recordTargetPriceNotificationDelivery({
          client,
          watch,
          result: sendResult,
          now,
        });
        if (recorded) {
          summary.sentCount += 1;
        }
      }
    } else {
      for (const watch of persistableWatches) {
        const updated = await client.discordTargetPriceWatch.updateMany({
          where: {
            id: watch.id,
            lastNotifiedAt: null,
            notificationClaimedAt: now,
          },
          data: {
            notificationClaimedAt: null,
          },
        });
        if (updated.count === 0) {
          continue;
        }
        const recorded = await recordTargetPriceNotificationDelivery({
          client,
          watch,
          result: sendResult,
          now,
        });
        if (recorded && sendResult.status === "rate_limited") {
          summary.rateLimitedCount += 1;
        } else if (recorded) {
          summary.failedCount += 1;
        }
      }
    }

    if (sendResult.status === "rate_limited") {
      await releaseUnprocessedClaims(client, unprocessedClaimIds, now);
      break;
    }
  }

  return summary;
}

async function releaseUnprocessedClaims(
  client: DiscordBotClient,
  claimIds: Set<string>,
  claimedAt: Date,
): Promise<void> {
  if (claimIds.size === 0) {
    return;
  }
  await client.discordTargetPriceWatch.updateMany({
    where: {
      id: { in: [...claimIds] },
      lastNotifiedAt: null,
      notificationClaimedAt: claimedAt,
    },
    data: {
      notificationClaimedAt: null,
    },
  });
}
