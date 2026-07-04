// apps/crawler/src/scripts/ops/discord-bot/watch/delivery-status.ts

import type { DiscordBotClient } from "../types";
import {
  TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT,
  type TargetPriceWatchDeliveryStatus,
} from "./records";

export async function readLatestTargetPriceWatchDelivery({
  client,
  discordUserId,
  watchId,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  watchId: string;
}): Promise<TargetPriceWatchDeliveryStatus | null> {
  return client.discordNotificationDelivery.findFirst({
    where: {
      discordUserId,
      kind: "TARGET_PRICE",
      targetPriceWatchId: watchId,
    },
    select: TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
