// apps/web/tests/ops/status-data-schedule.test.ts
import { describe, expect, it } from "vitest";
import { collectOpsStatus } from "../../app/ops/status/data";
import { fakeOpsClient, NOW } from "./status-data-support";

describe("collectOpsStatus runtime schedule", () => {
  it("reflects crawler and maintenance schedule overrides from env", async () => {
    const summary = await collectOpsStatus(fakeOpsClient(), {
      now: () => NOW,
      productImageStorageDir: "/images",
      productImageExists: async () => true,
      env: {
        CRAWLER_INTERVAL_SECONDS: "600",
        CRAWLER_LOCK_RETRY_SECONDS: "90",
        CRAWLER_NEW_PRODUCT_IMAGE_MIN_DELAY_MS: "2000",
        CRAWLER_NEW_PRODUCT_IMAGE_MAX_DELAY_MS: "3000",
        MAINTENANCE_INTERVAL_SECONDS: "7200",
        MAINTENANCE_LINK_LIMIT: "20",
        MAINTENANCE_PRICE_PRIORITY_PAUSE_SECONDS: "420",
        RAW_SNAPSHOT_CLEANUP_INTERVAL_SECONDS: "43200",
        SMOKE_INTERVAL_SECONDS: "120",
        DISCORD_PRICE_REPORT_SCHEDULE_INTERVAL_SECONDS: "180",
      },
    });

    expect(summary.runtimeSchedule.jobs.find((job) => job.key === "price-crawler")).toMatchObject({
      cadence: expect.stringContaining("每 10m 執行"),
      details: expect.arrayContaining([expect.stringContaining("1m30s 後重試")]),
    });
    expect(
      summary.runtimeSchedule.jobs.find((job) => job.key === "new-product-images"),
    ).toMatchObject({
      details: expect.arrayContaining([expect.stringContaining("2s-3s")]),
    });
    expect(summary.runtimeSchedule.jobs.find((job) => job.key === "link-health")).toMatchObject({
      cadence: expect.stringContaining("每 2h 執行"),
      details: expect.arrayContaining([
        expect.stringContaining("每輪最多 20"),
        expect.stringContaining("延後 7m 再繼續"),
      ]),
    });
    expect(
      summary.runtimeSchedule.jobs.find((job) => job.key === "raw-snapshot-cleanup"),
    ).toMatchObject({
      cadence: expect.stringContaining("每 12h 執行"),
    });
    expect(
      summary.runtimeSchedule.jobs.find((job) => job.key === "production-smoke"),
    ).toMatchObject({
      cadence: expect.stringContaining("每 2m 檢查"),
    });
    expect(summary.runtimeSchedule.jobs.find((job) => job.key === "discord-bot")).toMatchObject({
      cadence: expect.stringContaining("每 3m 掃描"),
      details: expect.arrayContaining([expect.stringContaining("立即預覽")]),
    });
  });
});
