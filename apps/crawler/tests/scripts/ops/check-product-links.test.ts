// apps/crawler/tests/scripts/ops/check-product-links.test.ts
// 驗證 product-link-checker 的 CLI option、防呆預設、待檢查連結選取與 health 狀態轉換。

import { afterEach, describe, expect, it } from "vitest";
import {
  parseOptions,
  type ProductLinkCheckerOptions,
} from "../../../src/scripts/ops/product-link-checker/options";
import {
  buildProductPurchaseLinkTargets,
  PRODUCT_LINK_HEALTH_STATUSES,
  PRODUCT_LINK_KINDS,
  readProductPurchaseLinkTargets,
  resolveNextProductLinkHealth,
  type ProductPurchaseLinkTarget,
  type ProductLinkHealthClient,
  type ProductLinkHealthRecord,
  type ProductLinkProductRecord,
} from "../../../src/scripts/ops/product-link-checker/processor";
import { createProductLinkCheckerTestEnvironment } from "./check-product-links-support";

const NOW = new Date("2026-06-02T12:00:00.000Z");
const testEnv = createProductLinkCheckerTestEnvironment();

afterEach(testEnv.cleanup);

describe("product link checker options", () => {
  it("requires explicit live fetch confirmation", () => {
    expect(() => parseOptions([])).toThrow("Refusing live product link checks");
  });

  it("uses safe dry-run defaults", async () => {
    const workspaceRoot = await testEnv.createWorkspace();
    const options = parseOptions(["--dry-run"], workspaceRoot);

    expect(options).toMatchObject({
      workspaceRoot,
      dryRun: true,
      limit: null,
      staleAfterHours: 48,
      minDelayMs: 10000,
      maxDelayMs: 20000,
      timeoutMs: 10000,
      failureThreshold: 3,
      kinds: [PRODUCT_LINK_KINDS.SOURCE],
    });
  });

  it("rejects invalid link kind filters", async () => {
    const workspaceRoot = await testEnv.createWorkspace();

    expect(() => parseOptions(["--dry-run", "--kinds", "source,download"], workspaceRoot)).toThrow(
      "--kinds only supports source",
    );
  });
});

describe("product link checker purchase targets", () => {
  it("selects unchecked, stale, or changed URLs without selecting fresh matching URLs", () => {
    const options = productLinkOptions();
    const purchaseLinkTargets = buildProductPurchaseLinkTargets(
      [
        product({
          ibuyToken: "GPU-NEW",
          linkHealthChecks: [
            health({
              linkKind: PRODUCT_LINK_KINDS.SOURCE,
              url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-OLD",
              checkedAt: new Date("2026-06-02T11:00:00.000Z"),
            }),
          ],
        }),
        product({
          id: "22222222-2222-2222-2222-222222222222",
          ibuyToken: "GPU-FRESH",
          linkHealthChecks: [
            health({
              linkKind: PRODUCT_LINK_KINDS.SOURCE,
              url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-FRESH",
              checkedAt: new Date("2026-06-02T11:30:00.000Z"),
            }),
          ],
        }),
      ],
      options,
      NOW,
    );

    expect(purchaseLinkTargets).toEqual([
      expect.objectContaining({
        linkKind: PRODUCT_LINK_KINDS.SOURCE,
        url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-NEW",
      }),
    ]);
  });

  it("applies link limits after building due purchase link targets", async () => {
    const products = [
      product({
        id: "fresh-product",
        ibuyToken: "GPU-FRESH",
        linkHealthChecks: [
          health({
            url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-FRESH",
            checkedAt: new Date("2026-06-02T11:30:00.000Z"),
          }),
        ],
      }),
      product({
        id: "due-product",
        ibuyToken: "GPU-DUE",
        linkHealthChecks: [
          health({
            url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-DUE",
            checkedAt: new Date("2026-05-30T11:30:00.000Z"),
          }),
        ],
      }),
    ];
    const client = fakeProductLinkHealthClient(products);
    const purchaseLinkTargets = await readProductPurchaseLinkTargets(
      client,
      { ...productLinkOptions(), limit: 1 },
      NOW,
    );

    expect(client.lastFindManyArgs?.take).toBeUndefined();
    expect(purchaseLinkTargets).toEqual([
      expect.objectContaining({
        productId: "due-product",
        url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-DUE",
      }),
    ]);
  });
});

