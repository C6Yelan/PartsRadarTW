// apps/crawler/src/scripts/ops/discord-bot/watch/delivery-status.ts
// 讀取目標價 watch 最近一次 Discord 通知 delivery 狀態，供管理面板顯示通知結果。

import type { DiscordBotClient } from "../types";
import {
  TARGET_PRICE_WATCH_DELIVERY_STATUS_SELECT,
  type TargetPriceWatchDeliveryStatus,
} from "./records";

// 查詢指定 watch 最新的目標價通知 delivery，且限定只能讀取同一 Discord 使用者的紀錄。
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
