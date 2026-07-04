// apps/web/tests/ops/status-data-summary.test.ts
import { describe, expect, it } from "vitest";
import { collectOpsStatus } from "../../app/ops/status/data";
import { fakeOpsClient, NOW } from "./status-data-support";

describe("collectOpsStatus summary", () => {
  it("returns ok when smoke-aligned signals are healthy", async () => {
    const summary = await collectOpsStatus(fakeOpsClient(), {
      now: () => NOW,
      productImageStorageDir: "/images",
      productImageExists: async () => true,
    });

    expect(summary.overallLevel).toBe("ok");
    expect(summary.productCounts).toEqual({
      active: 10,
      displayReady: 8,
      missingImages: 0,
    });
    expect(summary.discordBot.priceReportSettings).toEqual({
      total: 2,
      enabled: 1,
      dueNow: 0,
    });
    expect(summary.discordBot.targetPriceWatches).toEqual({
      active: 3,
      notified: 1,
      claimed: 0,
    });
    expect(summary.checks.map((check) => [check.key, check.level])).toContainEqual([
      "link-health",
      "ok",
    ]);
    expect(summary.checks.map((check) => [check.key, check.level])).toContainEqual([
      "discord-bot-delivery",
      "ok",
    ]);
    expect(summary.runtimeSchedule.jobs.map((job) => job.key)).toEqual([
      "price-crawler",
      "new-product-images",
      "link-health",
      "raw-snapshot-cleanup",
      "production-smoke",
      "discord-bot",
    ]);
    expect(summary.runtimeSchedule.policies.map((policy) => policy.key)).toEqual([
      "external-fetch-lock",
      "price-priority",
      "image-policy",
    ]);
  });
});
