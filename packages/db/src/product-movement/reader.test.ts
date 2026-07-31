import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  createProductMovementPageQuery,
  createProductMovementSummaryQuery,
  PRODUCT_MOVEMENT_CANDIDATE_LIMIT,
  PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS,
  PRODUCT_MOVEMENT_TRANSACTION_TIMEOUT_MS,
  ProductMovementReadUnavailableError,
  ProductMovementWorkBudgetExceededError,
  readBoundedProductMovementPage,
  readBoundedProductMovementSummaries,
  type ProductMovementReadClient,
} from "./reader";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const IDS = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
] as const;
const VALID_INDEX_STATE = {
  accessMethod: "btree",
  hasNoPredicate: true,
  isLive: true,
  isReady: true,
  isValid: true,
  keyAttributeCount: 3,
  keyNames: ["product_id", "captured_at", "id"],
  keyOptions: [0, 3, 3],
  tableName: "price_snapshots",
  tableSchema: "public",
  totalAttributeCount: 3,
};

describe("bounded product movement reader", () => {
  it("uses one bounded summary query and returns at most one row per page product", async () => {
    const client = fakeClient([
      finalRow(IDS[0], -100, -10, 2),
      finalRow(IDS[1], null, null, 2),
    ]);

    await expect(readBoundedProductMovementSummaries(client, IDS, NOW)).resolves.toEqual([
      { productId: IDS[0], deltaAmount: -100, deltaPercent: -10 },
      { productId: IDS[1], deltaAmount: null, deltaPercent: null },
    ]);
    expect(client.options).toEqual({
      isolationLevel: "RepeatableRead",
      timeout: PRODUCT_MOVEMENT_TRANSACTION_TIMEOUT_MS,
    });
    expect(client.queries).toHaveLength(3);
    expect(client.queries[0]?.sql).toContain("statement_timeout");
    expect(client.queries[0]?.sql).toContain("enable_seqscan");
    expect(client.queries[0]?.values).toContain(`${PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS}ms`);
    expect(client.queries[1]?.values).toContain("price_snapshots_product_id_captured_at_id_idx");
    expect(client.queries[2]?.sql).toContain("LIMIT 1");
    expect(client.queries[2]?.sql).toContain("LIMIT 2");
    expect(client.queries[2]?.values).toEqual(expect.arrayContaining([...IDS]));
  });

  it("keeps filtered candidates in the DB and returns only the requested movement page", async () => {
    const client = fakeClient([finalRow(IDS[0], -100, -10, 2)]);

    await expect(
      readBoundedProductMovementPage(client, {
        filters: {
          facetTags: ["gpu_chip:nvidia", "gpu_chip:amd", "vram:12gb"],
          igrp: 12,
          minPrice: 100,
          maxPrice: 50_000,
          q: "100% _gpu'",
          status: "active",
          vendors: ["asus"],
        },
        sort: "price_drop_desc",
        page: 1,
        pageSize: 1,
        now: NOW,
      }),
    ).resolves.toEqual({
      productIds: [IDS[0]],
      summaries: [{ productId: IDS[0], deltaAmount: -100, deltaPercent: -10 }],
      totalItems: 2,
    });

    const query = client.queries[2];
    expect(query?.sql).toContain("WITH candidates AS MATERIALIZED");
    expect(query?.sql).toContain("LIMIT ?");
    expect(query?.sql).toContain("ILIKE ('%' || ? || '%')");
    expect(query?.sql).toContain("product.filter_tags && ARRAY[");
    expect(query?.sql).toContain("candidate_state.total_items <=");
    expect(query?.values).toContain(PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1);
    expect(query?.values).toContain("100%");
    expect(query?.values).toContain("_gpu'");
  });

  it("fails closed on candidate cap plus one without returning partial totals", async () => {
    const client = fakeClient([
      finalRow(null, null, null, PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1, true),
    ]);

    await expect(
      readBoundedProductMovementPage(client, {
        filters: { facetTags: [], status: "active", vendors: [] },
        sort: "price_rise_desc",
        page: 1,
        pageSize: 20,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ProductMovementWorkBudgetExceededError);
  });

  it("uses a fixed empty-page offset for huge safe pages while preserving exact total", async () => {
    const client = fakeClient([finalRow(null, null, null, 2)]);

    await expect(
      readBoundedProductMovementPage(client, {
        filters: { facetTags: [], status: "active", vendors: [] },
        sort: "price_rise_desc",
        page: Number.MAX_SAFE_INTEGER,
        pageSize: 100,
        now: NOW,
      }),
    ).resolves.toEqual({ productIds: [], summaries: [], totalItems: 2 });
    expect(client.queries[2]?.values).toContain(PRODUCT_MOVEMENT_CANDIDATE_LIMIT + 1);
  });

  it("rejects duplicate rows, timeout errors, and a missing index contract", async () => {
    const duplicate = fakeClient([finalRow(IDS[0], 1, 1, 2), finalRow(IDS[0], 1, 1, 2)]);
    await expect(readBoundedProductMovementSummaries(duplicate, IDS, NOW)).rejects.toBeInstanceOf(
      ProductMovementReadUnavailableError,
    );

    const timeout = fakeClient([], {
      finalError: { code: "P2010", meta: { code: "57014" } },
    });
    await expect(readBoundedProductMovementSummaries(timeout, IDS, NOW)).rejects.toBeInstanceOf(
      ProductMovementReadUnavailableError,
    );

    const missingIndex = fakeClient([], { indexRows: [] });
    await expect(readBoundedProductMovementSummaries(missingIndex, IDS, NOW)).rejects.toBeInstanceOf(
      ProductMovementReadUnavailableError,
    );
  });

  it("fails closed when the snapshot index is partial or not the exact key contract", async () => {
    for (const indexState of [
      { hasNoPredicate: false },
      { keyAttributeCount: 2 },
      { totalAttributeCount: 4 },
      { keyNames: ["product_id", "id", "captured_at"] },
      { keyOptions: [0, 0, 3] },
      { isValid: false },
    ]) {
      const client = fakeClient([], { indexRows: [{ ...VALID_INDEX_STATE, ...indexState }] });
      await expect(readBoundedProductMovementSummaries(client, IDS, NOW)).rejects.toBeInstanceOf(
        ProductMovementReadUnavailableError,
      );
      expect(client.queries).toHaveLength(2);
    }

    const catalogFailure = fakeClient([], { indexError: new Error("catalog unavailable") });
    await expect(
      readBoundedProductMovementSummaries(catalogFailure, IDS, NOW),
    ).rejects.toBeInstanceOf(ProductMovementReadUnavailableError);
  });

  it("fails closed when the transaction work guard cannot be applied exactly", async () => {
    const configFailure = fakeClient([], { configError: new Error("set_config unavailable") });
    await expect(
      readBoundedProductMovementSummaries(configFailure, IDS, NOW),
    ).rejects.toBeInstanceOf(ProductMovementReadUnavailableError);
    expect(configFailure.queries).toHaveLength(1);

    const invalidSeqScan = fakeClient([], {
      configRows: [validConfigState({ seqScan: "on" })],
    });
    await expect(
      readBoundedProductMovementSummaries(invalidSeqScan, IDS, NOW),
    ).rejects.toBeInstanceOf(ProductMovementReadUnavailableError);
    expect(invalidSeqScan.queries).toHaveLength(1);
  });

  it("builds only allowlisted movement ordering and parameterized values", () => {
    const summary = createProductMovementSummaryQuery(IDS, NOW);
    const drop = createProductMovementPageQuery(
      { facetTags: [], status: "all", vendors: [] },
      "price_drop_desc",
      NOW,
      0,
      20,
    );
    const rise = createProductMovementPageQuery(
      { facetTags: [], status: "all", vendors: [] },
      "price_rise_desc",
      NOW,
      0,
      20,
    );
    expect(summary.sql).toContain("movement.ordinal ASC");
    expect(drop.sql).toContain("movement.delta_percent END ASC");
    expect(rise.sql).toContain("movement.delta_percent END DESC");
    expect(drop.sql).not.toContain(IDS[0]);
    expect(drop.values).not.toContain("price_drop_desc");
  });
});

function fakeClient(
  finalRows: unknown[],
  options: {
    configError?: unknown;
    configRows?: unknown[];
    finalError?: unknown;
    indexError?: unknown;
    indexRows?: unknown[];
  } = {},
): ProductMovementReadClient & {
  options?: { isolationLevel?: "RepeatableRead"; timeout?: number };
  queries: Prisma.Sql[];
} {
  const queries: Prisma.Sql[] = [];
  const client = {
    queries,
    options: undefined as { isolationLevel?: "RepeatableRead"; timeout?: number } | undefined,
    async $transaction<T>(
      callback: Parameters<ProductMovementReadClient["$transaction"]>[0],
      transactionOptions?: Parameters<ProductMovementReadClient["$transaction"]>[1],
    ): Promise<T> {
      client.options = transactionOptions;
      let call = 0;
      return callback({
        async $queryRaw<R>(query: Prisma.Sql): Promise<R> {
          queries.push(query);
          call += 1;
          if (call === 1) {
            if (options.configError) throw options.configError;
            return (options.configRows ?? [validConfigState()]) as R;
          }
          if (call === 2) {
            if (options.indexError) throw options.indexError;
            return (options.indexRows ?? [VALID_INDEX_STATE]) as R;
          }
          if (options.finalError) throw options.finalError;
          return finalRows as R;
        },
      }) as Promise<T>;
    },
  };
  return client;
}

function validConfigState(overrides: { seqScan?: string } = {}) {
  return {
    bitmapScan: "off",
    indexOnlyScan: "on",
    indexScan: "on",
    seqScan: "off",
    statementTimeout: `${PRODUCT_MOVEMENT_STATEMENT_TIMEOUT_MS}ms`,
    ...overrides,
  };
}

function finalRow(
  productId: string | null,
  deltaAmount: number | null,
  deltaPercent: number | null,
  totalItems: number,
  overflow = false,
) {
  return { productId, deltaAmount, deltaPercent, totalItems, overflow };
}
