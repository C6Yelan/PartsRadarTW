// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/delivery.ts
// 寫入目標價通知的 Discord delivery 紀錄，供通知去重、狀態追蹤與維運檢查使用。

import { toDiscordDeliveryErrorFields } from "../delivery-error-fields";
import type { DiscordBotClient, DiscordMessageSendResult } from "../types";

// 寫入 delivery 紀錄所需的 watch 最小資料，避免通知流程依賴完整 watch row。
export interface TargetPriceNotificationDeliveryWatch {
  id: string;
  discordUserId: string;
  productId: string;
  updatedAt: Date;
}

// 記錄單次目標價通知發送結果；成功時用 watch id 與 updatedAt 建立 dedupe key。
export async function recordTargetPriceNotificationDelivery({
  client,
  watch,
  result,
  now,
}: {
  client: DiscordBotClient;
  watch: TargetPriceNotificationDeliveryWatch;
  result: DiscordMessageSendResult;
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
      ...toDiscordDeliveryErrorFields(result),
    },
  });
}
