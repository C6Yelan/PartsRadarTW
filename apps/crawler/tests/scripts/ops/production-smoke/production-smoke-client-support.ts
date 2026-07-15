// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-client-support.ts
// 提供 production smoke 測試共用的 fake Prisma client。

import type { DiscordDeliveryErrorCategory } from "@partsradar/db";
import { vi } from "vitest";
import type { runProductionSmoke } from "../../../../src/scripts/ops/production-smoke";

interface DiscordDeliveryErrorMetadata {
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
}

// 建立 production smoke fake client，集中控制 DB-backed checks 需要的統計資料。
export function createSmokeClient({
  trueParseErrorCount,
  discordDeliveryCounts = {},
  discordDeliveryRecords,
  publicDiscordDeliveryCounts = {},
  publicDiscordDeliveryRecords,
  historicalImageProducts = [],
  activeProductCount = 1000,
}: {
  trueParseErrorCount: number;
  discordDeliveryCounts?: {
    failed?: number;
    rateLimited?: number;
  };
  discordDeliveryRecords?: Array<
    {
      id: string;
      discordUserId: string;
      kind: "PRICE_REPORT_NOW" | "SCHEDULED_PRICE_REPORT" | "TARGET_PRICE";
      status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
      targetPriceWatchId: string | null;
      createdAt: Date;
    } & DiscordDeliveryErrorMetadata
  >;
  publicDiscordDeliveryCounts?: {
    failed?: number;
    rateLimited?: number;
  };
  publicDiscordDeliveryRecords?: Array<
    {
      id: string;
      channelId: string;
      status: "SENT" | "SKIPPED" | "FAILED" | "RATE_LIMITED";
      createdAt: Date;
      updatedAt: Date;
    } & Partial<DiscordDeliveryErrorMetadata>
  >;
  historicalImageProducts?: Array<{ id: string }>;
  activeProductCount?: number;
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
      count: async () => trueParseErrorCount,
    },
    product: {
      count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
        where && Object.keys(where).length === 1 && where.isActive === true
          ? activeProductCount
          : 1,
      findMany: async ({
        where,
      }: {
        where?: {
          isActive?: boolean;
          imageCacheFailureCount?: unknown;
          sourceCategory?: unknown;
        };
      } = {}) =>
        where?.isActive === false
          ? historicalImageProducts
          : where?.imageCacheFailureCount
            ? []
            : where?.sourceCategory
              ? []
              : [{ id: "product-1" }],
    },
    rawSnapshot: {
      count: async () => 0,
    },
    discordNotificationDelivery: {
      count: async ({ where }: { where: { status?: "FAILED" | "RATE_LIMITED" } }) => {
        if (where.status === "FAILED") {
          return discordDeliveryCounts.failed ?? 0;
        }

        if (where.status === "RATE_LIMITED") {
          return discordDeliveryCounts.rateLimited ?? 0;
        }

        return 0;
      },
      findMany: vi.fn(async () =>
        discordDeliveryRecords ?? [
          ...Array.from({ length: discordDeliveryCounts.failed ?? 0 }, (_, index) => ({
            id: `discord-failed-${index + 1}`,
            discordUserId: `discord-user-failed-${index + 1}`,
            kind: "SCHEDULED_PRICE_REPORT" as const,
            status: "FAILED" as const,
            targetPriceWatchId: null,
            errorCategory: "TRANSPORT" as const,
            httpStatus: null,
            providerErrorCode: null,
            createdAt: new Date(`2026-06-02T11:${String(50 - index).padStart(2, "0")}:00.000Z`),
          })),
          ...Array.from({ length: discordDeliveryCounts.rateLimited ?? 0 }, (_, index) => ({
            id: `discord-rate-limited-${index + 1}`,
            discordUserId: `discord-user-rate-limited-${index + 1}`,
            kind: "SCHEDULED_PRICE_REPORT" as const,
            status: "RATE_LIMITED" as const,
            targetPriceWatchId: null,
            errorCategory: "RATE_LIMITED" as const,
            httpStatus: 429,
            providerErrorCode: null,
            createdAt: new Date(`2026-06-02T11:${String(40 - index).padStart(2, "0")}:00.000Z`),
          })),
        ],
      ),
    },
    discordPublicPriceReportDelivery: {
      findMany: vi.fn(
        async () =>
          publicDiscordDeliveryRecords ?? [
            ...Array.from({ length: publicDiscordDeliveryCounts.failed ?? 0 }, (_, index) => ({
              id: `discord-public-failed-${index + 1}`,
              channelId: `discord-channel-failed-${index + 1}`,
              status: "FAILED" as const,
              createdAt: new Date(`2026-06-02T11:${String(30 - index).padStart(2, "0")}:00.000Z`),
              updatedAt: new Date(`2026-06-02T11:${String(30 - index).padStart(2, "0")}:00.000Z`),
            })),
            ...Array.from({ length: publicDiscordDeliveryCounts.rateLimited ?? 0 }, (_, index) => ({
              id: `discord-public-rate-limited-${index + 1}`,
              channelId: `discord-channel-rate-limited-${index + 1}`,
              status: "RATE_LIMITED" as const,
              createdAt: new Date(`2026-06-02T11:${String(20 - index).padStart(2, "0")}:00.000Z`),
              updatedAt: new Date(`2026-06-02T11:${String(20 - index).padStart(2, "0")}:00.000Z`),
            })),
          ],
      ),
    },
  } as unknown as Parameters<typeof runProductionSmoke>[0];
}
