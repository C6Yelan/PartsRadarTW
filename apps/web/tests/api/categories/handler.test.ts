// apps/web/tests/api/categories/handler.test.ts
// 驗證公開分類 API handler 的 enabled 篩選、來源排序、response shape 與安全錯誤回應。

import { getPublicProductFacetDefinitions } from "@partsradar/shared";
import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../../../app/api/_shared/responses";
import {
  type CategoriesReadClient,
  createGetCategoriesHandler,
} from "../../../app/api/categories/handler";

describe("GET /api/categories handler", () => {
  it("returns enabled categories in source order with public-safe fields", async () => {
    const client = fakeCategoriesClient([
      category({
        id: "category-disabled",
        igrp: 99,
        enabled: false,
      }),
      category({
        id: "category-5",
        igrp: 5,
        displayName: "主機板",
        sourceName: "主機板 MB",
      }),
      category({
        id: "category-4",
        igrp: 4,
        displayName: "CPU",
        sourceName: "處理器 CPU",
      }),
    ]);

    const response = await createGetCategoriesHandler(client)();

    expect(response.status).toBe(200);
    expect(client.lastFindManyArgs).toEqual({
      where: { enabled: true },
      orderBy: { igrp: "asc" },
      select: {
        id: true,
        igrp: true,
        displayName: true,
        sourceName: true,
      },
    });
    expect(client.lastAvailabilityIgrp).toBeUndefined();
    expect(await response.json()).toEqual({
      data: [
        {
          id: "category-4",
          slug: "cpu",
          displayName: "CPU",
          sourceName: "處理器 CPU",
          facets: getPublicProductFacetDefinitions(4),
        },
        {
          id: "category-5",
          slug: "motherboard",
          displayName: "主機板",
          sourceName: "主機板 MB",
          facets: getPublicProductFacetDefinitions(5),
        },
      ],
    });
  });

  it("returns optional facet option groups without changing existing option fields", async () => {
    const response = await createGetCategoriesHandler(
      fakeCategoriesClient([
        category({
          id: "category-5",
          igrp: 5,
          displayName: "主機板",
          sourceName: "主機板 MB",
        }),
      ]),
    )();
    const body = await response.json();
    const facets = body.data[0].facets;
    const socketFacet = facets.find((facet: { key: string }) => facet.key === "socket");
    const chipsetFacet = facets.find((facet: { key: string }) => facet.key === "chipset");
    const socketOption = facets
      .find((facet: { key: string }) => facet.key === "socket")
      .options.find((option: { value: string }) => option.value === "lga1700");
    const chipsetOption = facets
      .find((facet: { key: string }) => facet.key === "chipset")
      .options.find((option: { value: string }) => option.value === "b760");

    expect(socketOption).toEqual({ value: "lga1700", label: "LGA 1700" });
    expect(socketOption).not.toHaveProperty("group");
    expect(socketFacet).not.toHaveProperty("menuColumns");
    expect(chipsetFacet.menuColumns).toBe(3);
    expect(chipsetOption).toEqual({
      value: "b760",
      label: "B760",
      group: "Intel LGA 1700",
    });
  });

  it("publishes only SSD capacity buckets backed by active priced products", async () => {
    const client = fakeCategoriesClient(
      [category({ id: "category-7", igrp: 7, displayName: "SSD", sourceName: "SSD" })],
      ["capacity_bucket:240-256", "capacity_bucket:about-1tb"],
    );
    const response = await createGetCategoriesHandler(client)();
    const body = await response.json();

    expect(client.lastAvailabilityIgrp).toBe(7);
    expect(
      body.data[0].facets.find((facet: { key: string }) => facet.key === "capacity_gb"),
    ).toBeUndefined();
    expect(
      body.data[0].facets
        .find((facet: { key: string }) => facet.key === "capacity_bucket")
        .options.map((option: { value: string }) => option.value),
    ).toEqual(["240-256", "about-1tb"]);
  });

  it("returns a generic 500 response when an enabled category has no public slug", async () => {
    const response = await createGetCategoriesHandler(
      fakeCategoriesClient([category({ igrp: 99 })]),
    )();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });

  it("returns a generic 500 response when the category query fails", async () => {
    const response = await createGetCategoriesHandler({
      sourceCategory: {
        findMany: async () => {
          throw new Error("DATABASE_URL=postgresql://partsradar:secret@localhost:5432/db");
        },
      },
      readAvailableProductFacetTags: async () => [],
    })();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });

  it("returns a generic 500 response instead of partial SSD facets when availability fails", async () => {
    const response = await createGetCategoriesHandler({
      sourceCategory: {
        findMany: async () => [
          category({ id: "category-7", igrp: 7, displayName: "SSD", sourceName: "SSD" }),
        ],
      },
      readAvailableProductFacetTags: async () => {
        throw new Error("statement timeout");
      },
    })();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: API_ERROR_MESSAGES.internalError,
      },
    });
  });
});

type FindManyArgs = Parameters<CategoriesReadClient["sourceCategory"]["findMany"]>[0];

interface FakeCategory {
  id: string;
  igrp: number;
  displayName: string;
  sourceName: string;
  enabled: boolean;
}

function fakeCategoriesClient(categories: FakeCategory[], availableSsdTags: string[] = []) {
  const client = {
    lastFindManyArgs: undefined as FindManyArgs | undefined,
    lastAvailabilityIgrp: undefined as number | undefined,
  };

  return {
    get lastFindManyArgs() {
      return client.lastFindManyArgs;
    },
    get lastAvailabilityIgrp() {
      return client.lastAvailabilityIgrp;
    },
    sourceCategory: {
      async findMany(args) {
        client.lastFindManyArgs = args;

        return categories
          .filter((candidate) => (args.where.enabled ? candidate.enabled : true))
          .sort((left, right) => left.igrp - right.igrp);
      },
    },
    async readAvailableProductFacetTags(igrp) {
      client.lastAvailabilityIgrp = igrp;
      return availableSsdTags;
    },
  } satisfies CategoriesReadClient & {
    lastFindManyArgs?: FindManyArgs;
    lastAvailabilityIgrp?: number;
  };
}

function category(overrides: Partial<FakeCategory> = {}): FakeCategory {
  return {
    id: "category-4",
    igrp: 4,
    displayName: "CPU",
    sourceName: "處理器 CPU",
    enabled: true,
    ...overrides,
  };
}
