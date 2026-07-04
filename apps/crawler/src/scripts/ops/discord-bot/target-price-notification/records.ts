// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/records.ts

import type { Prisma } from "@partsradar/db";

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

export type TargetPriceNotificationWatch = Prisma.DiscordTargetPriceWatchGetPayload<{
  select: typeof TARGET_PRICE_NOTIFICATION_SELECT;
}>;

export function groupTargetPriceWatchesByUser(
  watches: TargetPriceNotificationWatch[],
): TargetPriceNotificationWatch[][] {
  const grouped = new Map<string, TargetPriceNotificationWatch[]>();

  for (const watch of watches) {
    grouped.set(watch.discordUserId, [...(grouped.get(watch.discordUserId) ?? []), watch]);
  }

  return [...grouped.values()];
}

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
