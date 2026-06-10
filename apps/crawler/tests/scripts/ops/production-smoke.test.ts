// apps/crawler/tests/scripts/ops/production-smoke.test.ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionPublicSmoke,
  runProductionSmoke,
} from "../../../src/scripts/ops/production-smoke";
import {
  parseProductionSmokeDaemonOptions,
  runProductionSmokeDaemon,
} from "../../../src/scripts/ops/production-smoke-daemon";
import { readSmokeDiscordNotificationState } from "../../../src/scripts/ops/smoke-discord-notification";

const DISCORD_ADMIN_WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";
type SendDiscordWebhook = NonNullable<
  Parameters<typeof runProductionSmokeDaemon>[0]["sendDiscordWebhook"]
>;

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
      timeoutMs: 5000,
      productImageSampleSize: 5,
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
      sourceBrokenLinkWarnCount: 1,
      sourceBrokenLinkFailCount: 50,
      sourceTemporaryLinkWarnCount: 100,
      sourceTemporaryLinkFailCount: 500,
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
        "--missing-image-warn-count",
        "10",
      ],
      {
        SMOKE_TIMEOUT_MS: "9000",
        SMOKE_PRODUCT_IMAGE_STORAGE_DIR: "ignored",
        PRODUCT_IMAGE_STORAGE_DIR: "custom-images",
        SMOKE_CRAWLER_FAIL_AFTER_MINUTES: "240",
        SMOKE_INVALID_IMAGE_URL_WARN_COUNT: "3000",
        SMOKE_TEMPORARY_LINK_WARN_COUNT: "77",
        SMOKE_SOURCE_TEMPORARY_LINK_FAIL_COUNT: "123",
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
    expect(options.invalidImageUrlWarnCount).toBe(3000);
    expect(options.sourceTemporaryLinkWarnCount).toBe(77);
    expect(options.sourceTemporaryLinkFailCount).toBe(123);
    expect(options.productImageStorageDir).toBe(join(workspaceRoot, "custom-images"));
  });

  it("accepts a CLI source image anomaly threshold override", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseProductionSmokeOptions(
      ["--invalid-image-url-warn-count", "1500"],
      {
        SMOKE_INVALID_IMAGE_URL_WARN_COUNT: "3000",
      },
      crawlerCwd,
    );

    expect(options.invalidImageUrlWarnCount).toBe(1500);
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

describe("production smoke daemon options", () => {
  it("adds daemon interval and run-once options", async () => {
    const { crawlerCwd } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--interval-seconds", "600", "--initial-delay-seconds", "0"],
      {},
      crawlerCwd,
    );

    expect(options.runOnce).toBe(true);
    expect(options.intervalSeconds).toBe(600);
    expect(options.initialDelaySeconds).toBe(0);
  });

  it("adds smoke Discord notification options", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeDaemonOptions(
      [
        "--run-once",
        "--smoke-discord-state-file",
        "custom/smoke-state.json",
        "--smoke-discord-cooldown-seconds",
        "120",
      ],
      {
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: "ignored/state.json",
        SMOKE_DISCORD_COOLDOWN_SECONDS: "999",
      },
      crawlerCwd,
    );

    expect(options.smokeDiscordNotification).toEqual({
      adminWebhookUrl: DISCORD_ADMIN_WEBHOOK_URL,
      stateFilePath: join(workspaceRoot, "custom", "smoke-state.json"),
      cooldownSeconds: 120,
    });
  });
});

