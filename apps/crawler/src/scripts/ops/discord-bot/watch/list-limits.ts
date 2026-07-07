// apps/crawler/src/scripts/ops/discord-bot/watch/list-limits.ts
// 集中定義 watch 管理清單的分頁上限，讓資料查詢與 Discord 訊息顯示使用同一個數字。

// 每頁最多顯示 25 筆，對應 Discord select menu 的 options 上限。
export const WATCH_MANAGER_PAGE_SIZE = 25;
