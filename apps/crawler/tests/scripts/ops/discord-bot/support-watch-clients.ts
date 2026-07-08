// apps/crawler/tests/scripts/ops/discord-bot/support-watch-clients.ts
// 建立 watch 測試常用的 Discord bot fake client 情境。
import { createDiscordBotClient } from "./support-client";
import { snapshot, targetPriceWatch } from "./support-data";
import {
  WATCH_PRODUCT_ID,
  WATCH_ROW_ID,
  WATCH_SECOND_PRODUCT_ID,
  WATCH_SECOND_ROW_ID,
} from "./support-options";

// 建立單一 watch 商品的管理面板測試 client。
export function createWatchManagerClient() {
  return createDiscordBotClient(
    [
      snapshot({
        id: "snapshot-watch-1",
        productId: WATCH_PRODUCT_ID,
        productName: "RTX 5070 測試卡",
        crawlRunId: "new-run",
        price: 18_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ],
    [],
    [
      targetPriceWatch({
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_PRODUCT_ID,
        targetPrice: 17_500,
      }),
    ],
  );
}

// 建立兩筆 watch 商品的批次操作測試 client。
export function createBatchWatchManagerClient() {
  return createDiscordBotClient(
    [
      snapshot({
        id: "snapshot-watch-1",
        productId: WATCH_PRODUCT_ID,
        productName: "RTX 5070 測試卡",
        crawlRunId: "new-run",
        price: 18_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "snapshot-watch-2",
        productId: WATCH_SECOND_PRODUCT_ID,
        productName: "DDR5 6400 測試記憶體",
        crawlRunId: "new-run",
        price: 8_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ],
    [],
    [
      targetPriceWatch({
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_PRODUCT_ID,
        targetPrice: 17_500,
      }),
      targetPriceWatch({
        id: WATCH_SECOND_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_SECOND_PRODUCT_ID,
        targetPrice: 8_500,
      }),
    ],
  );
}

// 建立兩筆不同更新時間 watch 商品的排序測試 client。
export function createSortableWatchManagerClient() {
  return createDiscordBotClient(
    [
      snapshot({
        id: "snapshot-watch-1",
        productId: WATCH_PRODUCT_ID,
        productName: "RTX 5070 測試卡",
        crawlRunId: "new-run",
        price: 18_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "snapshot-watch-2",
        productId: WATCH_SECOND_PRODUCT_ID,
        productName: "DDR5 6400 測試記憶體",
        crawlRunId: "new-run",
        price: 8_990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
    ],
    [],
    [
      targetPriceWatch({
        id: WATCH_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_PRODUCT_ID,
        targetPrice: 17_500,
        updatedAt: new Date("2026-06-07T02:00:00.000Z"),
      }),
      targetPriceWatch({
        id: WATCH_SECOND_ROW_ID,
        discordUserId: "111122223333444455",
        productId: WATCH_SECOND_PRODUCT_ID,
        targetPrice: 9_500,
        updatedAt: new Date("2026-06-07T01:00:00.000Z"),
      }),
    ],
  );
}
