// apps/crawler/src/scripts/ops/discord-bot/price-report/categories.ts

import type { DiscordBotClient } from "../types";
import type { PriceReportCategoryOption } from "./filters";

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