describe("production smoke daemon Discord notifications", () => {
  it("sends a WARN notification and writes state after a smoke summary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const logMessage = vi.fn();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage,
      sendDiscordWebhook,
    });

    expect(sendDiscordWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookUrl: DISCORD_ADMIN_WEBHOOK_URL,
        message: expect.objectContaining({
          content: expect.stringContaining("PartsRadarTW smoke WARN"),
        }),
      }),
    );
    const webhookCall = sendDiscordWebhook.mock.calls[0]?.[0];
    if (!webhookCall) {
      throw new Error("Expected Discord webhook sender call.");
    }
    expect(webhookCall.message.content).toContain("Affected checks: WARN rate limit headers");
    expect(logMessage).toHaveBeenCalledWith(
      "Smoke Discord notification sent. kind=WARN httpStatus=204",
    );
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toMatchObject({
      lastObservedStatus: "WARN",
      lastNotificationKind: "WARN",
      lastNotificationKey: "WARN:WARN:rate limit headers",
    });
  });

  it("does not send or write state when the admin webhook is not configured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () => ({ status: "sent", httpStatus: 204 }) as const,
    );
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage: vi.fn(),
      sendDiscordWebhook,
    });

    expect(sendDiscordWebhook).not.toHaveBeenCalled();
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toBeNull();
  });

  it("logs Discord send failures without writing notification state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00.000Z"));
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    const stateFilePath = join(workspaceRoot, "storage", "ops", "smoke-discord-state.json");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const sendDiscordWebhook = vi.fn<SendDiscordWebhook>(
      async () =>
        ({
          status: "failed",
          httpStatus: 500,
          message: "Discord webhook returned HTTP 500.",
        }) as const,
    );
    const logMessage = vi.fn();
    const options = parseProductionSmokeDaemonOptions(
      ["--run-once", "--initial-delay-seconds", "0", "--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        DISCORD_ADMIN_WEBHOOK_URL,
        SMOKE_DISCORD_STATE_FILE: stateFilePath,
      },
      crawlerCwd,
    );

    await runProductionSmokeDaemon({
      client: createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }) as unknown as Parameters<typeof runProductionSmokeDaemon>[0]["client"],
      options,
      shutdown: idleShutdown(),
      logMessage,
      sendDiscordWebhook,
    });

    expect(logMessage).toHaveBeenCalledWith(
      "Smoke Discord notification failed. httpStatus=500 message=Discord webhook returned HTTP 500.",
    );
    await expect(readSmokeDiscordNotificationState(stateFilePath)).resolves.toBeNull();
  });
});

