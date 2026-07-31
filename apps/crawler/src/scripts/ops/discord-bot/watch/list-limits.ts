// apps/crawler/src/scripts/ops/discord-bot/watch/list-limits.ts
// 集中定義 watch 管理清單的分頁上限，讓資料查詢與 Discord 訊息顯示使用同一個數字。

import { MAX_TARGET_PRICE_WATCHES_PER_USER } from "../constants";

// 每頁最多顯示 25 筆，對應 Discord select menu 的 options 上限。
export const WATCH_MANAGER_PAGE_SIZE = 25;

// 依每位使用者的 watch 上限推導 custom id 可表示的最大頁碼。
export const WATCH_MANAGER_MAX_PAGE = Math.max(
  0,
  Math.ceil(MAX_TARGET_PRICE_WATCHES_PER_USER / WATCH_MANAGER_PAGE_SIZE) - 1,
);

// 以一次 bounded list 的實際筆數將任意 page 正規化到最後一個合法頁面。
export function clampWatchManagerPage(page: number, totalCount: number): number {
  const requestedPage =
    Number.isSafeInteger(page) && page > 0 ? Math.min(page, WATCH_MANAGER_MAX_PAGE) : 0;
  const boundedTotalCount =
    Number.isSafeInteger(totalCount) && totalCount > 0
      ? Math.min(totalCount, MAX_TARGET_PRICE_WATCHES_PER_USER)
      : 0;
  const lastPage =
    boundedTotalCount === 0
      ? 0
      : Math.min(
          WATCH_MANAGER_MAX_PAGE,
          Math.floor((boundedTotalCount - 1) / WATCH_MANAGER_PAGE_SIZE),
        );

  return Math.min(requestedPage, lastPage);
}