describe("product link checker health resolution", () => {
  it("keeps early 404 failures temporary until the failure threshold is reached", () => {
    const checkedAt = new Date("2026-06-02T12:30:00.000Z");
    const target = purchaseLinkTarget({
      existingHealth: health({
        failureCount: 0,
        status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
      }),
    });

    expect(
      resolveNextProductLinkHealth(
        target,
        { status: "broken", httpStatus: 404, errorMessage: "HTTP 404" },
        checkedAt,
        { failureThreshold: 3 },
      ),
    ).toMatchObject({
      status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
      httpStatus: 404,
      checkedAt,
      lastFailureAt: checkedAt,
      failureCount: 1,
    });
  });

  it("marks repeated 404 failures as broken at the threshold", () => {
    const checkedAt = new Date("2026-06-02T12:30:00.000Z");
    const target = purchaseLinkTarget({
      existingHealth: health({
        failureCount: 2,
        status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
      }),
    });

    expect(
      resolveNextProductLinkHealth(
        target,
        { status: "broken", httpStatus: 404, errorMessage: "HTTP 404" },
        checkedAt,
        { failureThreshold: 3 },
      ),
    ).toMatchObject({
      status: PRODUCT_LINK_HEALTH_STATUSES.BROKEN,
      httpStatus: 404,
      checkedAt,
      lastFailureAt: checkedAt,
      failureCount: 3,
    });
  });

  it("resets consecutive failures after a successful check", () => {
    const checkedAt = new Date("2026-06-02T12:30:00.000Z");
    const target = purchaseLinkTarget({
      existingHealth: health({
        failureCount: 2,
        lastFailureAt: new Date("2026-06-02T11:30:00.000Z"),
        status: PRODUCT_LINK_HEALTH_STATUSES.TEMPORARY_ERROR,
      }),
    });

    expect(
      resolveNextProductLinkHealth(
        target,
        { status: "ok", httpStatus: 200, errorMessage: null },
        checkedAt,
        { failureThreshold: 3 },
      ),
    ).toMatchObject({
      status: PRODUCT_LINK_HEALTH_STATUSES.OK,
      httpStatus: 200,
      checkedAt,
      lastOkAt: checkedAt,
      failureCount: 0,
      errorMessage: null,
    });
  });
});

function product(overrides: Partial<ProductLinkProductRecord> = {}): ProductLinkProductRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "GPU RTX 4070",
    ibuyToken: "GPU-RTX-4070",
    sourceCategory: {
      igrp: 12,
      displayName: "顯示卡",
    },
    linkHealthChecks: [],
    ...overrides,
  };
}

function health(overrides: Partial<ProductLinkHealthRecord> = {}): ProductLinkHealthRecord {
  return {
    linkKind: PRODUCT_LINK_KINDS.SOURCE,
    url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    status: PRODUCT_LINK_HEALTH_STATUSES.OK,
    httpStatus: 200,
    checkedAt: new Date("2026-06-02T11:00:00.000Z"),
    lastOkAt: new Date("2026-06-02T11:00:00.000Z"),
    lastFailureAt: null,
    failureCount: 0,
    ...overrides,
  };
}

function purchaseLinkTarget(
  overrides: Partial<ProductPurchaseLinkTarget> = {},
): ProductPurchaseLinkTarget {
  return {
    productId: "11111111-1111-1111-1111-111111111111",
    productName: "GPU RTX 4070",
    categoryLabel: "顯示卡 IGrp=12",
    linkKind: PRODUCT_LINK_KINDS.SOURCE,
    url: "https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    existingHealth: null,
    ...overrides,
  };
}

function productLinkOptions(): ProductLinkCheckerOptions {
  return {
    workspaceRoot: "/repo",
    dryRun: true,
    limit: null,
    igrp: null,
    staleAfterHours: 48,
    minDelayMs: 10000,
    maxDelayMs: 20000,
    timeoutMs: 10000,
    failureThreshold: 3,
    kinds: [PRODUCT_LINK_KINDS.SOURCE],
  };
}

function fakeProductLinkHealthClient(products: ProductLinkProductRecord[]) {
  const state = {
    lastFindManyArgs: undefined as
      | Parameters<ProductLinkHealthClient["product"]["findMany"]>[0]
      | undefined,
  };

  return {
    get lastFindManyArgs() {
      return state.lastFindManyArgs;
    },
    product: {
      async findMany(args) {
        state.lastFindManyArgs = args;
        return products;
      },
    },
    productLinkHealth: {
      async upsert() {
        return { id: "link-health-1" };
      },
    },
  } satisfies ProductLinkHealthClient & {
    lastFindManyArgs?: Parameters<ProductLinkHealthClient["product"]["findMany"]>[0];
  };
}
