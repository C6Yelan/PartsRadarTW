// apps/crawler/tests/scripts/ops/discord-bot/support/public-report-client.ts
// 模擬公開價格報告設定、發送紀錄與 crawl run 查詢 delegate。
import { vi } from "vitest";
import type {
  TestCrawlRun,
  TestDiscordPublicPriceReportDelivery,
  TestDiscordPublicPriceReportSetting,
} from "./data";

// 建立公開報告測試用 in-memory client，支援設定面板與排程發送流程。
export function createPublicReportClient({
  crawlRuns,
  publicPriceReportDeliveries,
  publicPriceReportSettings,
}: {
  crawlRuns: TestCrawlRun[];
  publicPriceReportDeliveries: TestDiscordPublicPriceReportDelivery[];
  publicPriceReportSettings: TestDiscordPublicPriceReportSetting[];
}) {
  const publicDeliveryRows = [...publicPriceReportDeliveries];
  const publicSettingRows = [...publicPriceReportSettings];
  const publicSettingFindMany = vi.fn(
    async (args: { where: { enabled?: boolean }; take?: number }) => {
      const rows = publicSettingRows
        .filter(
          (setting) => args.where.enabled === undefined || setting.enabled === args.where.enabled,
        )
        .sort((left, right) => {
          return (
            left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id)
          );
        });

      return typeof args.take === "number" ? rows.slice(0, args.take) : rows;
    },
  );
  const publicSettingFindUnique = vi.fn(
    async (args: { where: { discordGuildId: string } }) =>
      publicSettingRows.find((setting) => setting.discordGuildId === args.where.discordGuildId) ??
      null,
  );
  const publicSettingUpsert = vi.fn(
    async (args: {
      where: { discordGuildId: string };
      create: Omit<
        TestDiscordPublicPriceReportSetting,
        | "id"
        | "maxItems"
        | "categoryIgrps"
        | "productKeyword"
        | "includePriceDrops"
        | "includePriceRises"
        | "includeNewProducts"
        | "createdAt"
        | "updatedAt"
      > &
        Partial<
          Pick<
            TestDiscordPublicPriceReportSetting,
            | "maxItems"
            | "categoryIgrps"
            | "productKeyword"
            | "includePriceDrops"
            | "includePriceRises"
            | "includeNewProducts"
            | "notificationCursorAt"
          >
        >;
      update: Partial<TestDiscordPublicPriceReportSetting>;
    }) => {
      const existing = publicSettingRows.find(
        (setting) => setting.discordGuildId === args.where.discordGuildId,
      );

      if (existing) {
        Object.assign(existing, args.update, {
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        });
        return existing;
      }

      const created: TestDiscordPublicPriceReportSetting = {
        id: `public-setting-${publicSettingRows.length + 1}`,
        maxItems: 50,
        categoryIgrps: [],
        productKeyword: null,
        includePriceDrops: true,
        includePriceRises: true,
        includeNewProducts: false,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      publicSettingRows.push(created);

      return created;
    },
  );
  const publicSettingUpdate = vi.fn(
    async (args: {
      where: { discordGuildId: string };
      data: Partial<TestDiscordPublicPriceReportSetting>;
    }) => {
      const setting = publicSettingRows.find(
        (row) => row.discordGuildId === args.where.discordGuildId,
      );

      if (!setting) {
        throw new Error("Public report setting not found.");
      }

      Object.assign(setting, args.data, {
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
      });

      return setting;
    },
  );
  const publicSettingDeleteMany = vi.fn(async (args: { where: { discordGuildId: string } }) => {
    const beforeCount = publicSettingRows.length;

    for (let index = publicSettingRows.length - 1; index >= 0; index -= 1) {
      if (publicSettingRows[index]?.discordGuildId === args.where.discordGuildId) {
        publicSettingRows.splice(index, 1);
      }
    }

    return { count: beforeCount - publicSettingRows.length };
  });
  const publicDeliveryFindFirst = vi.fn(
    async (args: {
      where: { channelId: string };
      select?: Record<string, boolean>;
      orderBy?: Array<Record<string, "asc" | "desc">>;
    }) => {
      const delivery = publicDeliveryRows
        .filter((row) => row.channelId === args.where.channelId)
        .sort((left, right) => {
          return (
            right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id)
          );
        })[0];

      if (!delivery) {
        return null;
      }

      if (!args.select) {
        return delivery;
      }

      return Object.fromEntries(
        Object.entries(args.select)
          .filter(([, selected]) => selected)
          .map(([key]) => [key, delivery[key as keyof TestDiscordPublicPriceReportDelivery]]),
      );
    },
  );
  const crawlRunFindMany = vi.fn(
    async (args: {
      where: {
        triggerType?: TestCrawlRun["triggerType"];
        status?: { in: TestCrawlRun["status"][] };
        finishedAt?: { not: null; gt?: Date };
        OR?: Array<{
          publicPriceReportDeliveries?: {
            none?: { channelId: string };
            some?: {
              channelId: string;
              status: { in: TestDiscordPublicPriceReportDelivery["status"][] };
            };
          };
        }>;
      };
      take?: number;
    }) => {
      const channelId = args.where.OR?.[0]?.publicPriceReportDeliveries?.none?.channelId;
      const retryStatuses = args.where.OR?.[1]?.publicPriceReportDeliveries?.some?.status.in ?? [];

      return crawlRuns
        .filter((run) => {
          if (args.where.triggerType && run.triggerType !== args.where.triggerType) {
            return false;
          }

          if (args.where.status?.in && !args.where.status.in.includes(run.status)) {
            return false;
          }

          if (args.where.finishedAt?.not === null && run.finishedAt === null) {
            return false;
          }

          if (
            args.where.finishedAt?.gt &&
            (run.finishedAt === null ||
              run.finishedAt.getTime() <= args.where.finishedAt.gt.getTime())
          ) {
            return false;
          }

          if (!channelId) {
            return true;
          }

          const delivery = publicDeliveryRows.find(
            (row) => row.crawlRunId === run.id && row.channelId === channelId,
          );

          return !delivery || retryStatuses.includes(delivery.status);
        })
        .sort((left, right) => {
          return (
            (left.finishedAt?.getTime() ?? 0) - (right.finishedAt?.getTime() ?? 0) ||
            left.id.localeCompare(right.id)
          );
        })
        .slice(0, args.take);
    },
  );
  const publicDeliveryUpsert = vi.fn(
    async (args: {
      where: { crawlRunId_channelId: { crawlRunId: string; channelId: string } };
      create: Omit<TestDiscordPublicPriceReportDelivery, "id" | "createdAt" | "updatedAt">;
      update: Partial<TestDiscordPublicPriceReportDelivery>;
    }) => {
      const key = args.where.crawlRunId_channelId;
      const existing = publicDeliveryRows.find(
        (row) => row.crawlRunId === key.crawlRunId && row.channelId === key.channelId,
      );

      if (existing) {
        Object.assign(existing, args.update, {
          updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        });
        return existing;
      }

      const created: TestDiscordPublicPriceReportDelivery = {
        id: `public-delivery-${publicDeliveryRows.length + 1}`,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      publicDeliveryRows.push(created);

      return created;
    },
  );

  return {
    crawlRun: {
      findMany: crawlRunFindMany,
    },
    discordPublicPriceReportDelivery: {
      findFirst: publicDeliveryFindFirst,
      upsert: publicDeliveryUpsert,
    },
    discordPublicPriceReportSetting: {
      deleteMany: publicSettingDeleteMany,
      findMany: publicSettingFindMany,
      findUnique: publicSettingFindUnique,
      update: publicSettingUpdate,
      upsert: publicSettingUpsert,
    },
  };
}
