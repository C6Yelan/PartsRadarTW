// packages/db/src/product-facets/availability.test.ts
// 驗證 facet availability query 僅使用 registry candidates，且結果維持有限穩定順序。

import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  createAvailableProductFacetTagsQuery,
  PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS,
  ProductFacetAvailabilityContractError,
  readAvailableProductFacetTags,
} from "./availability";

describe("product facet availability query", () => {
  it("applies a local timeout and uses parameterized registry-driven B-tree probes", async () => {
    const capturedQueries: Prisma.Sql[] = [];
    const client = fakeAvailabilityClient((query) => {
      capturedQueries.push(query);
      if (query.sql.includes("set_config")) {
        return [{ applied: true }];
      }
      if (query.sql.includes("pg_index AS index_metadata")) {
        return [{ ready: true }];
      }
      return [{ tag: "capacity_bucket:about-1tb" }, { tag: "capacity_bucket:240-256" }];
    });

    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([
      "capacity_bucket:240-256",
      "capacity_bucket:about-1tb",
    ]);
    expect(capturedQueries).toHaveLength(3);
    expect(capturedQueries[0]?.sql).toContain("set_config");
    expect(capturedQueries[0]?.sql).toContain("current_setting('statement_timeout')");
    expect(capturedQueries[0]?.sql).toContain("current_setting('enable_seqscan') = 'off'");
    expect(capturedQueries[0]?.sql).toContain("current_setting('enable_bitmapscan') = 'off'");
    expect(capturedQueries[0]?.sql).toContain("current_setting('enable_indexscan') = 'on'");
    expect(capturedQueries[0]?.sql).toContain("current_setting('enable_indexonlyscan') = 'on'");
    expect(capturedQueries[0]?.values).toEqual([
      `${PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS}ms`,
      `${PRODUCT_FACET_AVAILABILITY_STATEMENT_TIMEOUT_MS} milliseconds`,
    ]);
    expect(capturedQueries[1]?.sql).toContain("product_facet_eligible_products_pkey");
    expect(capturedQueries[1]?.sql).toContain("index_metadata.indisvalid = TRUE");
    expect(capturedQueries[1]?.sql).toContain("index_metadata.indisready = TRUE");
    expect(capturedQueries[1]?.sql).toContain("USING btree (igrp, tag, product_id)");
    expect(capturedQueries[2]?.sql).toContain("CROSS JOIN LATERAL");
    expect(capturedQueries[2]?.sql).toContain("product_facet_eligible_products");
    expect(capturedQueries[2]?.sql).toContain("LIMIT 1");
    expect(capturedQueries[2]?.sql).not.toContain("products AS product");
    expect(capturedQueries[2]?.sql).not.toContain("capacity_bucket:about-1tb");
    expect(capturedQueries[2]?.values).toContain("capacity_bucket:about-1tb");
    expect(capturedQueries[2]?.values).toContain(7);
  });

  it("does not query when a category has no availability-controlled public facets", async () => {
    let transactionCount = 0;
    const client = {
      async $transaction<T>(): Promise<T> {
        transactionCount += 1;
        throw new Error("Unexpected transaction");
      },
    };

    await expect(readAvailableProductFacetTags(client, 4)).resolves.toEqual([]);
    expect(transactionCount).toBe(0);
  });

  it.each([
    {
      name: "statement timeout",
      resolver: (query: Prisma.Sql) =>
        query.sql.includes("set_config") ? [{ applied: false }] : [{ ready: true }],
    },
    {
      name: "projection index",
      resolver: (query: Prisma.Sql) =>
        query.sql.includes("set_config") ? [{ applied: true }] : [{ ready: false }],
    },
  ])("fails closed when the $name contract is not satisfied", async ({ resolver }) => {
    await expect(
      readAvailableProductFacetTags(fakeAvailabilityClient(resolver), 7),
    ).rejects.toBeInstanceOf(ProductFacetAvailabilityContractError);
  });

  it("fails closed when result rows violate the registry contract", async () => {
    const client = fakeAvailabilityClient((query) => {
      if (query.sql.includes("set_config")) {
        return [{ applied: true }];
      }
      if (query.sql.includes("pg_index AS index_metadata")) {
        return [{ ready: true }];
      }
      return [{ tag: "legacy:unknown" }];
    });

    await expect(readAvailableProductFacetTags(client, 7)).rejects.toBeInstanceOf(
      ProductFacetAvailabilityContractError,
    );
  });

  it("propagates query timeout errors instead of returning partial availability", async () => {
    const timeoutError = Object.assign(new Error("statement timeout"), { code: "57014" });
    const client = fakeAvailabilityClient((query) => {
      if (query.sql.includes("set_config")) {
        return [{ applied: true }];
      }
      if (query.sql.includes("pg_index AS index_metadata")) {
        return [{ ready: true }];
      }
      throw timeoutError;
    });

    await expect(readAvailableProductFacetTags(client, 7)).rejects.toBe(timeoutError);
  });

  it("rejects an empty raw-query candidate list", () => {
    expect(() => createAvailableProductFacetTagsQuery(7, [])).toThrow(
      "At least one product facet candidate tag is required.",
    );
  });
});

function fakeAvailabilityClient(resolveQuery: (query: Prisma.Sql) => unknown) {
  return {
    async $transaction<T>(
      callback: (transaction: { $queryRaw<R>(query: Prisma.Sql): Promise<R> }) => Promise<T>,
    ): Promise<T> {
      return callback({
        async $queryRaw<R>(query: Prisma.Sql): Promise<R> {
          return resolveQuery(query) as R;
        },
      });
    },
  };
}
