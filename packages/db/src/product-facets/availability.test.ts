// packages/db/src/product-facets/availability.test.ts
// 驗證 facet availability query 僅使用 registry candidates，且結果維持有限穩定順序。

import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  createAvailableProductFacetTagsQuery,
  readAvailableProductFacetTags,
} from "./availability";

describe("product facet availability query", () => {
  it("parameterizes the finite registry candidates and keeps canonical ordering", async () => {
    let capturedQuery: Prisma.Sql | undefined;
    const client = {
      async $queryRaw<T>(query: Prisma.Sql): Promise<T> {
        capturedQuery = query;
        return [
          { tag: "capacity_bucket:about-1tb" },
          { tag: "legacy:unknown" },
          { tag: "capacity_bucket:240-256" },
          { tag: "capacity_bucket:about-1tb" },
        ] as T;
      },
    };

    await expect(readAvailableProductFacetTags(client, 7)).resolves.toEqual([
      "capacity_bucket:240-256",
      "capacity_bucket:about-1tb",
    ]);
    expect(capturedQuery?.sql).toContain("SELECT DISTINCT product_tag.tag");
    expect(capturedQuery?.sql).toContain("INNER JOIN current_prices");
    expect(capturedQuery?.sql).toContain("product.filter_tags &&");
    expect(capturedQuery?.sql).toContain("unnest(product.filter_tags)");
    expect(capturedQuery?.sql).not.toContain("capacity_bucket:about-1tb");
    expect(capturedQuery?.values).toContain("capacity_bucket:about-1tb");
    expect(capturedQuery?.values).toContain(7);
  });

  it("does not query when a category has no availability-controlled public facets", async () => {
    let queryCount = 0;
    const client = {
      async $queryRaw<T>(): Promise<T> {
        queryCount += 1;
        return [] as T;
      },
    };

    await expect(readAvailableProductFacetTags(client, 4)).resolves.toEqual([]);
    expect(queryCount).toBe(0);
  });

  it("rejects an empty raw-query candidate list", () => {
    expect(() => createAvailableProductFacetTagsQuery(7, [])).toThrow(
      "At least one product facet candidate tag is required.",
    );
  });
});
