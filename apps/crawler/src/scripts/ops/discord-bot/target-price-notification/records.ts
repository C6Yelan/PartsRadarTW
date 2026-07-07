// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/records.ts
// 定義目標價通知掃描用的 watch 讀取欄位，並提供達標判斷與同使用者分組 helper。

import type { Prisma } from "@partsradar/db";

// 限定通知掃描只讀取達標判斷、訊息組裝與 delivery 紀錄需要的欄位。
export const TARGET_PRICE_NOTIFICATION_SELECT = {
  id: true,
  discordUserId: true,
  productId: true,
  targetPrice: true,
  currency: true,
  notificationCursorAt: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      name: true,
      currentPrice: {
        select: {
          priceSnapshot: {
            select: {
              price: true,
              currency: true,
              capturedAt: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.DiscordTargetPriceWatchSelect;

// 目標價通知流程在查詢、claim、訊息組裝與 delivery 紀錄之間傳遞的 watch contract。
export type TargetPriceNotificationWatch = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_NOTIFICATION_SELECT;
}>;

// 將達標 watch 依 Discord 使用者分組，讓同一使用者的多筆通知合併成單次 DM。
export function groupTargetPriceWatchesByUser(
  watches: TargetPriceNotificationWatch[],
): TargetPriceNotificationWatch[][] {
  const grouped = new Map<string, TargetPriceNotificationWatch[]>();

  for (const watch of watches) {
    grouped.set(watch.discordUserId, [...(grouped.get(watch.discordUserId) ?? []), watch]);
  }

  return [...grouped.values()];
}

// 判斷 watch 是否已達目標價，並排除通知游標之前已看過的價格快照。
export function isTargetPriceReached(watch: TargetPriceNotificationWatch): boolean {
  const snapshot = watch.product.currentPrice?.priceSnapshot;

  return (
    snapshot !== undefined &&
    snapshot.currency === watch.currency &&
    (!watch.notificationCursorAt ||
      snapshot.capturedAt.getTime() > watch.notificationCursorAt.getTime()) &&
    snapshot.price <= watch.targetPrice
  );
}
