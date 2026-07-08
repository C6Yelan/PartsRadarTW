// apps/crawler/tests/scripts/ops/check-product-links-logging.test.ts
// 驗證 product-link-checker 將 dry-run 與 live check 細節分流到合適的 info/debug log。

import { describe, expect, it } from "vitest";
import type { ProductLinkCheckerOptions } from "../../../src/scripts/ops/product-link-checker/options";
import {
  checkProductLinks,
  PRODUCT_LINK_KINDS,
  type ProductPurchaseLinkTarget,
  type ProductLinkHealthClient,
} from "../../../src/scripts/ops/product-link-checker/processor";

const NOW = new Date("2026-06-02T12:00:00.000Z");

describe("product link checker log levels", () => {
  it("keeps dry-run candidate details behind debug logging", async () => {
    const infoLines: string[] = [];
    const debugLines: string[] = [];

    await checkProductLinks(
      fakeProductLinkHealthClient(),
      [purchaseLinkTarget()],
      productLinkOptions(),
      {
        log: (message) => infoLines.push(message),
        debugLog: (message) => debugLines.push(message),
      },
    );

    expect(infoLines).toEqual([
      "Selected 1 product purchase link target(s).",
      "Mode: dry run; no external requests will be sent.",
      "",
    ]);
    expect(debugLines).toEqual([
      "[dry-run] source | 11111111-1111-1111-1111-111111111111 | 顯示卡 IGrp=12 | GPU RTX 4070 | https://www.coolpc.com.tw/evaluate.php?iBuy=GPU-RTX-4070",
    ]);
  });

  it("logs successful live checks as debug and unhealthy checks as info", async () => {
    const infoLines: string[] = [];
    const debugLines: string[] = [];
    const options = { ...productLinkOptions(), dryRun: false };

    await checkProductLinks(fakeProductLinkHealthClient(), [purchaseLinkTarget()], options, {
      fetchLink: async () => ({ status: "ok", httpStatus: 200, errorMessage: null }),
      log: (message) => infoLines.push(message),
      debugLog: (message) => debugLines.push(message),
      now: () => NOW,
    });
    await checkProductLinks(fakeProductLinkHealthClient(), [purchaseLinkTarget()], options, {
      fetchLink: async () => ({
        status: "temporary_error",
        httpStatus: null,
        errorMessage: "request timed out",
      }),
      log: (message) => infoLines.push(message),
      debugLog: (message) => debugLines.push(message),
      now: () => NOW,
    });

    expect(debugLines).toContain(
      "[OK HTTP 200] source | 11111111-1111-1111-1111-111111111111 | 顯示卡 IGrp=12 | GPU RTX 4070",
    );
    expect(infoLines).toContain(
      "[TEMPORARY_ERROR] source | 11111111-1111-1111-1111-111111111111 | 顯示卡 IGrp=12 | GPU RTX 4070",
    );
  });
});

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

function fakeProductLinkHealthClient(): ProductLinkHealthClient {
  return {
    product: {
      async findMany() {
        return [];
      },
    },
    productLinkHealth: {
      async upsert() {
        return { id: "link-health-1" };
      },
    },
  };
}
