import { describe, expect, it } from "vitest";

import { API_ERROR_MESSAGES } from "../_shared/responses";
import { createGetSourceStatusHandler, type SourceStatusReadClient } from "./handler";

const NOW = new Date("2026-05-28T12:00:00.000Z");

describe("GET /api/source-status handler", () => {
  it("returns ok when every enabled category has recent successful data", async () => {
    const client = fakeSourceStatusClient([
      category({
        igrp: 5,
        displayName: "主機板",
        sourceName: "主機板 MB",
        lastCheckedAt: new Date("2026-05-28T11:55:00.000Z"),
        lastSuccessAt: new Date("2026-05-28T11:50:00.000Z"),
        products: [{ id: "product-2" }],
      }),
      category({
        igrp: 4,
        displayName: "CPU",
        sourceName: "處理器 CPU",
        lastCheckedAt: new Date("2026-05-28T11:58:00.000Z"),
        lastSuccessAt: new Date("2026-05-28T11:40:00.000Z"),
        products: [{ id: "product-1" }],
      }),
    ]);

    const response = await createGetSourceStatusHandler(client, { now: () => NOW })();

    expect(response.status).toBe(200);
    expect(client.lastFindManyArgs).toEqual({
      where: { enabled: true },
      orderBy: { igrp: "asc" },
      select: {
        igrp: true,
        displayName: true,
        sourceName: true,
        lastCheckedAt: true,
        lastSuccessAt: true,
        products: {
          where: {
            isActive: true,
            currentPrice: {
              isNot: null,
            },
          },
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });
    expect(await response.json()).toEqual({
      source: "coolpc",
      status: "ok",
      lastCheckedAt: "2026-05-28T11:58:00.000Z",
      lastSuccessAt: "2026-05-28T11:40:00.000Z",
      categories: [
        {
          igrp: 4,
          displayName: "CPU",
          sourceName: "處理器 CPU",
          status: "ok",
          lastCheckedAt: "2026-05-28T11:58:00.000Z",
          lastSuccessAt: "2026-05-28T11:40:00.000Z",
        },
        {
          igrp: 5,
          displayName: "主機板",
          sourceName: "主機板 MB",
          status: "ok",
          lastCheckedAt: "2026-05-28T11:55:00.000Z",
          lastSuccessAt: "2026-05-28T11:50:00.000Z",
        },
      ],
    });
  });

  it("returns stale globally when at least one category has old but visible data", async () => {
    const client = fakeSourceStatusClient([
      category({
        igrp: 4,
        lastCheckedAt: new Date("2026-05-28T11:59:00.000Z"),
        lastSuccessAt: new Date("2026-05-28T11:20:00.000Z"),
        products: [{ id: "product-1" }],
      }),
      category({
        igrp: 5,
        displayName: "主機板",
        sourceName: "主機板 MB",
        lastCheckedAt: new Date("2026-05-28T11:58:00.000Z"),
        lastSuccessAt: null,
        products: [],
      }),
    ]);

    const response = await createGetSourceStatusHandler(client, { now: () => NOW })();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "stale",
      categories: [
        {
          igrp: 4,
          status: "stale",
        },
        {
          igrp: 5,
          status: "unavailable",
        },
      ],
    });
  });

  it("returns unavailable when enabled categories have no visible product data", async () => {
    const client = fakeSourceStatusClient([
      category({
        igrp: 4,
        lastCheckedAt: new Date("2026-05-28T11:10:00.000Z"),
        lastSuccessAt: null,
        products: [],
      }),
    ]);

    const response = await createGetSourceStatusHandler(client, { now: () => NOW })();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: "coolpc",
      status: "unavailable",
      lastCheckedAt: "2026-05-28T11:10:00.000Z",
      lastSuccessAt: null,
      categories: [
        {
          igrp: 4,
          displayName: "CPU",
          sourceName: "處理器 CPU",
          status: "unavailable",
          lastCheckedAt: "2026-05-28T11:10:00.000Z",
          lastSuccessAt: null,
        },
      ],
    });
  });

  it("returns unavailable when there are no enabled categories", async () => {
    const response = await createGetSourceStatusHandler(fakeSourceStatusClient([]), {
      now: () => NOW,
    })();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      source: "coolpc",
      status: "unavailable",
      lastCheckedAt: null,
      lastSuccessAt: null,
      categories: [],
    });
  });

  it("returns a generic 500 response when the source status query fails", async () => {
    const response = await createGetSourceStatusHandler({
      sourceCategory: {
        findMany: async () => {
          throw new Error("PrismaClientKnownRequestError: raw crawler stack with token");
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

type FindManyArgs = Parameters<SourceStatusReadClient["sourceCategory"]["findMany"]>[0];
type SourceStatusCategory = Awaited<
  ReturnType<SourceStatusReadClient["sourceCategory"]["findMany"]>
>[number];

function fakeSourceStatusClient(categories: SourceStatusCategory[]) {
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

        return categories.sort((left, right) => left.igrp - right.igrp);
      },
    },
  } satisfies SourceStatusReadClient & { lastFindManyArgs?: FindManyArgs };
}

function category(overrides: Partial<SourceStatusCategory> = {}): SourceStatusCategory {
  return {
    igrp: 4,
    displayName: "CPU",
    sourceName: "處理器 CPU",
    lastCheckedAt: null,
    lastSuccessAt: null,
    products: [{ id: "product-1" }],
    ...overrides,
  };
}
