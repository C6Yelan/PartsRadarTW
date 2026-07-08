// apps/crawler/tests/scripts/ops/discord-bot/support-target-watch-client.ts
// 模擬目標價 watch delegate，支援 watch 管理面板與達標通知流程。
import { vi } from "vitest";
import type { TestSnapshot, TestTargetPriceWatch } from "./support-data";
import { toPrismaWatchListRecord } from "./support-client-mappers";

type WatchWhere = {
  id?: string;
  discordUserId?: string;
  productId?: string;
  enabled?: boolean;
  lastNotifiedAt?: null;
  notificationClaimedAt?: Date | null;
  OR?: Array<{
    notificationClaimedAt: null | { lte: Date };
  }>;
  product?: unknown;
};

// 建立可檢查 find / updateMany / upsert 呼叫的 in-memory watch client。
export function createTargetPriceWatchClient(
  watches: TestTargetPriceWatch[],
  snapshots: TestSnapshot[],
) {
  const watchRows = [...watches];
  const toWatchRecord = (watch: TestTargetPriceWatch) => toPrismaWatchListRecord(watch, snapshots);

  const matchesClaim = (watch: TestTargetPriceWatch, condition: null | Date | { lte: Date }) => {
    if (condition === null) {
      return watch.notificationClaimedAt === null;
    }

    if (condition instanceof Date) {
      return watch.notificationClaimedAt?.getTime() === condition.getTime();
    }

    return (
      watch.notificationClaimedAt !== null &&
      watch.notificationClaimedAt.getTime() <= condition.lte.getTime()
    );
  };

  const matchesWatchWhere = (watch: TestTargetPriceWatch, where: WatchWhere) => {
    if (where.id !== undefined && watch.id !== where.id) {
      return false;
    }

    if (where.discordUserId !== undefined && watch.discordUserId !== where.discordUserId) {
      return false;
    }

    if (where.productId !== undefined && watch.productId !== where.productId) {
      return false;
    }

    if (where.enabled !== undefined && watch.enabled !== where.enabled) {
      return false;
    }

    if (where.lastNotifiedAt === null && watch.lastNotifiedAt !== null) {
      return false;
    }

    if (
      where.notificationClaimedAt !== undefined &&
      !matchesClaim(watch, where.notificationClaimedAt)
    ) {
      return false;
    }

    if (
      where.OR &&
      !where.OR.some((condition) => matchesClaim(watch, condition.notificationClaimedAt))
    ) {
      return false;
    }

    if (where.product && !snapshots.some((snapshot) => snapshot.productId === watch.productId)) {
      return false;
    }

    return true;
  };

  const watchFindMany = vi.fn(
    async (args: { where: WatchWhere; skip?: number; take?: number }) => {
      const rows = watchRows
        .filter((watch) => matchesWatchWhere(watch, args.where))
        .sort((left, right) => {
          return (
            right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id)
          );
        })
        .map(toWatchRecord);
      const start = args.skip ?? 0;

      return typeof args.take === "number" ? rows.slice(start, start + args.take) : rows.slice(start);
    },
  );
  const watchFindFirst = vi.fn(
    async (args: {
      where: { id?: string; discordUserId?: string; productId?: string; enabled?: boolean };
    }) => {
      const watch = watchRows.find((row) => {
        if (args.where.id !== undefined && row.id !== args.where.id) {
          return false;
        }

        if (
          args.where.discordUserId !== undefined &&
          row.discordUserId !== args.where.discordUserId
        ) {
          return false;
        }

        if (args.where.productId !== undefined && row.productId !== args.where.productId) {
          return false;
        }

        return args.where.enabled === undefined || row.enabled === args.where.enabled;
      });

      return watch ? toWatchRecord(watch) : null;
    },
  );
  const watchUpdateMany = vi.fn(
    async (args: { where: WatchWhere; data: Partial<TestTargetPriceWatch> }) => {
      let count = 0;

      for (const watch of watchRows) {
        if (!matchesWatchWhere(watch, args.where)) {
          continue;
        }

        Object.assign(watch, args.data);
        count += 1;
      }

      return { count };
    },
  );
  const watchUpsert = vi.fn(
    async (args: {
      where: { discordUserId_productId: { discordUserId: string; productId: string } };
      create: Pick<
        TestTargetPriceWatch,
        | "discordUserId"
        | "productId"
        | "targetPrice"
        | "currency"
        | "enabled"
        | "notificationCursorAt"
      >;
      update: Partial<TestTargetPriceWatch>;
    }) => {
      const key = args.where.discordUserId_productId;
      const existing = watchRows.find(
        (watch) => watch.discordUserId === key.discordUserId && watch.productId === key.productId,
      );

      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }

      const created = {
        id: "44444444-4444-4444-8444-444444444444",
        lastNotifiedAt: null,
        notificationClaimedAt: null,
        createdAt: new Date("2026-06-07T00:00:00.000Z"),
        updatedAt: new Date("2026-06-07T00:00:00.000Z"),
        ...args.create,
      };
      watchRows.push(created);

      return created;
    },
  );

  return {
    findFirst: watchFindFirst,
    findMany: watchFindMany,
    updateMany: watchUpdateMany,
    upsert: watchUpsert,
  };
}
