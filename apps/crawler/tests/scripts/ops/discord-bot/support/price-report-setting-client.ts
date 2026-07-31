// apps/crawler/tests/scripts/ops/discord-bot/support/price-report-setting-client.ts
// 模擬個人價格報告設定 delegate，支援設定查詢、更新與 upsert。
import { vi } from "vitest";
import type { TestPriceReportSetting } from "./data-types";

// 建立可檢查 find / update / upsert 呼叫的 in-memory setting client。
export function createPriceReportSettingClient(settings: TestPriceReportSetting[]) {
  const settingRows = [...settings];
  const settingFindFirst = vi.fn(
    async (args: { where: TestSettingWhere; select?: Record<string, boolean> }) => {
      const rows = settingRows
        .filter((setting) => {
          return matchesSettingWhere(setting, args.where);
        })
        .sort((left, right) => {
          return (
            (left.nextSendAt?.getTime() ?? Number.POSITIVE_INFINITY) -
              (right.nextSendAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
            left.id.localeCompare(right.id)
          );
        });

      const setting = rows[0];

      return setting ? selectSettingFields(setting, args.select) : null;
    },
  );
  const settingFindMany = vi.fn(
    async (args: { where: TestSettingWhere; select?: Record<string, boolean> }) => {
      return settingRows
        .filter((setting) => {
          return matchesSettingWhere(setting, args.where);
        })
        .map((setting) => selectSettingFields(setting, args.select));
    },
  );
  const settingFindUnique = vi.fn(
    async (args: { where: { discordUserId: string }; select?: Record<string, boolean> }) => {
      const setting = settingRows.find(
        (setting) => setting.discordUserId === args.where.discordUserId,
      );

      return setting ? selectSettingFields(setting, args.select) : null;
    },
  );
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
    async (args: { where: TestSettingWhere; data: Partial<TestPriceReportSetting> }) => {
      let count = 0;

      for (const setting of settingRows) {
        if (matchesSettingWhere(setting, args.where)) {
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
        | "categoryIgrps"
        | "productKeyword"
        | "includePriceDrops"
        | "includePriceRises"
        | "includeNewProducts"
        | "enabled"
        | "deliveryState"
        | "consecutiveDeliveryFailures"
        | "deliveryClaimedAt"
        | "nextSendAt"
        | "notificationCursorAt"
      >;
      update: Partial<TestPriceReportSetting>;
      select?: Record<string, boolean>;
    }) => {
      const existing = settingRows.find(
        (setting) => setting.discordUserId === args.where.discordUserId,
      );

      if (existing) {
        Object.assign(existing, args.update);
        return selectSettingFields(existing, args.select);
      }

      const created = {
        id: "setting-created",
        maxItems: 50,
        disabledAt: null,
        lastSentAt: null,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      settingRows.push(created);

      return selectSettingFields(created, args.select);
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

interface TestSettingWhere {
  id?: string;
  discordUserId?: string;
  enabled?: boolean;
  deliveryState?: TestPriceReportSetting["deliveryState"];
  deliveryClaimedAt?: Date | null | { lte: Date };
  nextSendAt?: { lte?: Date; not?: null };
  OR?: TestSettingWhere[];
}

function matchesSettingWhere(setting: TestPriceReportSetting, where: TestSettingWhere): boolean {
  if (where.id !== undefined && setting.id !== where.id) {
    return false;
  }
  if (where.discordUserId !== undefined && setting.discordUserId !== where.discordUserId) {
    return false;
  }
  if (where.enabled !== undefined && setting.enabled !== where.enabled) {
    return false;
  }
  if (where.deliveryState !== undefined && setting.deliveryState !== where.deliveryState) {
    return false;
  }
  if (!matchesDateCondition(setting.deliveryClaimedAt, where.deliveryClaimedAt)) {
    return false;
  }
  if (where.nextSendAt?.not === null && setting.nextSendAt === null) {
    return false;
  }
  if (
    where.nextSendAt?.lte &&
    (setting.nextSendAt === null || setting.nextSendAt.getTime() > where.nextSendAt.lte.getTime())
  ) {
    return false;
  }

  return !where.OR || where.OR.some((condition) => matchesSettingWhere(setting, condition));
}

function matchesDateCondition(
  value: Date | null,
  condition: Date | null | { lte: Date } | undefined,
): boolean {
  if (condition === undefined) {
    return true;
  }
  if (condition === null) {
    return value === null;
  }
  if (condition instanceof Date) {
    return value?.getTime() === condition.getTime();
  }

  return value !== null && value.getTime() <= condition.lte.getTime();
}

function selectSettingFields(
  setting: TestPriceReportSetting,
  select: Record<string, boolean> | undefined,
): Partial<TestPriceReportSetting> {
  if (!select) {
    return setting;
  }

  return Object.fromEntries(
    Object.entries(select)
      .filter(([, selected]) => selected)
      .map(([key]) => [key, setting[key as keyof TestPriceReportSetting]]),
  );
}