describe("production smoke checks", () => {
  it("runs public-only checks without a DB client", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ productCount: 2 });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("OK");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "build-list page",
          status: "OK",
          message: "HTTP 200",
        }),
        expect.objectContaining({
          name: "v2 categories api",
          status: "OK",
          message: "required IGrp=8,11,16",
        }),
        expect.objectContaining({
          name: "price movement sort price_drop_desc",
          status: "OK",
          message: "rangeDays=30",
        }),
        expect.objectContaining({
          name: "price movement sort price_rise_desc",
          status: "OK",
          message: "rangeDays=30",
        }),
        expect.objectContaining({
          name: "product image api",
          status: "OK",
          message: "checked=2 skippedMissingImage=0",
        }),
        expect.objectContaining({
          name: "source freshness",
          status: "OK",
          message: "lastSuccessAt=10m ago status=ok",
        }),
      ]),
    );
    expect(summary.checks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "crawler freshness",
        }),
      ]),
    );
  });

  it("skips public product image checks for list items without image metadata", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({
      nullImageProductIds: new Set(["product-2"]),
      productCount: 2,
    });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("OK");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "product image api",
          status: "OK",
          message: "checked=1 skippedMissingImage=1",
        }),
      ]),
    );
  });

  it("fails public-only checks when a v2 route is missing", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ buildListStatus: 404 });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "build-list page",
          status: "FAIL",
          message: "HTTP 404",
        }),
      ]),
    );
  });

  it("fails public-only checks when the v2 category expansion is missing", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ categoryIgrps: [4, 5, 6, 7, 10, 12, 14, 15] });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "v2 categories api",
          status: "FAIL",
          message: "missing IGrp=8,11,16",
        }),
      ]),
    );
  });

  it("fails public-only checks when price movement sort omits v2 movement data", async () => {
    const { crawlerCwd } = await createWorkspace();
    stubHealthyPublicApi({ includePriceMovement: false });
    const options = parseProductionSmokeOptions(["--public-only"], {}, crawlerCwd);
    const summary = await runProductionPublicSmoke(options, new Date("2026-06-02T12:00:00.000Z"));

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "price movement sort price_drop_desc",
          status: "FAIL",
          message: "missing 30-day priceMovement data",
        }),
        expect.objectContaining({
          name: "price movement sort price_rise_desc",
          status: "FAIL",
          message: "missing 30-day priceMovement data",
        }),
      ]),
    );
  });

  it("keeps invalid image URL issues informational below the anomaly threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      ["--parse-error-fail-count", "1"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 624,
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("OK");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recent parse errors",
          status: "OK",
          message: "0 parse error(s) in 24h",
        }),
        expect.objectContaining({
          name: "source image anomalies",
          status: "OK",
          message:
            "624 rows / 16 distinct products / 5 distinct raw image urls in 24h, warnAfter=2000",
        }),
        expect.objectContaining({
          name: "rate limit headers",
          status: "OK",
          message: "clientSource=cf limit=360 remaining=359",
        }),
        expect.objectContaining({
          name: "build-list page",
          status: "OK",
          message: "HTTP 200",
        }),
        expect.objectContaining({
          name: "v2 categories api",
          status: "OK",
          message: "required IGrp=8,11,16",
        }),
        expect.objectContaining({
          name: "price movement sort price_drop_desc",
          status: "OK",
          message: "rangeDays=30",
        }),
        expect.objectContaining({
          name: "price movement sort price_rise_desc",
          status: "OK",
          message: "rangeDays=30",
        }),
        expect.objectContaining({
          name: "product image api",
          status: "OK",
          message: "checked=1 skippedMissingImage=0",
        }),
      ]),
    );
  });

  it("fails when the v2 build list route is not deployed", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ buildListStatus: 404 });
    const options = parseProductionSmokeOptions(
      [],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "build-list page",
          status: "FAIL",
          message: "HTTP 404",
        }),
      ]),
    );
  });

  it("warns when public HTTPS smoke cannot observe a forwarded client identity", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({ rateLimitClientSource: "unknown" });
    const options = parseProductionSmokeOptions(
      ["--base-url", "https://partsradar.net"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "rate limit headers",
          status: "WARN",
          message:
            "clientSource=unknown limit=360 remaining=359; public HTTPS smoke should expose client identity",
        }),
      ]),
    );
  });

  it("fails when a sampled product image API is unavailable", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi({
      imageStatusByProductId: new Map([["product-2", 404]]),
      productCount: 3,
    });
    const options = parseProductionSmokeOptions(
      [],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "product image api",
          status: "FAIL",
          message: "checked=3 skippedMissingImage=0 failed=1 firstFailure=product-2: HTTP 404",
        }),
      ]),
    );
  });

  it("warns when invalid image URL issues exceed the anomaly threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      ["--invalid-image-url-warn-count", "2000"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 2001,
        trueParseErrorCount: 0,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recent parse errors",
          status: "OK",
          message: "0 parse error(s) in 24h",
        }),
        expect.objectContaining({
          name: "source image anomalies",
          status: "WARN",
          message:
            "2001 rows / 16 distinct products / 5 distinct raw image urls in 24h, warnAfter=2000",
        }),
      ]),
    );
  });

  it("warns when source temporary link errors exceed the source threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      [],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
        SMOKE_TEMPORARY_LINK_WARN_COUNT: "100",
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 0,
        linkHealthCounts: {
          sourceTemporary: 101,
        },
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("WARN");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "link health",
          status: "WARN",
          message: "source broken=0 temporary=101",
        }),
      ]),
    );
  });

  it("still fails when true parse errors exceed the configured threshold", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const imageDir = join(workspaceRoot, "product-images");
    await mkdir(imageDir);
    await writeFile(join(imageDir, "product-1.webp"), "webp");
    stubHealthyPublicApi();
    const options = parseProductionSmokeOptions(
      ["--parse-error-fail-count", "1"],
      {
        PRODUCT_IMAGE_STORAGE_DIR: imageDir,
      },
      crawlerCwd,
    );
    const summary = await runProductionSmoke(
      createSmokeClient({
        invalidImageErrorCount: 0,
        trueParseErrorCount: 2,
      }),
      options,
      new Date("2026-06-02T12:00:00.000Z"),
    );

    expect(summary.status).toBe("FAIL");
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "recent parse errors",
          status: "FAIL",
          message: "2 parse error(s) in 24h",
        }),
        expect.objectContaining({
          name: "source image anomalies",
          status: "OK",
          message:
            "0 rows / 0 distinct products / 0 distinct raw image urls in 24h, warnAfter=2000",
        }),
      ]),
    );
  });
});

async function createWorkspace(): Promise<{
  workspaceRoot: string;
  crawlerCwd: string;
}> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "partsradar-smoke-options-"));
  await writeFile(join(workspaceRoot, "pnpm-workspace.yaml"), "packages: []\n");

  return {
    workspaceRoot,
    crawlerCwd: join(workspaceRoot, "apps", "crawler"),
  };
}

