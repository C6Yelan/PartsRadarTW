// apps/crawler/tests/scripts/ops/product-link-health-report.test.ts
// 驗證 product link health report 的 CLI 範圍解析、資料查詢條件、彙整統計與維運輸出格式。

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProductLinkHealthReport,
  formatProductLinkHealthReport,
  parseProductLinkHealthReportOptions,
  readProductLinkHealthReport,
  type ProductLinkHealthReportClient,
  type ProductLinkHealthReportRecord,
} from "../../../src/scripts/ops/product-link-health-report";
import {
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
} from "../../../src/scripts/ops/product-link-checker/processor";

const NOW = new Date("2026-06-07T12:00:00.000Z");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("product link health report options", () => {
  it("uses active products and source links by default", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseProductLinkHealthReportOptions([], workspaceRoot);

    expect(options).toEqual({
      workspaceRoot,
      includeInactive: false,
      kinds: [PRODUCT_LINK_KINDS.SOURCE],
    });
  });

  it("accepts source kind filters and inactive rows", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseProductLinkHealthReportOptions(
      ["--kinds", "source", "--include-inactive"],
      workspaceRoot,
    );

    expect(options).toEqual({
      workspaceRoot,
      includeInactive: true,
      kinds: [PRODUCT_LINK_KINDS.SOURCE],
    });
  });

  it("rejects invalid kind filters", async () => {
    const workspaceRoot = await createWorkspace();

    expect(() =>
      parseProductLinkHealthReportOptions(["--kinds", "source,download"], workspaceRoot),
    ).toThrow("--kinds only supports source");
  });
});

describe("product link health report data", () => {
  it("reads active product link health rows by default", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseProductLinkHealthReportOptions(["--kinds", "source"], workspaceRoot);
    const client = fakeReportClient([]);

    await readProductLinkHealthReport(client, options, NOW);

    expect(client.lastFindManyArgs).toMatchObject({
      where: {
        linkKind: { in: [PRODUCT_LINK_KINDS.SOURCE] },
        product: { isActive: true },
      },
    });
  });

  it("can include inactive product link health rows", async () => {
    const workspaceRoot = await createWorkspace();
    const options = parseProductLinkHealthReportOptions(["--include-inactive"], workspaceRoot);
    const client = fakeReportClient([]);

    await readProductLinkHealthReport(client, options, NOW);

    expect(client.lastFindManyArgs?.where).toEqual({
      linkKind: { in: [PRODUCT_LINK_KINDS.SOURCE] },
    });
  });

  it("splits source status, HTTP status, and failure count", () => {
    const report = buildProductLinkHealthReport(
      [
        record({ linkKind: PRODUCT_LINK_KINDS.SOURCE }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
          httpStatus: 403,
          failureCount: 1,
        }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
          httpStatus: 403,
          failureCount: 1,
        }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
          httpStatus: 404,
          failureCount: 2,
        }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
          httpStatus: null,
          failureCount: 3,
        }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.BROKEN,
          httpStatus: 404,
          failureCount: 4,
        }),
      ],
      {
        includeInactive: false,
        kinds: [PRODUCT_LINK_KINDS.SOURCE],
      },
      NOW,
    );

    expect(report.kinds).toEqual([
      expect.objectContaining({
        linkKind: PRODUCT_LINK_KINDS.SOURCE,
        total: 6,
        statuses: {
          OK: 1,
          TEMPORARY_ERROR: 4,
          BROKEN: 1,
        },
        errors: {
          TEMPORARY_ERROR: {
            total: 4,
            httpStatusCounts: [
              { label: "403", count: 2 },
              { label: "404", count: 1 },
              { label: "no_status", count: 1 },
            ],
            failureCountCounts: [
              { label: "1", count: 2 },
              { label: "2", count: 1 },
              { label: ">=3", count: 1 },
            ],
          },
          BROKEN: {
            total: 1,
            httpStatusCounts: [{ label: "404", count: 1 }],
            failureCountCounts: [{ label: ">=3", count: 1 }],
          },
        },
      }),
    ]);
  });

  it("formats an operator-friendly aggregate report", () => {
    const report = buildProductLinkHealthReport(
      [
        record({ linkKind: PRODUCT_LINK_KINDS.SOURCE }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
          httpStatus: 403,
          failureCount: 1,
        }),
        record({
          linkKind: PRODUCT_LINK_KINDS.SOURCE,
          status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
          httpStatus: null,
          failureCount: 1,
        }),
      ],
      {
        includeInactive: false,
        kinds: [PRODUCT_LINK_KINDS.SOURCE],
      },
      NOW,
    );

    expect(formatProductLinkHealthReport(report)).toBe(`Product link health report
Scope: active products
Generated at: 2026-06-07T12:00:00.000Z
Total records: 3

source:
  ok: 1
  temporary_error: 2
    http_status:
      403: 1
      no_status: 1
    failure_count:
      1: 2
  broken: 0`);
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-link-report-"));
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(join(workspaceRoot, "apps", "crawler"), { recursive: true });

  return workspaceRoot;
}

function record(
  overrides: Partial<ProductLinkHealthReportRecord> = {},
): ProductLinkHealthReportRecord {
  return {
    linkKind: PRODUCT_LINK_KINDS.SOURCE,
    status: PRODUCT_LINK_HEALTH_STATUSES.OK,
    httpStatus: 200,
    failureCount: 0,
    checkedAt: new Date("2026-06-07T11:00:00.000Z"),
    lastFailureAt: null,
    product: {
      isActive: true,
    },
    ...overrides,
  };
}

function fakeReportClient(records: ProductLinkHealthReportRecord[]) {
  const state = {
    lastFindManyArgs: undefined as
      | Parameters<ProductLinkHealthReportClient["productLinkHealth"]["findMany"]>[0]
      | undefined,
  };

  return {
    get lastFindManyArgs() {
      return state.lastFindManyArgs;
    },
    productLinkHealth: {
      async findMany(args) {
        state.lastFindManyArgs = args;
        return records;
      },
    },
  } satisfies ProductLinkHealthReportClient & {
    lastFindManyArgs?: Parameters<ProductLinkHealthReportClient["productLinkHealth"]["findMany"]>[0];
  };
}
