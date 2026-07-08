// apps/crawler/tests/scripts/ops/discord-bot/support-price-report-setting-client.ts
// 模擬個人價格報告設定 delegate，支援設定查詢、更新與 upsert。
import { vi } from "vitest";
import type { TestPriceReportSetting } from "./support-data";

// 建立可檢查 find / update / upsert 呼叫的 in-memory setting client。
export function createPriceReportSettingClient(settings: TestPriceReportSetting[]) {
  const settingRows = [...settings];
  const settingFindFirst = vi.fn(
    async (args: { where: { enabled?: boolean; nextSendAt?: { not: null } } }) => {
      const rows = settingRows
        .filter((setting) => {
          if (args.where.enabled !== undefined && setting.enabled !== args.where.enabled) {
            return false;
          }

          return !args.where.nextSendAt || setting.nextSendAt !== null;
        })
        .sort((left, right) => {
          return (
            (left.nextSendAt?.getTime() ?? Number.POSITIVE_INFINITY) -
              (right.nextSendAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
            left.id.localeCompare(right.id)
          );
        });

      const setting = rows[0];

      return setting ? { nextSendAt: setting.nextSendAt } : null;
    },
  );
  const settingFindMany = vi.fn(
    async (args: { where: { nextSendAt?: { lte: Date }; enabled?: boolean } }) => {
      const nextSendAtLte = args.where.nextSendAt?.lte;

      return settingRows.filter((setting) => {
        if (args.where.enabled !== undefined && setting.enabled !== args.where.enabled) {
          return false;
        }

        return (
          !nextSendAtLte ||
          (setting.nextSendAt !== null && setting.nextSendAt.getTime() <= nextSendAtLte.getTime())
        );
      });
    },
  );
  const settingFindUnique = vi.fn(async (args: { where: { discordUserId: string } }) => {
    return (
      settingRows.find((setting) => setting.discordUserId === args.where.discordUserId) ?? null
    );
  });
  const settingUpdate = vi.fn(
    async (args: { where: { id: string }; data: Partial<TestPriceReportSetting> }) => {
      const setting = settingRows.find((row) => row.id === args.where.id);

      if (!setting) {
        throw new Error("Setting not found.");
      }

      Object.assign(setting, args.data);
      return setting;
    },
  );
  const settingUpdateMany = vi.fn(
    async (args: {
      where: { discordUserId: string; enabled?: boolean };
      data: Partial<TestPriceReportSetting>;
    }) => {
      let count = 0;

      for (const setting of settingRows) {
        if (
          setting.discordUserId === args.where.discordUserId &&
          (args.where.enabled === undefined || setting.enabled === args.where.enabled)
        ) {
          Object.assign(setting, args.data);
          count += 1;
        }
      }

      return { count };
    },
  );
  const settingUpsert = vi.fn(
    async (args: {
      where: { discordUserId: string };
      create: Pick<
        TestPriceReportSetting,
        | "discordUserId"
        | "interval"
        | "window"
        | "scope"
        | "timezone"
        | "maxItems"
        | "categoryIgrps"
        | "productKeyword"
        | "includePriceDrops"
        | "includePriceRises"
        | "includeNewProducts"
        | "enabled"
        | "nextSendAt"
        | "notificationCursorAt"
      >;
      update: Partial<TestPriceReportSetting>;
    }) => {
      const existing = settingRows.find(
        (setting) => setting.discordUserId === args.where.discordUserId,
      );

      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }

      const created = {
        id: "setting-created",
        lastSentAt: null,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      settingRows.push(created);

      return created;
    },
  );

  return {
    findFirst: settingFindFirst,
    findMany: settingFindMany,
    findUnique: settingFindUnique,
    update: settingUpdate,
    updateMany: settingUpdateMany,
    upsert: settingUpsert,
  };
}
