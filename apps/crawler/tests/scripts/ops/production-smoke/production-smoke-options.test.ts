// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-options.test.ts
// 驗證 production smoke CLI/env options、門檻 override、URL/整數防呆與摘要輸出格式。

import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  printProductionSmokeSummary,
} from "../../../../src/scripts/ops/production-smoke";
import { createWorkspace } from "./production-smoke-support";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("production smoke options", () => {
  it("uses conservative defaults", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeOptions([], {}, crawlerCwd);

    expect(options).toMatchObject({
      workspaceRoot,
      baseUrl: "http://127.0.0.1:3000/",
      publicOnly: false,
      filterSyncStateFilePath: null,
      timeoutMs: 5000,
      productImageSampleSize: 5,
      imageInactiveRetentionDays: 30,
      sourceWarnAfterMinutes: 60,
      sourceFailAfterMinutes: 120,
      crawlerWarnAfterMinutes: 90,
      crawlerFailAfterMinutes: 180,
      recentWindowHours: 24,
      parseErrorWarnCount: 20,
      parseErrorFailCount: 100,
      invalidImageUrlWarnCount: 2000,
      minActiveProducts: 1,
      missingImageWarnCount: 200,
      missingImageFailCount: 500,
    });
    expect(options.productImageStorageDir).toBe(join(workspaceRoot, "storage", "product-images"));
  });

  it("accepts env and CLI overrides", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeOptions(
      [
        "--base-url",
        "https://partsradar.net",
        "--timeout-ms",
        "7000",
        "--product-image-sample-size",
        "7",
        "--public-only",
        "--source-warn-after-minutes",
        "45",
        "--invalid-image-url-warn-count",
        "1500",
        "--missing-image-warn-count",
        "10",
        "--image-inactive-retention-days",
        "45",
        "--filter-sync-state-file",
        "storage/filter-sync.json",
      ],
      {
        SMOKE_TIMEOUT_MS: "9000",
        SMOKE_PRODUCT_IMAGE_STORAGE_DIR: "ignored",
        PRODUCT_IMAGE_STORAGE_DIR: "custom-images",
        SMOKE_CRAWLER_FAIL_AFTER_MINUTES: "240",
        SMOKE_INVALID_IMAGE_URL_WARN_COUNT: "3000",
      },
      crawlerCwd,
    );

    expect(options.baseUrl).toBe("https://partsradar.net/");
    expect(options.publicOnly).toBe(true);
    expect(options.timeoutMs).toBe(7000);
    expect(options.productImageSampleSize).toBe(7);
    expect(options.sourceWarnAfterMinutes).toBe(45);
    expect(options.crawlerFailAfterMinutes).toBe(240);
    expect(options.missingImageWarnCount).toBe(10);
    expect(options.imageInactiveRetentionDays).toBe(45);
    expect(options.invalidImageUrlWarnCount).toBe(1500);
    expect(options.productImageStorageDir).toBe(join(workspaceRoot, "custom-images"));
    expect(options.filterSyncStateFilePath).toBe(
      join(workspaceRoot, "storage", "filter-sync.json"),
    );
  });

  it("rejects invalid URLs and invalid integer ranges", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() => parseProductionSmokeOptions(["--base-url", "not a url"], {}, crawlerCwd)).toThrow(
      "must be a valid HTTP(S) URL",
    );
    expect(() => parseProductionSmokeOptions(["--timeout-ms", "999"], {}, crawlerCwd)).toThrow(
      "--timeout-ms/SMOKE_TIMEOUT_MS must be an integer",
    );
  });
});

describe("production smoke summary output", () => {
  it("prints compact OK counts and keeps WARN/FAIL details", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    printProductionSmokeSummary({
      checkedAt: new Date("2026-06-06T16:00:00.000Z"),
      status: "FAIL",
      checks: [
        { name: "homepage", status: "OK", message: "HTTP 200" },
        { name: "source freshness", status: "WARN", message: "last success is old" },
        { name: "product image api", status: "FAIL", message: "sample failed" },
      ],
    });

    const lines = log.mock.calls.map(([line]) => line);
    log.mockRestore();

    expect(lines).toContain("Checks: ok=1 warn=1 fail=1");
    expect(lines).toContain("Checked at (Asia/Taipei): 2026-06-07 00:00:00");
    expect(lines).toContain("Checked at (UTC): 2026-06-06T16:00:00.000Z");
    expect(lines).toContain("[WARN] source freshness: last success is old");
    expect(lines).toContain("[FAIL] product image api: sample failed");
    expect(lines).not.toContain("[OK] homepage: HTTP 200");
  });
});
