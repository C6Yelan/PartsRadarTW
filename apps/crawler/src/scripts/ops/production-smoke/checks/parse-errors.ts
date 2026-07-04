// apps/crawler/src/scripts/ops/production-smoke/checks/parse-errors.ts
import { MILLISECONDS_PER_HOUR } from "../constants";
import { ok, thresholdCheck, warn } from "../results";
import type {
  ProductionSmokeClient,
  ProductionSmokeOptions,
  SmokeCheckResult,
  SourceImageAnomalyRecord,
} from "../types";

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

function toSourceImageAnomalyProductKey(record: SourceImageAnomalyRecord): string | null {
  const rawToken = normalizeNullableText(record.rawToken);

  if (rawToken) {
    return `token:${rawToken}`;
  }

  const rawName = normalizeNullableText(record.rawName);

  return rawName ? `name:${rawName}` : null;
}

function normalizeNullableText(value: string | null): string | null {
  const trimmed = value?.trim();

  return trimmed || null;
}
