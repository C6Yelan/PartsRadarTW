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
      lastSeenAt: {
        gte: since,
      },
    },
    select: {
      sourceCategoryId: true,
      rawToken: true,
      rawName: true,
      rawImageUrl: true,
      message: true,
      occurrenceCount: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
  const summary = summarizeSourceImageAnomalies(records);
  const productRefs = records.flatMap((record) =>
    record.rawToken
      ? [{ sourceCategoryId: record.sourceCategoryId, ibuyToken: record.rawToken }]
      : [],
  );
  const products = productRefs.length
    ? await client.product.findMany({
        where: { OR: productRefs },
        select: { id: true, sourceCategoryId: true, ibuyToken: true },
      })
    : [];
  const productIds = new Map(
    products.map((product) => [
      `${product.sourceCategoryId}\u0000${product.ibuyToken}`,
      product.id,
    ]),
  );
  const activeProductCount = await client.product.count({ where: { isActive: true } });
  const failurePercent =
    activeProductCount === 0 ? 0 : (summary.distinctProducts / activeProductCount) * 100;
  const details = records
    .slice(0, 5)
    .map((record) => {
      const productId = record.rawToken
        ? productIds.get(`${record.sourceCategoryId}\u0000${record.rawToken}`)
        : undefined;
      const durationHours =
        (record.lastSeenAt.getTime() - record.createdAt.getTime()) / MILLISECONDS_PER_HOUR;
      return `id=${productId ?? "unknown"} url=${record.rawImageUrl ?? "missing"} reason=${record.message} duration=${durationHours.toFixed(2)}h`;
    })
    .join(" | ");
  const message = `${summary.occurrences} occurrence(s) / ${summary.distinctProducts} distinct products / ${summary.distinctRawImageUrls} distinct raw image urls / ${failurePercent.toFixed(2)}% of ${activeProductCount} active products / longest ${summary.longestPersistenceHours.toFixed(2)}h in ${options.recentWindowHours}h${details ? `; ${details}` : ""}`;
  const shouldWarn =
    summary.distinctProducts > options.invalidImageUrlWarnCount ||
    summary.distinctRawImageUrls > options.invalidImageUrlWarnUrlCount ||
    failurePercent > options.invalidImageUrlWarnPercent ||
    summary.longestPersistenceHours >= options.invalidImageUrlWarnHours;

  return shouldWarn
    ? warn("source image anomalies", message)
    : ok("source image anomalies", message);
}

// 將圖片 URL 異常彙整成列數、商品數與原始圖片 URL 數，方便判斷是單品問題或來源規則漂移。
function summarizeSourceImageAnomalies(records: SourceImageAnomalyRecord[]) {
  const productKeys = new Set<string>();
  const rawImageUrls = new Set<string>();
  const productTimes = new Map<string, { first: number; last: number }>();
  let occurrences = 0;

  for (const record of records) {
    occurrences += record.occurrenceCount;
    const productKey = toSourceImageAnomalyProductKey(record);
    const rawImageUrl = normalizeNullableText(record.rawImageUrl);

    if (productKey) {
      productKeys.add(productKey);
      const createdAt = record.createdAt.getTime();
      const lastSeenAt = record.lastSeenAt.getTime();
      const times = productTimes.get(productKey);
      productTimes.set(productKey, {
        first: times ? Math.min(times.first, createdAt) : createdAt,
        last: times ? Math.max(times.last, lastSeenAt) : lastSeenAt,
      });
    }

    if (rawImageUrl) {
      rawImageUrls.add(rawImageUrl);
    }
  }

  return {
    occurrences,
    distinctProducts: productKeys.size,
    distinctRawImageUrls: rawImageUrls.size,
    longestPersistenceHours: Math.max(
      0,
      ...[...productTimes.values()].map(
        ({ first, last }) => (last - first) / MILLISECONDS_PER_HOUR,
      ),
    ),
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
