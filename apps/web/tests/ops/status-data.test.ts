// apps/web/tests/ops/status-data.test.ts
import { describe, expect, it } from "vitest";
import {
  collectOpsStatus,
  type OpsStatusReadClient,
  readOpsStatusThresholds,
} from "../../app/ops/status/data";

const NOW = new Date("2026-06-07T12:00:00.000Z");

describe("collectOpsStatus", () => {
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
    expect(summary.checks.map((check) => [check.key, check.level])).toContainEqual([
      "link-health",
      "ok",
    ]);
  });

});

describe("readOpsStatusThresholds", () => {
  it("uses smoke fallback environment names for source link thresholds", () => {
    expect(
      readOpsStatusThresholds({
        SMOKE_BROKEN_LINK_WARN_COUNT: "7",
        SMOKE_TEMPORARY_LINK_FAIL_COUNT: "900",
      }).sourceBrokenLinkWarnCount,
    ).toBe(7);
    expect(
      readOpsStatusThresholds({
        SMOKE_BROKEN_LINK_WARN_COUNT: "7",
        SMOKE_TEMPORARY_LINK_FAIL_COUNT: "900",
      }).sourceTemporaryLinkFailCount,
    ).toBe(900);
  });
});

interface FakeOpsClientOptions {
  linkHealth?: Partial<
    Record<"SOURCE", Partial<Record<"OK" | "BROKEN" | "TEMPORARY_ERROR", number>>>
  >;
}

function fakeOpsClient(options: FakeOpsClientOptions = {}): OpsStatusReadClient {
  const linkHealth = {
    SOURCE: {
      OK: 8,
      BROKEN: 0,
      TEMPORARY_ERROR: 0,
      ...options.linkHealth?.SOURCE,
    },
  };

  return {
    sourceCategory: {
      async findMany() {
        return [
          {
            igrp: 4,
            displayName: "CPU",
            sourceName: "處理器 CPU",
            lastCheckedAt: new Date("2026-06-07T11:55:00.000Z"),
            lastSuccessAt: new Date("2026-06-07T11:50:00.000Z"),
          },
        ];
      },
    },
    crawlRun: {
      async findLatestScheduled() {
        return {
          id: "latest-run",
          status: "SUCCESS_UNCHANGED",
          startedAt: new Date("2026-06-07T11:40:00.000Z"),
          finishedAt: new Date("2026-06-07T11:45:00.000Z"),
        };
      },
      async findLatestSuccessfulScheduled() {
        return {
          id: "success-run",
          status: "SUCCESS_UNCHANGED",
          finishedAt: new Date("2026-06-07T11:45:00.000Z"),
        };
      },
      async findMany() {
        return [
          {
            id: "latest-run",
            status: "SUCCESS_UNCHANGED",
            triggerType: "SCHEDULED",
            startedAt: new Date("2026-06-07T11:40:00.000Z"),
            finishedAt: new Date("2026-06-07T11:45:00.000Z"),
            backoffUntil: null,
            _count: {
              categoryResults: 1,
              parseErrors: 0,
              priceSnapshots: 8,
            },
          },
        ];
      },
      async count() {
        return 0;
      },
    },
    parseError: {
      async count() {
        return 0;
      },
    },
    product: {
      async count(args) {
        return "primaryImageUrl" in (args.where ?? {}) ? 8 : 10;
      },
      async findMany() {
        return Array.from({ length: 8 }, (_, index) => ({ id: `product-${index + 1}` }));
      },
    },
    productLinkHealth: {
      async count(args) {
        const kind = String(args.where?.linkKind ?? "");
        const status = args.where?.status;

        if (kind === "SOURCE" && (status === "OK" || status === "BROKEN" || status === "TEMPORARY_ERROR")) {
          return linkHealth[kind][status];
        }

        return 0;
      },
    },
    rawSnapshot: {
      async count() {
        return 0;
      },
    },
  };
}
