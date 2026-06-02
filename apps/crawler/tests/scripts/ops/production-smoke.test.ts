// apps/crawler/tests/scripts/ops/production-smoke.test.ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProductionSmokeOptions,
  runProductionSmoke,
} from "../../../src/scripts/ops/production-smoke";
import { parseProductionSmokeDaemonOptions } from "../../../src/scripts/ops/production-smoke-daemon";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("production smoke options", () => {
  it("uses conservative defaults", async () => {
    const { crawlerCwd, workspaceRoot } = await createWorkspace();
    const options = parseProductionSmokeOptions([], {}, crawlerCwd);

    expect(options).toMatchObject({
      workspaceRoot,
      baseUrl: "http://127.0.0.1:3000/",
      timeoutMs: 5000,
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
      brokenLinkWarnCount: 1,
      brokenLinkFailCount: 50,
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
      },
      crawlerCwd,
    );

    expect(options.baseUrl).toBe("https://partsradar.net/");
    expect(options.timeoutMs).toBe(7000);
    expect(options.sourceWarnAfterMinutes).toBe(45);
    expect(options.crawlerFailAfterMinutes).toBe(240);
    expect(options.missingImageWarnCount).toBe(10);
    expect(options.invalidImageUrlWarnCount).toBe(3000);
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
    expect(() =>
      parseProductionSmokeOptions(["--timeout-ms", "999"], {}, crawlerCwd),
    ).toThrow("--timeout-ms/SMOKE_TIMEOUT_MS must be an integer");
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
});

describe("production smoke checks", () => {
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
          message: "624 invalid image URL issue(s) in 24h, warnAfter=2000",
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
          message: "2001 invalid image URL issue(s) in 24h, warnAfter=2000",
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
          message: "0 invalid image URL issue(s) in 24h, warnAfter=2000",
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

function stubHealthyPublicApi(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));

      if (url.pathname === "/") {
        return new Response("<!doctype html>", { status: 200 });
      }

      if (url.pathname === "/api/source-status") {
        return Response.json({
          status: "ok",
          lastSuccessAt: "2026-06-02T11:50:00.000Z",
        });
      }

      if (url.pathname === "/api/products") {
        return Response.json({
          data: [{ id: "product-1" }],
          pagination: { totalItems: 1 },
        });
      }

      if (url.pathname === "/api/products/product-1") {
        return Response.json({ id: "product-1" });
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
}: {
  invalidImageErrorCount: number;
  trueParseErrorCount: number;
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
    },
    product: {
      count: async () => 1,
      findMany: async () => [{ id: "product-1" }],
    },
    productLinkHealth: {
      count: async () => 0,
    },
    rawSnapshot: {
      count: async () => 0,
    },
  } as unknown as Parameters<typeof runProductionSmoke>[0];
}
