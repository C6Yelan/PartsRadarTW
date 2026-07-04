// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/delivery.ts

import type {
  DiscordBotClient,
  DiscordBotMessageSendResult,
} from "../types";

export interface TargetPriceNotificationDeliveryWatch {
  id: string;
  discordUserId: string;
  productId: string;
  updatedAt: Date;
}

export async function recordTargetPriceNotificationDelivery({
  client,
  watch,
  result,
  now,
}: {
  client: DiscordBotClient;
  watch: TargetPriceNotificationDeliveryWatch;
  result: DiscordBotMessageSendResult;
  now: Date;
}): Promise<void> {
  await client.discordNotificationDelivery.create({
    data: {
      discordUserId: watch.discordUserId,
      kind: "TARGET_PRICE",
      status:
        result.status === "sent"
          ? "SENT"
          : result.status === "rate_limited"
            ? "RATE_LIMITED"
            : "FAILED",
      productId: watch.productId,
      targetPriceWatchId: watch.id,
      dedupeKey:
        result.status === "sent"
          ? `target-price:${watch.id}:${watch.updatedAt.toISOString()}`
          : null,
      itemCount: 1,
      messageCount: result.messageCount,
      deliveredAt: result.status === "sent" ? now : null,
      errorMessage: result.status === "failed" ? result.message : null,
    },
  });
}
