import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../_shared/responses";
import { type CategoriesReadClient, createGetCategoriesHandler } from "./handler";

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
        lastCheckedAt: null,
        lastSuccessAt: null,
      }),
      category({
        id: "category-4",
        igrp: 4,
        displayName: "CPU",
        sourceName: "處理器 CPU",
        lastCheckedAt: new Date("2026-05-28T08:30:00.000Z"),
        lastSuccessAt: new Date("2026-05-28T08:25:00.000Z"),
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
        enabled: true,
        lastCheckedAt: true,
        lastSuccessAt: true,
      },
    });
    expect(await response.json()).toEqual({
      data: [
        {
          id: "category-4",
          source: "coolpc",
          igrp: 4,
          displayName: "CPU",
          sourceName: "處理器 CPU",
          enabled: true,
          lastCheckedAt: "2026-05-28T08:30:00.000Z",
          lastSuccessAt: "2026-05-28T08:25:00.000Z",
        },
        {
          id: "category-5",
          source: "coolpc",
          igrp: 5,
          displayName: "主機板",
          sourceName: "主機板 MB",
          enabled: true,
          lastCheckedAt: null,
          lastSuccessAt: null,
        },
      ],
    });
  });

  it("returns a generic 500 response when the category query fails", async () => {
    const response = await createGetCategoriesHandler({
      sourceCategory: {
        findMany: async () => {
          throw new Error("DATABASE_URL=postgresql://partsradar:secret@localhost:5432/db");
        },
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
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
}

function fakeCategoriesClient(categories: FakeCategory[]) {
  const client = {
    lastFindManyArgs: undefined as FindManyArgs | undefined,
  };

  return {
    get lastFindManyArgs() {
      return client.lastFindManyArgs;
    },
    sourceCategory: {
      async findMany(args) {
        client.lastFindManyArgs = args;

        return categories
          .filter((candidate) => (args.where.enabled ? candidate.enabled : true))
          .sort((left, right) => left.igrp - right.igrp);
      },
    },
  } satisfies CategoriesReadClient & { lastFindManyArgs?: FindManyArgs };
}

function category(overrides: Partial<FakeCategory> = {}): FakeCategory {
  return {
    id: "category-4",
    igrp: 4,
    displayName: "CPU",
    sourceName: "處理器 CPU",
    enabled: true,
    lastCheckedAt: null,
    lastSuccessAt: null,
    ...overrides,
  };
}