function stubHealthyPublicApi({
  buildListStatus = 200,
  categoryIgrps = [4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16],
  includePriceMovement = true,
  imageStatus = 200,
  imageStatusByProductId = new Map<string, number>(),
  nullImageProductIds = new Set<string>(),
  productCount = 1,
  rateLimitClientSource = "cf",
}: {
  buildListStatus?: number;
  categoryIgrps?: number[];
  includePriceMovement?: boolean;
  imageStatus?: number;
  imageStatusByProductId?: Map<string, number>;
  nullImageProductIds?: Set<string>;
  productCount?: number;
  rateLimitClientSource?: string;
} = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));

      if (url.pathname === "/") {
        return new Response("<!doctype html>", { status: 200 });
      }

      if (url.pathname === "/build-list") {
        return new Response("<!doctype html>", { status: buildListStatus });
      }

      if (url.pathname === "/api/source-status") {
        return Response.json({
          status: "ok",
          lastSuccessAt: "2026-06-02T11:50:00.000Z",
        });
      }

      if (url.pathname === "/api/categories") {
        return Response.json({
          data: categoryIgrps.map((igrp) => ({ igrp })),
        });
      }

      if (url.pathname === "/api/products") {
        return Response.json(
          {
            data: Array.from({ length: productCount }, (_, index) => {
              const id = `product-${index + 1}`;

              return {
                id,
                image: nullImageProductIds.has(id)
                  ? null
                  : {
                      url: `/api/product-images/${id}.webp`,
                    },
                ...(includePriceMovement
                  ? {
                      priceMovement: {
                        rangeDays: 30,
                        deltaAmount: null,
                        deltaPercent: null,
                      },
                    }
                  : {}),
              };
            }),
            pagination: { totalItems: 1 },
          },
          {
            headers: {
              "X-RateLimit-Client-Source": rateLimitClientSource,
              "X-RateLimit-Limit": "360",
              "X-RateLimit-Remaining": "359",
              "X-RateLimit-Reset": "1780411200",
            },
          },
        );
      }

      if (url.pathname === "/api/products/product-1") {
        return Response.json({ id: "product-1" });
      }

      const productImageMatch = url.pathname.match(/^\/api\/product-images\/(product-\d+)\.webp$/);

      if (productImageMatch) {
        const status = imageStatusByProductId.get(productImageMatch[1]) ?? imageStatus;

        return new Response(status === 200 ? "webp" : "not found", {
          status,
          headers: status === 200 ? { "content-type": "image/webp" } : undefined,
        });
      }

      if (url.pathname === "/api/products/product-1/price-history") {
        return Response.json({ points: [] });
      }

      return new Response("not found", { status: 404 });
    }),
  );
}

function createSmokeClient({
  invalidImageErrorCount,
  trueParseErrorCount,
  linkHealthCounts = {},
}: {
  invalidImageErrorCount: number;
  trueParseErrorCount: number;
	  linkHealthCounts?: {
	    sourceBroken?: number;
	    sourceTemporary?: number;
	  };
	}) {
  return {
    crawlRun: {
      findFirst: async ({ where }: { where: { status?: { in?: string[] } } }) =>
        where.status?.in
          ? {
              id: "crawl-run-success",
              status: "SUCCESS_UNCHANGED",
              finishedAt: new Date("2026-06-02T11:45:00.000Z"),
            }
          : {
              id: "crawl-run-latest",
              status: "SUCCESS_UNCHANGED",
              startedAt: new Date("2026-06-02T11:45:00.000Z"),
              finishedAt: new Date("2026-06-02T11:45:00.000Z"),
            },
      count: async () => 0,
    },
    parseError: {
      count: async ({
        where,
      }: {
        where: { errorType?: "INVALID_IMAGE_URL" | { not: "INVALID_IMAGE_URL" } };
      }) => {
        if (where.errorType === "INVALID_IMAGE_URL") {
          return invalidImageErrorCount;
        }

        return trueParseErrorCount;
      },
      findMany: async ({
        where,
      }: {
        where: { errorType?: "INVALID_IMAGE_URL" | { not: "INVALID_IMAGE_URL" } };
      }) => {
        if (where.errorType !== "INVALID_IMAGE_URL") {
          return [];
        }

        return Array.from({ length: invalidImageErrorCount }, (_, index) => ({
          rawToken: `TOKEN-${(index % 16) + 1}`,
          rawName: `Invalid image product ${(index % 16) + 1}`,
          rawImageUrl: `/eval/${(index % 5) + 1}/`,
        }));
      },
    },
    product: {
      count: async () => 1,
      findMany: async () => [{ id: "product-1" }],
    },
    productLinkHealth: {
      count: async ({
        where,
      }: {
        where: { linkKind?: string; status?: "BROKEN" | "TEMPORARY_ERROR" };
      }) => {
        if (where.linkKind === "SOURCE" && where.status === "BROKEN") {
          return linkHealthCounts.sourceBroken ?? 0;
        }
        if (where.linkKind === "SOURCE" && where.status === "TEMPORARY_ERROR") {
          return linkHealthCounts.sourceTemporary ?? 0;
        }
        return 0;
      },
    },
    rawSnapshot: {
      count: async () => 0,
    },
  } as unknown as Parameters<typeof runProductionSmoke>[0];
}

function idleShutdown() {
  return {
    requested: false,
    sleep: async () => {},
  };
}
