// apps/crawler/src/scripts/ops/product-link-health-report.ts
// 從既有 product_link_health rows 彙整唯讀報表；不會連外檢查商品連結。

import type { Prisma } from "@partsradar/db";
import {
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
  type ProductLinkHealthStatusValue,
  type ProductLinkKindValue,
} from "./product-link-checker/processor";
import type { ProductLinkHealthReportOptions } from "./product-link-health-report/options";

export {
  parseProductLinkHealthReportOptions,
  printProductLinkHealthReportHelp,
  type ProductLinkHealthReportOptions,
} from "./product-link-health-report/options";

const STATUS_ORDER: ProductLinkHealthStatusValue[] = [
  PRODUCT_LINK_HEALTH_STATUSES.OK,
  PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
  PRODUCT_LINK_HEALTH_STATUSES.BROKEN,
];
const FAILURE_BUCKET_ORDER = new Map([
  ["0", 0],
  ["1", 1],
  ["2", 2],
  [">=3", 3],
]);

export const PRODUCT_LINK_HEALTH_REPORT_SELECT = {
  linkKind: true,
  status: true,
  httpStatus: true,
  failureCount: true,
  checkedAt: true,
  lastFailureAt: true,
  product: {
    select: {
      isActive: true,
    },
  },
} as const satisfies Prisma.ProductLinkHealthSelect;

// product_link_health 報表讀取所需的最小 row shape，對應上方 Prisma select。
export type ProductLinkHealthReportRecord = Prisma.ProductLinkHealthGetPayload<{
  select: typeof PRODUCT_LINK_HEALTH_REPORT_SELECT;
}>;

type ProductLinkHealthReportFindManyArgs = Omit<Prisma.ProductLinkHealthFindManyArgs, "select"> & {
  select: typeof PRODUCT_LINK_HEALTH_REPORT_SELECT;
};

// 報表 helper 需要的最小資料讀取介面，讓 entrypoint 與測試不用依賴完整 PrismaClient。
export interface ProductLinkHealthReportClient {
  productLinkHealth: {
    findMany(args: ProductLinkHealthReportFindManyArgs): Promise<ProductLinkHealthReportRecord[]>;
  };
}

// product link health 報表的頂層結果，依 link kind 彙整狀態與錯誤分布。
export interface ProductLinkHealthReport {
  generatedAt: Date;
  scope: "active products" | "all products";
  total: number;
  kinds: ProductLinkHealthKindReport[];
}

// 單一 link kind 的健康狀態彙總，包含各狀態計數與錯誤細分。
export interface ProductLinkHealthKindReport {
  linkKind: ProductLinkKindValue;
  total: number;
  statuses: Record<ProductLinkHealthStatusValue, number>;
  errors: Record<"TEMPORARY_ERROR" | "BROKEN", ProductLinkHealthErrorBreakdown>;
}

// 錯誤狀態的 HTTP status 與連續失敗次數分布。
export interface ProductLinkHealthErrorBreakdown {
  total: number;
  httpStatusCounts: CountBucket[];
  failureCountCounts: CountBucket[];
}

// 報表中的計數桶，label 可能是 HTTP status、no_status 或 failure_count 區間。
export interface CountBucket {
  label: string;
  count: number;
}

// 讀取 product_link_health rows 並產生報表；預設只看 active products。
export async function readProductLinkHealthReport(
  client: ProductLinkHealthReportClient,
  options: ProductLinkHealthReportOptions,
  generatedAt = new Date(),
): Promise<ProductLinkHealthReport> {
  const records = await client.productLinkHealth.findMany({
    where: {
      linkKind: { in: options.kinds },
      ...(options.includeInactive
        ? {}
        : {
            product: {
              isActive: true,
            },
          }),
    },
    select: PRODUCT_LINK_HEALTH_REPORT_SELECT,
    orderBy: [{ linkKind: "asc" }, { status: "asc" }, { httpStatus: "asc" }],
  });

  return buildProductLinkHealthReport(records, options, generatedAt);
}

// 將查詢結果彙整成報表資料結構，讓 CLI formatting 與測試可重用。
export function buildProductLinkHealthReport(
  records: ProductLinkHealthReportRecord[],
  options: Pick<ProductLinkHealthReportOptions, "includeInactive" | "kinds">,
  generatedAt = new Date(),
): ProductLinkHealthReport {
  const reports = new Map<ProductLinkKindValue, ProductLinkHealthKindReport>();

  for (const linkKind of options.kinds) {
    reports.set(linkKind, createKindReport(linkKind));
  }

  for (const record of records) {
    const kindReport = reports.get(record.linkKind);

    if (!kindReport) {
      continue;
    }

    kindReport.total += 1;
    kindReport.statuses[record.status] += 1;

    if (record.status === PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR) {
      addErrorRecord(kindReport.errors.TEMPORARY_ERROR, record);
    }

    if (record.status === PRODUCT_LINK_HEALTH_STATUSES.BROKEN) {
      addErrorRecord(kindReport.errors.BROKEN, record);
    }
  }

  return {
    generatedAt,
    scope: options.includeInactive ? "all products" : "active products",
    total: records.length,
    kinds: options.kinds.map((linkKind) => reports.get(linkKind) ?? createKindReport(linkKind)),
  };
}

