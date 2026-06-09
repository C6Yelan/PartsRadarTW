// apps/crawler/tests/scripts/ops/crawl-coolpc-daemon.test.ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CRAWL_RUN_STATUSES } from "../../../src/coolpc/crawl-run";
import {
  type CoolpcDaemonOptions,
  parseDaemonOptions,
  runImmediateImageBackfill,
} from "../../../src/scripts/ops/crawl-coolpc-daemon";

const tempRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CoolPC scheduled crawler daemon options", () => {
  it("requires explicit live fetch confirmation", () => {
    expect(() => parseDaemonOptions([], {}, "/repo/apps/crawler")).toThrow(
      "Refusing scheduled CoolPC live fetch",
    );
  });

  it("reads safe defaults from env and resolves storage from the workspace root", async () => {
    const { workspaceRoot, crawlerCwd } = await createWorkspace();
    const options = parseDaemonOptions(
      ["--confirm-live-fetch"],
      {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_BACKOFF_SECONDS: "7200",
        CRAWLER_CATEGORY_DELAY_MS: "5000",
        CRAWLER_IMAGE_BACKFILL_LIMIT: "7",
        CRAWLER_IMAGE_BACKFILL_MIN_DELAY_MS: "3000",
        CRAWLER_IMAGE_BACKFILL_MAX_DELAY_MS: "9000",
        CRAWLER_IMAGE_BACKFILL_TIMEOUT_MS: "12000",
        SNAPSHOT_STORAGE_DIR: "storage/snapshots",
        PRODUCT_IMAGE_STORAGE_DIR: "storage/product-images",
        EXTERNAL_FETCH_LOCK_STALE_SECONDS: "21600",
        COOLPC_BASE_URL: "https://www.coolpc.com.tw",
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
      runOnce: false,
      baseUrl: "https://www.coolpc.com.tw",
      imageBackfillLimit: 7,
      imageBackfill: {
        workspaceRoot,
        storageDir: join(workspaceRoot, "storage", "product-images"),
        limit: 7,
        productId: null,
        igrp: null,
        minDelayMs: 3000,
        maxDelayMs: 9000,
        timeoutMs: 12000,
        maxSourceBytes: 5 * 1024 * 1024,
        dryRun: false,
        overwrite: false,
      },
      priceChangeDiscordNotification: {
        publicWebhookUrl: null,
        publicBaseUrl: "https://partsradar.net/",
        maxItems: 50,
      },
    });
  });

  it("rejects command-line base URL overrides", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--base-url", "https://example.test"],
        {},
        crawlerCwd,
      ),
    ).toThrow("does not accept --base-url overrides");
  });

  it("rejects non-CoolPC base URL env values during startup parsing", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch"],
        { COOLPC_BASE_URL: "https://example.test" },
        crawlerCwd,
      ),
    ).toThrow("CoolPC base URL must be https://www.coolpc.com.tw.");
  });

  it("rejects aggressive schedule values", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "30",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "3000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--interval-seconds/CRAWLER_INTERVAL_SECONDS must be at least 60");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "60",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "2000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at least 3000");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--interval-seconds",
          "60",
          "--backoff-seconds",
          "60",
          "--category-delay-ms",
          "60001",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("--category-delay-ms/CRAWLER_CATEGORY_DELAY_MS must be at most 60000");
  });

  it("allows disabling immediate image backfill without disabling the crawler", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseDaemonOptions(
      ["--confirm-live-fetch", "--image-backfill-limit", "0"],
      {},
      crawlerCwd,
    );

    expect(options.imageBackfillLimit).toBe(0);
    expect(options.imageBackfill.limit).toBe(0);
  });

  it("rejects aggressive immediate image backfill settings", async () => {
    const { crawlerCwd } = await createWorkspace();

    expect(() =>
      parseDaemonOptions(
        ["--confirm-live-fetch", "--image-backfill-limit", "51"],
        {},
        crawlerCwd,
      ),
    ).toThrow("--image-backfill-limit/CRAWLER_IMAGE_BACKFILL_LIMIT must be at most 50");

    expect(() =>
      parseDaemonOptions(
        [
          "--confirm-live-fetch",
          "--image-backfill-min-delay-ms",
          "9000",
          "--image-backfill-max-delay-ms",
          "8000",
        ],
        {},
        crawlerCwd,
      ),
    ).toThrow("must be less than or equal to");
  });
});

describe("CoolPC scheduled crawler immediate image backfill", () => {
  it("logs image backfill failures without throwing into the crawler cycle", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      runImmediateImageBackfill({
        client: {
          product: {
            findMany: async () => {
              throw new Error("image storage temporarily unavailable");
            },
          },
        } as never,
        options: createDaemonOptions(),
        shouldBackoff: false,
        status: CRAWL_RUN_STATUSES.SUCCESS_CHANGED,
        stoppedBySuspectedBlock: false,
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed without affecting crawler status"),
    );
  });
});

async function createWorkspace(): Promise<{ workspaceRoot: string; crawlerCwd: string }> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-daemon-options-"));
  const crawlerCwd = join(workspaceRoot, "apps", "crawler");
  tempRoots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");
  await mkdir(crawlerCwd, { recursive: true });

  return { workspaceRoot, crawlerCwd };
}

function createDaemonOptions(overrides: Partial<CoolpcDaemonOptions> = {}): CoolpcDaemonOptions {
  return {
    workspaceRoot: "/workspace",
    storageDir: "/workspace/storage/snapshots",
    intervalSeconds: 1800,
    backoffSeconds: 3600,
    categoryDelayMs: 8000,
    lockDir: "/workspace/storage/snapshots/.locks/external-fetch",
    lockStaleSeconds: 43200,
    runOnce: false,
    baseUrl: "https://www.coolpc.com.tw",
    priceChangeDiscordNotification: {
      publicWebhookUrl: null,
      publicBaseUrl: "https://partsradar.net/",
      maxItems: 50,
    },
    imageBackfillLimit: 20,
    imageBackfill: {
      workspaceRoot: "/workspace",
      storageDir: "/workspace/storage/product-images",
      limit: 20,
      productId: null,
      igrp: null,
      minDelayMs: 3000,
      maxDelayMs: 8000,
      timeoutMs: 15000,
      maxSourceBytes: 5 * 1024 * 1024,
      dryRun: false,
      overwrite: false,
    },
    ...overrides,
  };
}
