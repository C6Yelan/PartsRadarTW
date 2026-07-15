// apps/crawler/tests/scripts/ops/production-smoke/production-smoke-support.ts
// 提供 production smoke 測試共用的 workspace fixture、public API stub、fake Prisma client 與 shutdown helper。

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiscordDeliveryErrorCategory } from "@partsradar/db";
import { vi } from "vitest";
import type { runProductionSmoke } from "../../../../src/scripts/ops/production-smoke";
import type { runProductionSmokeDaemon } from "../../../../src/scripts/ops/production-smoke-daemon";

export const DISCORD_ADMIN_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";

export type SendDiscordWebhook = NonNullable<
  Parameters<typeof runProductionSmokeDaemon>[0]["sendDiscordWebhook"]
>;

interface DiscordDeliveryErrorMetadata {
  errorCategory: DiscordDeliveryErrorCategory | null;
  httpStatus: number | null;
  providerErrorCode: number | null;
}

// 建立最小 workspace 結構，讓 smoke option parser 可解析 repo root 與 crawler cwd。
export async function createWorkspace(): Promise<{
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

// Stub public HTTP endpoints，讓 production smoke 測試可控制頁面、API、圖片與 rate-limit header 狀態。
export function stubHealthyPublicApi({
  buildListStatus = 200,
  categorySlugs = [
    "cpu",
    "motherboard",
    "memory",
    "storage",
    "hard-drive",
    "external-storage",
    "cooler",
    "liquid-cooling",
    "gpu",
    "case",
    "power-supply",
    "fan-accessory",
  ],
  includeCategoryFacets = true,
  imageStatus = 200,
  imageStatusByProductId = new Map<string, number>(),
  nullImageProductIds = new Set<string>(),
  productCount = 1,
  rateLimitClientSource = "cf",
}: {
  buildListStatus?: number;
  categorySlugs?: string[];
  includeCategoryFacets?: boolean;
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
          data: categorySlugs.map((slug) => ({
            slug,
            ...(includeCategoryFacets
              ? { facets: [{ key: "example", options: [{ value: "yes" }] }] }
              : {}),
          })),
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

// 提供 daemon 測試用的不等待 shutdown controller，讓 run-once 路徑直接完成。
export function idleShutdown() {
  return {
    requested: false,
    sleep: async () => {},
  };
}
