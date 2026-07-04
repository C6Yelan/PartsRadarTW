import { toSafeCliErrorMessage } from "../../shared/script-utils";
import {
  MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE,
  TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS,
} from "./constants";
import { recordTargetPriceNotificationDelivery } from "./target-price-notification/delivery";
import {
  createTargetPriceReachedMessages,
} from "./target-price-notification/messages";
import {
  TARGET_PRICE_NOTIFICATION_SELECT,
  groupTargetPriceWatchesByUser,
  isTargetPriceReached,
  type TargetPriceNotificationWatch,
} from "./target-price-notification/records";
import type { DiscordBotClient, DiscordBotMessage, DiscordBotMessageSendResult } from "./types";

export interface TargetPriceNotificationSummary {
  scannedCount: number;
  dueCount: number;
  processedCount: number;
  sentCount: number;
  rateLimitedCount: number;
  failedCount: number;
}

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
  ) => Promise<DiscordBotMessageSendResult>;
}): Promise<TargetPriceNotificationSummary> {
  const staleClaimBefore = new Date(now.getTime() - TARGET_PRICE_NOTIFICATION_CLAIM_LEASE_MS);
  const candidates = await client.discordTargetPriceWatch.findMany({
    where: {
      enabled: true,
      lastNotifiedAt: null,
      OR: [{ notificationClaimedAt: null }, { notificationClaimedAt: { lte: staleClaimBefore } }],
      product: {
        isActive: true,
        currentPrice: {
          isNot: null,
        },
      },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: TARGET_PRICE_NOTIFICATION_SELECT,
  });
  const dueWatches = candidates
    .filter(isTargetPriceReached)
    .slice(0, MAX_TARGET_PRICE_NOTIFICATIONS_PER_CYCLE);
  const summary: TargetPriceNotificationSummary = {
    scannedCount: candidates.length,
    dueCount: dueWatches.length,
    processedCount: 0,
    sentCount: 0,
    rateLimitedCount: 0,
    failedCount: 0,
  };

  for (const watches of groupTargetPriceWatchesByUser(dueWatches)) {
    const claimedWatches: TargetPriceNotificationWatch[] = [];

    for (const watch of watches) {
      const claimed = await client.discordTargetPriceWatch.updateMany({
        where: {
          id: watch.id,
          enabled: true,
          lastNotifiedAt: null,
          OR: [
            { notificationClaimedAt: null },
            { notificationClaimedAt: { lte: staleClaimBefore } },
          ],
        },
        data: {
          notificationClaimedAt: now,
        },
      });

      if (claimed.count === 0) {
        continue;
      }

      summary.processedCount += 1;
      claimedWatches.push(watch);
    }

    if (claimedWatches.length === 0) {
      continue;
    }

    const discordUserId = claimedWatches[0]?.discordUserId;

    if (!discordUserId) {
      continue;
    }

    const messages = createTargetPriceReachedMessages({ watches: claimedWatches, publicBaseUrl });
    let sendResult: DiscordBotMessageSendResult;

    try {
      sendResult = await sendDirectMessages(discordUserId, messages);
    } catch (error) {
      sendResult = {
        status: "failed",
        messageCount: messages.length,
        sentMessageCount: 0,
        httpStatus: null,
        message: toSafeCliErrorMessage(error),
      };
    }

    if (sendResult.status === "sent") {
      summary.sentCount += claimedWatches.length;

      for (const watch of claimedWatches) {
        await client.discordTargetPriceWatch.updateMany({
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
      }
    } else {
      if (sendResult.status === "rate_limited") {
        summary.rateLimitedCount += claimedWatches.length;
      } else {
        summary.failedCount += claimedWatches.length;
      }

      for (const watch of claimedWatches) {
        await client.discordTargetPriceWatch.updateMany({
          where: {
            id: watch.id,
            lastNotifiedAt: null,
            notificationClaimedAt: now,
          },
          data: {
            notificationClaimedAt: null,
          },
        });
      }
    }

    for (const watch of claimedWatches) {
      await recordTargetPriceNotificationDelivery({
        client,
        watch,
        result: sendResult,
        now,
      });
    }

    if (sendResult.status === "rate_limited") {
      break;
    }
  }

  return summary;
}

export { createTargetPriceReachedMessage } from "./target-price-notification/messages";
