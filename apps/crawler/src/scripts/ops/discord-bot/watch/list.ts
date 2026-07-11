// apps/crawler/src/scripts/ops/discord-bot/watch/list.ts
// 讀取單一 Discord 使用者的目標價 watch 管理清單，依最近更新固定排序並分頁。

import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../constants";
import type { DiscordBotClient } from "../types";
import { WATCH_MANAGER_PAGE_SIZE } from "./list-limits";
import { TARGET_PRICE_WATCH_LIST_SELECT, type TargetPriceWatchlistResult } from "./records";

// 建立 watch 管理面板需要的清單結果，回傳當頁資料與分頁狀態。
export async function readTargetPriceWatchlist({
  client,
  discordUserId,
  page = 0,
}: {
  client: DiscordBotClient;
  discordUserId: string;
  page?: number;
}): Promise<TargetPriceWatchlistResult> {
  const boundedPage = Number.isSafeInteger(page) && page > 0 ? page : 0;
  // 固定最近更新優先，id 作穩定 tie-breaker，避免分頁之間順序跳動。
  const watches = await client.discordTargetPriceWatch.findMany({
    where: {
      discordUserId,
      enabled: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: MAX_TARGET_PRICE_WATCHES_PER_USER,
    select: TARGET_PRICE_WATCH_LIST_SELECT,
  });
  const pageStart = boundedPage * WATCH_MANAGER_PAGE_SIZE;
  const listedWatches = watches.slice(pageStart, pageStart + WATCH_MANAGER_PAGE_SIZE);

  return {
    watches: listedWatches,
    page: boundedPage,
    totalCount: watches.length,
    hasPreviousPage: boundedPage > 0,
    hasNextPage: watches.length > pageStart + WATCH_MANAGER_PAGE_SIZE,
  };
}
