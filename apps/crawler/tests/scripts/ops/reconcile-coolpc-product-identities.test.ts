import type { PrismaClient } from "@partsradar/db";
import { describe, expect, it, vi } from "vitest";
import {
  findHistoricalReconciliationPairs,
  hasTargetWatchConflict,
  mergeReconciliationPair,
  parseReconciliationOptions,
  type ReconciliationProduct,
  reconcileCoolpcProductIdentities,
} from "../../../src/scripts/ops/reconcile-coolpc-product-identities";

describe("CoolPC product identity reconciliation", () => {
  it("defaults to dry-run and requires the exact apply flag", () => {
    expect(parseReconciliationOptions([])).toEqual({ dryRun: true });
    expect(parseReconciliationOptions(["--apply"])).toEqual({ dryRun: false });
    expect(() => parseReconciliationOptions(["--confirm-write"])).toThrow(
      "Unknown option: --confirm-write",
    );
  });

  it("does not open a write transaction for a matched dry-run pair", async () => {
    const keeper = product({ id: "old", ibuyToken: "old-token" });
    const duplicate = product({
      id: "new",
      ibuyToken: "new-token",
      name: "｛華碩 PRO WS W680-ACE｝ATX/DDR5",
      firstSeenAt: new Date("2026-08-19T13:02:00.000Z"),
      lastSeenAt: new Date("2026-08-19T13:04:00.000Z"),
      createdAt: new Date("2026-08-19T13:02:00.000Z"),
    });
    const client = { $transaction: vi.fn() } as unknown as PrismaClient;

    await expect(
      reconcileCoolpcProductIdentities(client, [keeper, duplicate], { dryRun: true }),
    ).resolves.toMatchObject({ matched: 1, conflicts: 0, applied: 0 });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("finds only a unique, time-contiguous pair with equal boundary prices", () => {
    const keeper = product({ id: "old", ibuyToken: "old-token" });
    const duplicate = product({
      id: "new",
      ibuyToken: "new-token",
      name: "｛華碩 PRO WS W680-ACE｝ATX/DDR5",
      firstSeenAt: new Date("2026-08-19T13:02:00.000Z"),
      lastSeenAt: new Date("2026-08-19T13:04:00.000Z"),
      createdAt: new Date("2026-08-19T13:02:00.000Z"),
    });

    expect(findHistoricalReconciliationPairs([keeper, duplicate])).toEqual({
      pairs: [{ keeper, duplicate }],
      ambiguous: 0,
      skipped: 0,
    });

    const overlapping = product({
      ...duplicate,
      id: "overlap",
      firstSeenAt: new Date("2026-08-19T12:20:00.000Z"),
    });
    expect(findHistoricalReconciliationPairs([keeper, overlapping])).toMatchObject({
      pairs: [],
      skipped: 1,
    });
  });

  it("reports multiple valid partners as ambiguous", () => {
    const products = [
      product({ id: "one", ibuyToken: "one" }),
      product({
        id: "two",
        ibuyToken: "two",
        firstSeenAt: new Date("2026-08-19T13:02:00.000Z"),
        lastSeenAt: new Date("2026-08-19T13:04:00.000Z"),
        createdAt: new Date("2026-08-19T13:02:00.000Z"),
      }),
      product({
        id: "three",
        ibuyToken: "three",
        firstSeenAt: new Date("2026-08-19T13:30:00.000Z"),
        lastSeenAt: new Date("2026-08-19T13:32:00.000Z"),
        createdAt: new Date("2026-08-19T13:30:00.000Z"),
      }),
    ];

    expect(findHistoricalReconciliationPairs(products)).toMatchObject({
      pairs: [],
      ambiguous: 1,
      skipped: 0,
    });
  });

  it("detects a target-watch unique-key conflict by Discord user", () => {
    const keeper = product({ discordUsers: ["user-1"] });
    const duplicate = product({ id: "new", ibuyToken: "new-token", discordUsers: ["user-1"] });

    expect(hasTargetWatchConflict(keeper, duplicate)).toBe(true);
  });

  it("returns a watch conflict before moving any rows", async () => {
    const keeper = product({ discordUsers: ["user-1"] });
    const duplicate = product({
      id: "new",
      ibuyToken: "new-token",
      name: "｛華碩 PRO WS W680-ACE｝ATX/DDR5",
      firstSeenAt: new Date("2026-08-19T13:02:00.000Z"),
      lastSeenAt: new Date("2026-08-19T13:04:00.000Z"),
      createdAt: new Date("2026-08-19T13:02:00.000Z"),
      discordUsers: ["user-1"],
    });
    const transaction = createTransaction(keeper, duplicate, () => true);
    const client = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(mergeReconciliationPair(client, { keeper, duplicate })).resolves.toBe("conflict");
    expect(transaction.productFacetEligibleProduct.findMany).not.toHaveBeenCalled();
    expect(transaction.currentPrice.deleteMany).not.toHaveBeenCalled();
  });

  it("moves dependent rows, rebuilds current price, and becomes a no-op after deletion", async () => {
    const keeper = product({ id: "old", ibuyToken: "old-token", currentSnapshotId: "old-price" });
    const duplicate = product({
      id: "new",
      ibuyToken: "new-token",
      name: "｛華碩 PRO WS W680-ACE｝ATX/DDR5",
      firstSeenAt: new Date("2026-08-19T13:02:00.000Z"),
      lastSeenAt: new Date("2026-08-19T13:04:00.000Z"),
      createdAt: new Date("2026-08-19T13:02:00.000Z"),
      currentSnapshotId: "new-price",
    });
    let duplicateExists = true;
    const transaction = createTransaction(keeper, duplicate, () => duplicateExists);
    transaction.product.delete.mockImplementation(async () => {
      duplicateExists = false;
      return { id: duplicate.id };
    });
    const client = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    } as unknown as PrismaClient;

    await expect(mergeReconciliationPair(client, { keeper, duplicate })).resolves.toBe("applied");
    expect(transaction.priceSnapshot.updateMany).toHaveBeenCalledWith({
      where: { productId: "new" },
      data: { productId: "old" },
    });
    expect(transaction.discordTargetPriceWatch.updateMany).toHaveBeenCalled();
    expect(transaction.discordNotificationDelivery.updateMany).toHaveBeenCalled();
    expect(transaction.productFacetEligibleProduct.upsert).toHaveBeenCalled();
    expect(transaction.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "old" },
        data: expect.objectContaining({ ibuyToken: "new-token" }),
      }),
    );
    expect(transaction.currentPrice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "old",
        priceSnapshotId: "new-price",
      }),
      select: { productId: true },
    });

    await expect(mergeReconciliationPair(client, { keeper, duplicate })).resolves.toBe(
      "already_applied",
    );
  });
});

