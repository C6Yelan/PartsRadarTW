// apps/crawler/src/scripts/ops/product-link-health-report.ts
// Builds an aggregate report from persisted product_link_health rows.
// This command is read-only and never contacts external product links.
import type { Prisma } from "@partsradar/db";
import { getStringArg, resolveWorkspaceRoot } from "../shared/script-utils";
import {
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
  type ProductLinkHealthStatusValue,
  type ProductLinkKindValue,
} from "./product-link-checker/processor";

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

export type ProductLinkHealthReportRecord = Prisma.ProductLinkHealthGetPayload<{
  select: typeof PRODUCT_LINK_HEALTH_REPORT_SELECT;
}>;

type ProductLinkHealthReportFindManyArgs = Omit<Prisma.ProductLinkHealthFindManyArgs, "select"> & {
  select: typeof PRODUCT_LINK_HEALTH_REPORT_SELECT;
};

export interface ProductLinkHealthReportClient {
  productLinkHealth: {
    findMany(args: ProductLinkHealthReportFindManyArgs): Promise<ProductLinkHealthReportRecord[]>;
  };
}

export interface ProductLinkHealthReportOptions {
  workspaceRoot: string;
  includeInactive: boolean;
  kinds: ProductLinkKindValue[];
}

export interface ProductLinkHealthReport {
  generatedAt: Date;
  scope: "active products" | "all products";
  total: number;
  kinds: ProductLinkHealthKindReport[];
}

export interface ProductLinkHealthKindReport {
  linkKind: ProductLinkKindValue;
  total: number;
  statuses: Record<ProductLinkHealthStatusValue, number>;
  errors: Record<"TEMPORARY_ERROR" | "BROKEN", ProductLinkHealthErrorBreakdown>;
}

export interface ProductLinkHealthErrorBreakdown {
  total: number;
  httpStatusCounts: CountBucket[];
  failureCountCounts: CountBucket[];
}

export interface CountBucket {
  label: string;
  count: number;
}

export function parseProductLinkHealthReportOptions(
  args: string[],
  cwd = process.cwd(),
): ProductLinkHealthReportOptions {
  if (args.includes("--help")) {
    printProductLinkHealthReportHelp();
    process.exit(0);
  }

  return {
    workspaceRoot: resolveWorkspaceRoot(cwd),
    includeInactive: args.includes("--include-inactive"),
    kinds: parseKinds(getStringArg(args, "--kinds")),
  };
}

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

function parseKinds(rawKinds: string | undefined): ProductLinkKindValue[] {
  const rawValues = rawKinds?.split(",").map((value) => value.trim().toLowerCase()) ?? ["source"];
  const kinds: ProductLinkKindValue[] = [];

  for (const rawValue of rawValues) {
    const kind = toProductLinkKind(rawValue);

    if (!kind) {
      throw new Error("--kinds only supports source.");
    }

    if (!kinds.includes(kind)) {
      kinds.push(kind);
    }
  }

  if (kinds.length === 0) {
    throw new Error("--kinds only supports source.");
  }

  return kinds;
}

function toProductLinkKind(rawValue: string): ProductLinkKindValue | null {
  switch (rawValue) {
    case "source":
      return PRODUCT_LINK_KINDS.SOURCE;
    default:
      return null;
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

export function printProductLinkHealthReportHelp(): void {
  console.log(`Usage:
  pnpm ops:product-links:report [options]

Options:
  --kinds <list>       Comma-separated link kinds. Only source is supported.
                       Default: source
  --include-inactive   Include inactive products. Default: active products only.
  --help               Show this help message.
`);
}
