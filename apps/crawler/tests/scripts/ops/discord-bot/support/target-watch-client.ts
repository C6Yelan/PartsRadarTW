// apps/crawler/tests/scripts/ops/discord-bot/support/target-watch-client.ts
// 模擬目標價 watch delegate，支援 watch 管理面板與達標通知流程。
import { vi } from "vitest";
import type { TestSnapshot, TestTargetPriceWatch } from "./data-types";
import { toPrismaWatchProduct } from "./snapshot-records";

interface RawQuery {
  sql: string;
  values: unknown[];
}

type WatchWhere = {
  id?: string | { in: string[] };
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
  let scanCursor: { updatedAt: Date; id: string } | null = null;
  let roundUpper: { updatedAt: Date; id: string } | null = null;
  let transactionTail = Promise.resolve();
  const toWatchRecord = (watch: TestTargetPriceWatch) => {
    const latestSnapshot = snapshots
      .filter((snapshot) => snapshot.productId === watch.productId)
      .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

    return {
      id: watch.id,
      discordUserId: watch.discordUserId,
      productId: watch.productId,
      targetPrice: watch.targetPrice,
      currency: watch.currency,
      enabled: watch.enabled,
      lastNotifiedAt: watch.lastNotifiedAt,
      notificationCursorAt: watch.notificationCursorAt,
      updatedAt: watch.updatedAt,
      product: latestSnapshot
        ? toPrismaWatchProduct(latestSnapshot)
        : {
            id: watch.productId,
            name: "Unknown product",
            currentPrice: null,
          },
    };
  };

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
    if (
      where.id !== undefined &&
      (typeof where.id === "string" ? watch.id !== where.id : !where.id.in.includes(watch.id))
    ) {
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

  const watchFindMany = vi.fn(async (args: { where: WatchWhere; skip?: number; take?: number }) => {
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
  });
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
        disabledAt: null,
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

  const queryRaw = vi.fn(async (query: RawQuery) => {
    if (query.sql.includes('AS "roundUpperUpdatedAt"') && query.sql.includes("FOR UPDATE")) {
      return [
        {
          cursorUpdatedAt: scanCursor?.updatedAt ?? null,
          cursorWatchId: scanCursor?.id ?? null,
          roundUpperUpdatedAt: roundUpper?.updatedAt ?? null,
          roundUpperWatchId: roundUpper?.id ?? null,
        },
      ];
    }

    if (query.sql.includes("upper_bound") && query.sql.includes("RETURNING")) {
      const lastPending = watchRows
        .filter((watch) => watch.enabled && watch.lastNotifiedAt === null)
        .sort(
          (left, right) =>
            right.updatedAt.getTime() - left.updatedAt.getTime() || right.id.localeCompare(left.id),
        )[0];

      if (lastPending) {
        roundUpper = {
          updatedAt: new Date(lastPending.updatedAt),
          id: lastPending.id,
        };
        return [
          {
            cursorUpdatedAt: scanCursor?.updatedAt ?? null,
            cursorWatchId: scanCursor?.id ?? null,
            roundUpperUpdatedAt: roundUpper.updatedAt,
            roundUpperWatchId: roundUpper.id,
          },
        ];
      }
      return [];
    }

    if (query.sql.includes("set_config('enable_bitmapscan'")) {
      return [
        {
          bitmapScan: "off",
          fromCollapseLimit: "1",
          indexOnlyScan: "on",
          indexReady: true,
          indexScan: "on",
          joinCollapseLimit: "1",
          sequentialScan: "off",
        },
      ];
    }

    if (!query.sql.includes("scan_candidates AS MATERIALIZED")) {
      throw new Error("Target watch test client received an unknown raw query.");
    }

    const scanLimit = query.values.find(
      (value): value is number => typeof value === "number" && Number.isSafeInteger(value),
    );
    const numericValues = query.values.filter(
      (value): value is number => typeof value === "number" && Number.isSafeInteger(value),
    );
    const claimLimit = numericValues[1];
    const timestamps = query.values.filter((value): value is Date => value instanceof Date);
    const stateTimestampCount = scanCursor ? 2 : 1;
    const staleClaimBefore = timestamps[stateTimestampCount];
    const claimedAt = timestamps[stateTimestampCount + 1];

    if (!scanLimit || !claimLimit || !claimedAt || !staleClaimBefore) {
      throw new Error("Target watch test client received an invalid claim query.");
    }

    const pending = watchRows
      .filter((watch) => watch.enabled && watch.lastNotifiedAt === null)
      .sort(
        (left, right) =>
          left.updatedAt.getTime() - right.updatedAt.getTime() || left.id.localeCompare(right.id),
      );
    const cursor = scanCursor;
    const upper = roundUpper;
    const scanWindow = upper
      ? pending
          .filter(
            (watch) =>
              (!cursor ||
                watch.updatedAt.getTime() > cursor.updatedAt.getTime() ||
                (watch.updatedAt.getTime() === cursor.updatedAt.getTime() &&
                  watch.id > cursor.id)) &&
              (watch.updatedAt.getTime() < upper.updatedAt.getTime() ||
                (watch.updatedAt.getTime() === upper.updatedAt.getTime() && watch.id <= upper.id)),
          )
          .slice(0, scanLimit)
      : [];
    const claimed = scanWindow
      .filter((watch) => {
        const current = snapshots
          .filter((snapshot) => snapshot.productId === watch.productId)
          .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

        return (
          (watch.notificationClaimedAt === null ||
            watch.notificationClaimedAt.getTime() <= staleClaimBefore.getTime()) &&
          current !== undefined &&
          current.currency === watch.currency &&
          (watch.notificationCursorAt === null ||
            current.capturedAt.getTime() > watch.notificationCursorAt.getTime()) &&
          current.price <= watch.targetPrice
        );
      })
      .slice(0, claimLimit);
    const lastProgress = claimed.length === claimLimit ? claimed.at(-1) : scanWindow.at(-1);

    if (
      lastProgress &&
      (claimed.length === claimLimit || scanWindow.length === scanLimit) &&
      upper &&
      (lastProgress.updatedAt.getTime() < upper.updatedAt.getTime() ||
        (lastProgress.updatedAt.getTime() === upper.updatedAt.getTime() &&
          lastProgress.id < upper.id))
    ) {
      scanCursor = { updatedAt: lastProgress.updatedAt, id: lastProgress.id };
    } else {
      scanCursor = null;
      roundUpper = null;
    }

    for (const watch of claimed) {
      watch.notificationClaimedAt = claimedAt;
    }

    if (claimed.length === 0) {
      return [
        {
          scannedCount: scanWindow.length,
          id: null,
          discordUserId: null,
          productId: null,
          targetPrice: null,
          currency: null,
          notificationCursorAt: null,
          updatedAt: null,
          productName: null,
          currentPrice: null,
          currentCurrency: null,
          currentCapturedAt: null,
        },
      ];
    }

    return claimed.map((watch) => {
      const current = snapshots
        .filter((snapshot) => snapshot.productId === watch.productId)
        .sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0];

      if (!current) {
        throw new Error("Claimed target watch is missing its current snapshot.");
      }

      return {
        scannedCount: scanWindow.length,
        id: watch.id,
        discordUserId: watch.discordUserId,
        productId: watch.productId,
        targetPrice: watch.targetPrice,
        currency: watch.currency,
        notificationCursorAt: watch.notificationCursorAt,
        updatedAt: watch.updatedAt,
        productName: current.productName,
        currentPrice: current.price,
        currentCurrency: current.currency,
        currentCapturedAt: current.capturedAt,
      };
    });
  });

  const transaction = vi.fn(
    async <T>(callback: (client: { $queryRaw: typeof queryRaw }) => Promise<T>): Promise<T> => {
      let releaseTransaction: (() => void) | undefined;
      const previousTransaction = transactionTail;
      transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;

      try {
        return await callback({ $queryRaw: queryRaw });
      } finally {
        releaseTransaction?.();
      }
    },
  );

  return {
    delegate: {
      findFirst: watchFindFirst,
      findMany: watchFindMany,
      updateMany: watchUpdateMany,
      upsert: watchUpsert,
    },
    queryRaw,
    transaction,
  };
}
