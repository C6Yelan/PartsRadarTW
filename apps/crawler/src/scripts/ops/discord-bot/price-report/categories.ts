// apps/crawler/src/scripts/ops/discord-bot/price-report/categories.ts
// 讀取 Discord price-report 設定面板可選的啟用中來源分類。

import type { DiscordBotClient } from "../types";
import type { PriceReportCategoryOption } from "./filters";

// 取得目前可供個人與公開價格報告篩選使用的來源分類選項。
export async function readPriceReportCategories({
  client,
}: {
  client: DiscordBotClient;
}): Promise<PriceReportCategoryOption[]> {
  return client.sourceCategory.findMany({
    where: {
      enabled: true,
    },
    select: {
      igrp: true,
      displayName: true,
    },
    orderBy: [{ igrp: "asc" }, { displayName: "asc" }],
  });
}