function product({
  id = "old",
  ibuyToken = "old-token",
  name = "華碩 PRO WS W680-ACE(ATX/DDR5)",
  firstSeenAt = new Date("2026-08-19T12:00:00.000Z"),
  lastSeenAt = new Date("2026-08-19T12:32:00.000Z"),
  createdAt = new Date("2026-08-19T12:00:00.000Z"),
  currentSnapshotId = `${id}-price`,
  discordUsers = [],
}: {
  id?: string;
  ibuyToken?: string;
  name?: string;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  createdAt?: Date;
  currentSnapshotId?: string;
  discordUsers?: string[];
}): ReconciliationProduct {
  return {
    id,
    sourceCategoryId: "category-5",
    ibuyToken,
    name,
    normalizedName: name.toLowerCase(),
    vendorSlug: "asus",
    vendorName: "華碩",
    filterTags: ["form_factor:atx"],
    primaryImageUrl: "https://www.coolpc.com.tw/eval/5/w680.jpg",
    primaryImageCheckedAt: lastSeenAt,
    imageCachedAt: null,
    imageCacheCheckedAt: null,
    imageCacheFailureCount: 0,
    imageCacheLastError: null,
    imageCacheLastErrorKind: null,
    imageCacheLastHttpStatus: null,
    imageCacheFailureSince: null,
    imageCacheLastSuccessAt: null,
    imageCacheNextRetryAt: null,
    sourceUrl: "https://www.coolpc.com.tw/eachview.php?IGrp=5",
    isActive: true,
    isExcluded: false,
    exclusionReason: null,
    missingSince: null,
    missingSeenCount: 0,
    firstSeenAt,
    lastSeenAt,
    createdAt,
    sourceCategory: { igrp: 5 },
    currentPrice: {
      priceSnapshotId: currentSnapshotId,
      lastSeenAt,
      priceChangedAt: firstSeenAt,
      priceSnapshot: { price: 12990, currency: "TWD" },
    },
    priceSnapshots: [
      { id: currentSnapshotId, price: 12990, currency: "TWD", capturedAt: firstSeenAt },
    ],
    discordTargetWatches: discordUsers.map((discordUserId) => ({ discordUserId })),
  };
}

function createTransaction(
  keeper: ReconciliationProduct,
  duplicate: ReconciliationProduct,
  duplicateExists: () => boolean,
) {
  return {
    product: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === keeper.id ? keeper : duplicateExists() ? duplicate : null,
      ),
      delete: vi.fn(),
      update: vi.fn(async () => ({ id: keeper.id })),
    },
    currentPrice: {
      deleteMany: vi.fn(async () => ({ count: 2 })),
      create: vi.fn(async () => ({ productId: keeper.id })),
    },
    priceSnapshot: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(async () => ({
        id: duplicate.currentPrice?.priceSnapshotId,
        capturedAt: duplicate.firstSeenAt,
      })),
    },
    discordNotificationDelivery: { updateMany: vi.fn(async () => ({ count: 0 })) },
    discordTargetPriceWatch: { updateMany: vi.fn(async () => ({ count: 0 })) },
    productFacetEligibleProduct: {
      findMany: vi.fn(async () => [{ igrp: 5, tag: "form_factor:atx" }]),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}
