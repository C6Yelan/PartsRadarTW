// apps/crawler/src/scripts/ops/production-smoke/checks/parse-errors.ts
// 檢查近期 parser error 與來源圖片 URL 異常，將真正解析失敗和圖片來源噪音分開告警。

import { MILLISECONDS_PER_HOUR } from "../constants";
import { ok, thresholdCheck, warn } from "../results";
import type {
  ProductionSmokeClient,
  ProductionSmokeOptions,
  SmokeCheckResult,
  SourceImageAnomalyRecord,
} from "../types";

// 統計近期非 INVALID_IMAGE_URL 的 parse errors，作為 parser 或來源頁結構漂移的 smoke 指標。
export async function checkRecentParseErrors(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const count = await client.parseError.count({
    where: {
      errorType: {
        not: "INVALID_IMAGE_URL",
      },
      createdAt: {
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

// 統計 INVALID_IMAGE_URL 異常量與 distinct 分布，避免固定來源圖片噪音被誤判為整體 parser 失敗。
export async function checkSourceImageAnomalies(
  client: ProductionSmokeClient,
  options: ProductionSmokeOptions,
  now: Date,
): Promise<SmokeCheckResult> {
  const since = new Date(now.getTime() - options.recentWindowHours * MILLISECONDS_PER_HOUR);
  const records = await client.parseError.findMany({
    where: {
      errorType: "INVALID_IMAGE_URL",
      createdAt: {
        gte: since,
      },
    },
    select: {
      rawToken: true,
      rawName: true,
      rawImageUrl: true,
    },
  });
  const summary = summarizeSourceImageAnomalies(records);
  const message = `${summary.rows} rows / ${summary.distinctProducts} distinct products / ${summary.distinctRawImageUrls} distinct raw image urls in ${options.recentWindowHours}h, warnAfter=${options.invalidImageUrlWarnCount}`;

  return summary.rows > options.invalidImageUrlWarnCount
    ? warn("source image anomalies", message)
    : ok("source image anomalies", message);
}

// 將圖片 URL 異常彙整成列數、商品數與原始圖片 URL 數，方便判斷是單品問題或來源規則漂移。
function summarizeSourceImageAnomalies(records: SourceImageAnomalyRecord[]) {
  const productKeys = new Set<string>();
  const rawImageUrls = new Set<string>();

  for (const record of records) {
    const productKey = toSourceImageAnomalyProductKey(record);
    const rawImageUrl = normalizeNullableText(record.rawImageUrl);

    if (productKey) {
      productKeys.add(productKey);
    }

    if (rawImageUrl) {
      rawImageUrls.add(rawImageUrl);
    }
  }

  return {
    rows: records.length,
    distinctProducts: productKeys.size,
    distinctRawImageUrls: rawImageUrls.size,
  };
}

// 優先用 ibuy token 當診斷 key；缺 token 時退回 raw name，避免異常完全失去商品分布資訊。
function toSourceImageAnomalyProductKey(record: SourceImageAnomalyRecord): string | null {
  const rawToken = normalizeNullableText(record.rawToken);

  if (rawToken) {
    return `token:${rawToken}`;
  }

  const rawName = normalizeNullableText(record.rawName);

  return rawName ? `name:${rawName}` : null;
}

// 正規化 nullable text，讓空字串不參與 distinct 統計。
function normalizeNullableText(value: string | null): string | null {
  const trimmed = value?.trim();

  return trimmed || null;
}