// 將報表轉成 CLI 文字輸出，供手動維運快速查看 link health 分布。
export function formatProductLinkHealthReport(report: ProductLinkHealthReport): string {
  const lines = [
    "Product link health report",
    `Scope: ${report.scope}`,
    `Generated at: ${report.generatedAt.toISOString()}`,
    `Total records: ${report.total}`,
    "",
  ];

  for (const kindReport of report.kinds) {
    lines.push(`${toPublicKindLabel(kindReport.linkKind)}:`);

    for (const status of STATUS_ORDER) {
      lines.push(`  ${toPublicStatusLabel(status)}: ${kindReport.statuses[status]}`);

      if (status === PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR) {
        appendErrorBreakdown(lines, kindReport.errors.TEMPORARY_ERROR);
      }

      if (status === PRODUCT_LINK_HEALTH_STATUSES.BROKEN) {
        appendErrorBreakdown(lines, kindReport.errors.BROKEN);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function createKindReport(linkKind: ProductLinkKindValue): ProductLinkHealthKindReport {
  return {
    linkKind,
    total: 0,
    statuses: createStatusCounts(),
    errors: {
      TEMPORARY_ERROR: createErrorBreakdown(),
      BROKEN: createErrorBreakdown(),
    },
  };
}

function createStatusCounts(): Record<ProductLinkHealthStatusValue, number> {
  return {
    OK: 0,
    TEMPORARY_ERROR: 0,
    BROKEN: 0,
  };
}

function createErrorBreakdown(): ProductLinkHealthErrorBreakdown {
  return {
    total: 0,
    httpStatusCounts: [],
    failureCountCounts: [],
  };
}

function addErrorRecord(
  breakdown: ProductLinkHealthErrorBreakdown,
  record: ProductLinkHealthReportRecord,
): void {
  breakdown.total += 1;
  incrementBucket(breakdown.httpStatusCounts, toHttpStatusLabel(record.httpStatus), compareHttpBuckets);
  incrementBucket(
    breakdown.failureCountCounts,
    toFailureCountBucket(record.failureCount),
    compareFailureBuckets,
  );
}

function incrementBucket(
  buckets: CountBucket[],
  label: string,
  compare: (left: CountBucket, right: CountBucket) => number,
): void {
  const bucket = buckets.find((candidate) => candidate.label === label);

  if (bucket) {
    bucket.count += 1;
  } else {
    buckets.push({ label, count: 1 });
  }

  buckets.sort(compare);
}

function appendErrorBreakdown(lines: string[], breakdown: ProductLinkHealthErrorBreakdown): void {
  if (breakdown.total === 0) {
    return;
  }

  lines.push("    http_status:");
  for (const bucket of breakdown.httpStatusCounts) {
    lines.push(`      ${bucket.label}: ${bucket.count}`);
  }

  lines.push("    failure_count:");
  for (const bucket of breakdown.failureCountCounts) {
    lines.push(`      ${bucket.label}: ${bucket.count}`);
  }
}

function toPublicKindLabel(kind: ProductLinkKindValue): string {
  return kind === PRODUCT_LINK_KINDS.SOURCE ? "source" : kind;
}

function toPublicStatusLabel(status: ProductLinkHealthStatusValue): string {
  switch (status) {
    case PRODUCT_LINK_HEALTH_STATUSES.OK:
      return "ok";
    case PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR:
      return "temporary_error";
    case PRODUCT_LINK_HEALTH_STATUSES.BROKEN:
      return "broken";
  }
}

function toHttpStatusLabel(httpStatus: number | null): string {
  return httpStatus === null ? "no_status" : String(httpStatus);
}

function toFailureCountBucket(failureCount: number): string {
  if (failureCount >= 3) {
    return ">=3";
  }

  return String(Math.max(0, failureCount));
}

function compareHttpBuckets(left: CountBucket, right: CountBucket): number {
  if (left.count !== right.count) {
    return right.count - left.count;
  }

  return left.label.localeCompare(right.label);
}

function compareFailureBuckets(left: CountBucket, right: CountBucket): number {
  return (
    (FAILURE_BUCKET_ORDER.get(left.label) ?? Number.MAX_SAFE_INTEGER) -
    (FAILURE_BUCKET_ORDER.get(right.label) ?? Number.MAX_SAFE_INTEGER)
  );
}
