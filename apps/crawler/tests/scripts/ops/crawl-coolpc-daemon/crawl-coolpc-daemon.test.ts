// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon/crawl-coolpc-daemon.test.ts
// 驗證 scheduled CoolPC crawler daemon 的 live fetch 確認、env/default 解析與排程防呆。

import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseDaemonOptions } from "../../../../src/scripts/ops/crawl-coolpc-daemon/options";
import { createDaemonTestEnvironment } from "./crawl-coolpc-daemon-support";

describe("CoolPC scheduled crawler daemon options", () => {
  const testEnv = createDaemonTestEnvironment();

  afterEach(testEnv.cleanup);

  it("requires explicit live fetch confirmation", () => {
    expect(() => parseDaemonOptions([], {}, "/repo/apps/crawler")).toThrow(
      "Refusing scheduled CoolPC live fetch",
    );
  });

  it("retains the one-shot CLI control", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(parseDaemonOptions(["--confirm-live-fetch", "--run-once"], {}, crawlerCwd).runOnce).toBe(
      true,
    );
  });

  it("rejects command-line source overrides", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--base-url", "https://example.test"],
        {},
        crawlerCwd,
      ),
    ).toThrow("does not accept --base-url overrides");
  });

  it.each([
    ["--interval-seconds", "CRAWLER_INTERVAL_SECONDS"],
    ["--backoff-seconds", "CRAWLER_BACKOFF_SECONDS"],
    ["--category-delay-ms", "CRAWLER_CATEGORY_DELAY_MS"],
    ["--lock-retry-seconds", "CRAWLER_LOCK_RETRY_SECONDS"],
    ["--new-product-image-min-delay-ms", "CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS"],
    ["--new-product-image-max-delay-ms", "CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS"],
    ["--new-product-image-timeout-ms", "CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS"],
    ["--new-product-image-max-source-bytes", "CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES"],
    ["--product-image-storage-dir", "PRODUCT_IMAGE_STORAGE_DIR"],
    ["--lock-dir", "EXTERNAL_FETCH_LOCK_DIR"],
    ["--lock-stale-seconds", "EXTERNAL_FETCH_LOCK_STALE_SECONDS"],
  ])("rejects env-only daemon option %s", async (flag, envName) => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() => parseDaemonOptions(["--confirm-live-fetch", flag, "1"], {}, crawlerCwd)).toThrow(
      `${flag} is environment-only. Configure ${envName} instead.`,
    );
  });

  it("reads safe defaults from env and resolves storage from the workspace root", async () => {
    const { workspaceRoot, crawlerCwd } = await testEnv.createWorkspace();
    const options = parseDaemonOptions(
      ["--confirm-live-fetch"],
      {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_BACKOFF_SECONDS: "7200",
        CRAWLER_LOCK_RETRY_SECONDS: "90",
        CRAWLER_CATEGORY_DELAY_MS: "5000",
        CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "6000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "9000",
        CRAWLER_NEW_PRODUCT_IMAGE_TIMEOUT_MS: "18000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_SOURCE_BYTES: "4194304",
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
        PRODUCT_IMAGE_STORAGE_DIR: "storage/product-images",
        EXTERNAL_FETCH_LOCK_STALE_SECONDS: "21600",
      },
      crawlerCwd,
    );

    expect(options).toEqual({
      workspaceRoot,
      storageDir: join(workspaceRoot, "storage", "snapshots"),
      intervalSeconds: 600,
      backoffSeconds: 7200,
      categoryDelayMs: 5000,
      lockDir: join(workspaceRoot, "storage", "snapshots", ".locks", "external-fetch"),
      lockStaleSeconds: 21600,
      lockRetrySeconds: 90,
      runOnce: false,
      newProductImageBackfill: {
        workspaceRoot,
        storageDir: join(workspaceRoot, "storage", "product-images"),
        minDelayMs: 6000,
        maxDelayMs: 9000,
        timeoutMs: 18000,
        maxSourceBytes: 4194304,
        externalFetchLockDir: join(
          workspaceRoot,
          "storage",
          "snapshots",
          ".locks",
          "external-fetch",
        ),
        externalFetchLockStaleSeconds: 21600,
      },
    });
  });

  it("rejects snapshot storage paths outside the configured or built-in roots", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--storage-dir", "temp/unrelated-snapshots"],
        {},
        crawlerCwd,
      ),
    ).toThrow("not within an allowlisted snapshot storage root");
  });

  it("rejects aggressive schedule values", async () => {
    const { crawlerCwd } = await testEnv.createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        {
          CRAWLER_INTERVAL_SECONDS: "30",
          CRAWLER_BACKOFF_SECONDS: "60",
          CRAWLER_CATEGORY_DELAY_MS: "3000",
        },
        crawlerCwd,
      ),
    ).toThrow("CRAWLER_INTERVAL_SECONDS must be at least 60");

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        {
          CRAWLER_INTERVAL_SECONDS: "60",
          CRAWLER_BACKOFF_SECONDS: "60",
          CRAWLER_CATEGORY_DELAY_MS: "2000",
        },
        crawlerCwd,
      ),
    ).toThrow("CRAWLER_CATEGORY_DELAY_MS must be at least 3000");

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        {
          CRAWLER_INTERVAL_SECONDS: "60",
          CRAWLER_BACKOFF_SECONDS: "60",
          CRAWLER_CATEGORY_DELAY_MS: "60001",
        },
        crawlerCwd,
      ),
    ).toThrow("CRAWLER_CATEGORY_DELAY_MS must be at most 60000");

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        { EXTERNAL_FETCH_LOCK_STALE_SECONDS: "1799" },
        crawlerCwd,
      ),
    ).toThrow("EXTERNAL_FETCH_LOCK_STALE_SECONDS must be at least 1800");

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        {
          CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "12000",
          CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "5000",
        },
        crawlerCwd,
      ),
    ).toThrow("CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS must be less than or equal to");
  });
});
