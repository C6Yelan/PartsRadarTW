// apps/crawler/src/scripts/ops/production-smoke/checks/parse-errors.ts
// 檢查近期 parser error；來源圖片健康度由商品連續抓取失敗狀態另行判斷。

import { MILLISECONDS_PER_HOUR } from "../constants";
import { thresholdCheck } from "../results";
import type { ProductionSmokeClient, ProductionSmokeOptions, SmokeCheckResult } from "../types";

// 統計近期非 INVALID_IMAGE_URL 的 parse errors，作為 parser 或來源頁結構漂移的 smoke 指標。
export async function checkRecentParseErrors(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const count = await client.parseError.count({
    where: {
      NOT: [
        { errorType: "INVALID_IMAGE_URL" },
        {
          errorType: "CONTENT_VALIDATION_FAILED",
          message: { startsWith: "filter_sync_join_coverage_low;" },
        },
      ],
      lastSeenAt: {
        gte: since,
      },
    },
  });
  const message = `${count} parse error(s) in ${options.recentWindowHours}h`;

  return thresholdCheck(
    "recent parse errors",
    count,
    options.parseErrorWarnCount,
    options.parseErrorFailCount,
    message,
  );
}
