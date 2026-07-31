// apps/crawler/src/scripts/ops/discord-bot/target-price-notification/records.ts
// 提供已由 DB claim 的目標價 watches 分組 helper。

import type { TargetPriceNotificationWatch } from "@partsradar/db/target-price-notification";

export type { TargetPriceNotificationWatch };

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
