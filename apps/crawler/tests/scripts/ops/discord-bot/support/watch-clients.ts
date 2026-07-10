// apps/crawler/tests/scripts/ops/discord-bot/support/watch-clients.ts
// 建立 watch 測試常用的 Discord bot fake client 情境。
import { createDiscordBotClient } from "./client";
import { snapshot, targetPriceWatch } from "./data";
import { WATCH_PRODUCT_ID, WATCH_ROW_ID } from "./options";

// 建立單一 watch 商品的管理面板測試 client。
export function createWatchManagerClient() {
  return createDiscordBotClient({
    snapshots: [
      snapshot({
        id: "snapshot-watch-1",
        productId: WATCH_PRODUCT_ID,
        productName: "RTX 5070 測試卡",
        crawlRunId: "new-run",
        price: 18_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ],
    watches: [
      targetPriceWatch({
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_PRODUCT_ID,
        targetPrice: 17_500,
      }),
    ],
  });
}
