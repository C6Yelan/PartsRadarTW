// apps/crawler/tests/scripts/ops/price-change-discord-notification.test.ts
import { describe, expect, it, vi } from "vitest";
import type {
  DiscordWebhookSendOptions,
  DiscordWebhookSendResult,
} from "../../../src/scripts/ops/discord-webhook";
import {
  createPriceChangeDiscordMessages,
  createPersonalPriceReportMessages,
  createPriceChangeReportMessages,
  parsePriceChangeDiscordNotificationOptions,
  readCrawlRunPriceChanges,
  readCrawlRunPriceChangeSummary,
  readRecentPriceChanges,
  readRecentPriceReport,
  sendCrawlRunPriceChangeDiscordNotification,
  type PriceChangeDiscordClient,
  type PriceChangeDiscordNotificationItem,
} from "../../../src/scripts/ops/price-change-discord-notification";

const WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";
const PUBLIC_BASE_URL = "https://partsradar.test/";

describe("price change Discord notification options", () => {
  it("uses disabled public webhook defaults", () => {
    expect(parsePriceChangeDiscordNotificationOptions([], {})).toEqual({
      publicWebhookUrl: null,
      publicBaseUrl: "https://partsradar.net/",
      maxItems: 50,
    });
  });

  it("accepts public webhook, base URL, and max item overrides", () => {
    expect(
      parsePriceChangeDiscordNotificationOptions(["--price-change-discord-max-items", "75"], {
        DISCORD_PUBLIC_WEBHOOK_URL: WEBHOOK_URL,
        PARTSRADAR_PUBLIC_BASE_URL: "https://partsradar.test/app/",
        PRICE_CHANGE_DISCORD_MAX_ITEMS: "25",
      }),
    ).toEqual({
      publicWebhookUrl: WEBHOOK_URL,
      publicBaseUrl: "https://partsradar.test/app",
      maxItems: 75,
    });
  });

  it("rejects unsafe option values", () => {
    expect(() =>
      parsePriceChangeDiscordNotificationOptions(["--price-change-discord-max-items", "0"], {}),
    ).toThrow("must be an integer between 1 and 200");

    expect(() =>
      parsePriceChangeDiscordNotificationOptions([], {
        PARTSRADAR_PUBLIC_BASE_URL: "file:///tmp/app",
      }),
    ).toThrow("PARTSRADAR_PUBLIC_BASE_URL must be a valid HTTP(S) URL");
  });
});

describe("readCrawlRunPriceChanges", () => {
  it("returns changed existing products and skips first-seen or unchanged snapshots", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-1",
        productId: "product-1",
        productName: "Changed GPU",
        crawlRunId: "old-run",
        price: 10000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-1",
        productId: "product-1",
        productName: "Changed GPU",
        crawlRunId: "target-run",
        price: 9500,
        capturedAt: "2026-06-07T02:00:00.000Z",
      }),
      snapshot({
        id: "new-2",
        productId: "product-2",
        productName: "New Product",
        crawlRunId: "target-run",
        price: 1500,
        capturedAt: "2026-06-07T02:01:00.000Z",
      }),
      snapshot({
        id: "old-3",
        productId: "product-3",
        productName: "Unchanged PSU",
        crawlRunId: "old-run",
        price: 3200,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-3",
        productId: "product-3",
        productName: "Unchanged PSU",
        crawlRunId: "target-run",
        price: 3200,
        capturedAt: "2026-06-07T02:02:00.000Z",
      }),
    ]);

    await expect(readCrawlRunPriceChanges(client, "target-run")).resolves.toEqual([
      {
        productId: "product-1",
        productName: "Changed GPU",
        previousPrice: 10000,
        currentPrice: 9500,
        currency: "TWD",
        changedAt: new Date("2026-06-07T02:00:00.000Z"),
        delta: -500,
      },
    ]);
    expect(client.priceSnapshot.findMany).toHaveBeenCalledTimes(2);
  });

  it("orders larger absolute price moves first", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-small",
        productId: "small",
        productName: "Small Move",
        crawlRunId: "old-run",
        price: 1000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-small",
        productId: "small",
        productName: "Small Move",
        crawlRunId: "target-run",
        price: 1100,
        capturedAt: "2026-06-07T02:00:00.000Z",
      }),
      snapshot({
        id: "old-large",
        productId: "large",
        productName: "Large Move",
        crawlRunId: "old-run",
        price: 8000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-large",
        productId: "large",
        productName: "Large Move",
        crawlRunId: "target-run",
        price: 7200,
        capturedAt: "2026-06-07T02:01:00.000Z",
      }),
    ]);

    const changes = await readCrawlRunPriceChanges(client, "target-run");

    expect(changes.map((change) => change.productId)).toEqual(["large", "small"]);
  });
});

describe("readCrawlRunPriceChangeSummary", () => {
  it("reports current-run snapshots that cannot be matched to previous prices", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "new-product-snapshot",
        productId: "product-1",
        productName: "First Seen RAM",
        crawlRunId: "target-run",
        price: 1990,
        capturedAt: "2026-06-07T02:00:00.000Z",
      }),
    ]);

    await expect(readCrawlRunPriceChangeSummary(client, "target-run")).resolves.toEqual({
      changes: [],
      snapshotCount: 1,
      unmatchedSnapshotCount: 1,
      unchangedSnapshotCount: 0,
      currencyMismatchCount: 0,
    });
  });
});

describe("readRecentPriceChanges", () => {
  it("returns each product's latest price change inside the requested window", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "old-run",
        price: 10000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "mid-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "run-1",
        price: 9300,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "run-2",
        price: 9000,
        capturedAt: "2026-06-07T04:00:00.000Z",
      }),
      snapshot({
        id: "new-product",
        productId: "product-2",
        productName: "First Seen SSD",
        crawlRunId: "run-2",
        price: 2500,
        capturedAt: "2026-06-07T04:10:00.000Z",
      }),
    ]);

    await expect(
      readRecentPriceChanges(client, {
        since: new Date("2026-06-07T02:00:00.000Z"),
        until: new Date("2026-06-07T05:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        productId: "product-1",
        productName: "GPU A",
        previousPrice: 9300,
        currentPrice: 9000,
        currency: "TWD",
        changedAt: new Date("2026-06-07T04:00:00.000Z"),
        delta: -300,
      },
    ]);
  });
});

describe("readRecentPriceReport", () => {
  it("separates recent price changes from new products", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-gpu",
        productId: "gpu",
        productName: "Changed GPU",
        crawlRunId: "old-run",
        price: 12000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-gpu",
        productId: "gpu",
        productName: "Changed GPU",
        crawlRunId: "new-run",
        price: 10990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-ssd",
        productId: "ssd",
        productName: "Brand New SSD",
        crawlRunId: "new-run",
        price: 2490,
        capturedAt: "2026-06-07T04:00:00.000Z",
      }),
      snapshot({
        id: "newer-ssd",
        productId: "ssd",
        productName: "Brand New SSD",
        crawlRunId: "newer-run",
        price: 2390,
        capturedAt: "2026-06-07T04:30:00.000Z",
      }),
    ]);

    await expect(
      readRecentPriceReport(client, {
        since: new Date("2026-06-07T02:00:00.000Z"),
        until: new Date("2026-06-07T05:00:00.000Z"),
      }),
    ).resolves.toEqual({
      priceChanges: [
        {
          productId: "gpu",
          productName: "Changed GPU",
          previousPrice: 12000,
          currentPrice: 10990,
          currency: "TWD",
          changedAt: new Date("2026-06-07T03:00:00.000Z"),
          delta: -1010,
        },
      ],
      newProducts: [
        {
          productId: "ssd",
          productName: "Brand New SSD",
          currentPrice: 2390,
          currency: "TWD",
          firstSeenAt: new Date("2026-06-07T04:00:00.000Z"),
        },
      ],
    });
  });
});

describe("createPriceChangeDiscordMessages", () => {
  it("lists price changes with product links and hidden-count cap text", () => {
    const messages = createPriceChangeDiscordMessages(
      [
        change({ productId: "product-1", productName: "GPU A", delta: -500 }),
        change({ productId: "product-2", productName: "RAM B", delta: 200 }),
        change({ productId: "product-3", productName: "SSD C", delta: -100 }),
      ],
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 2,
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain("Changes: 3. Listed: 2; 1 hidden");
    expect(messages[0]?.content).toContain(
      "1. -TWD 500 | [GPU A](https://partsradar.test/products/product-1)",
    );
    expect(messages[0]?.content).toContain(
      "2. +TWD 200 | [RAM B](https://partsradar.test/products/product-2)",
    );
    expect(messages[0]?.content).not.toContain("SSD C");
    expect(messages[0]?.content).toContain("Browse: https://partsradar.test/");
  });

  it("splits long change lists into multiple Discord-sized messages", () => {
    const messages = createPriceChangeDiscordMessages(
      Array.from({ length: 40 }, (_, index) =>
        change({
          productId: `product-${index + 1}`,
          productName: `Very Long Product Name ${index + 1} `.repeat(8),
          delta: (index + 1) * 100,
        }),
      ),
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 40,
      },
    );

    expect(messages.length).toBeGreaterThan(1);
    expect(messages[0]?.content).toContain("PartsRadarTW price changes (1/");
    expect(messages.at(-1)?.content).toContain("Browse: https://partsradar.test/");
    for (const message of messages) {
      expect(message.content?.length).toBeLessThanOrEqual(2000);
    }
  });
});

describe("createPriceChangeReportMessages", () => {
  it("creates an empty report message when no recent price changes exist", () => {
    expect(
      createPriceChangeReportMessages([], {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
        title: "PartsRadarTW price report - past 24h",
      }),
    ).toEqual(["PartsRadarTW price report - past 24h\nNo price changes found."]);
  });
});

describe("createPersonalPriceReportMessages", () => {
  it("creates a Chinese two-section price report", () => {
    const messages = createPersonalPriceReportMessages(
      {
        priceChanges: [change({ productId: "gpu", productName: "GPU A", delta: -500 })],
        newProducts: [
          {
            productId: "ssd",
            productName: "SSD B",
            currentPrice: 2490,
            currency: "TWD",
            firstSeenAt: new Date("2026-06-07T03:00:00.000Z"),
          },
        ],
      },
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
        windowHours: 24,
        generatedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("PartsRadarTW 價格報告 - 過去 24 小時");
    expect(messages[0]).toContain("價格變動");
    expect(messages[0]).toContain("找到 1 筆價格變動。");
    expect(messages[0]).toContain(
      "1. [GPU A](https://partsradar.test/products/gpu) - NT$10,000 -> NT$9,500（-NT$500）",
    );
    expect(messages[0]).toContain("新增商品");
    expect(messages[0]).toContain("找到 1 個新增商品。");
    expect(messages[0]).toContain("1. [SSD B](https://partsradar.test/products/ssd) - NT$2,490");
  });

  it("shows empty copy for both report sections", () => {
    const [message] = createPersonalPriceReportMessages(
      {
        priceChanges: [],
        newProducts: [],
      },
      {
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
        windowHours: 24,
        generatedAt: new Date("2026-06-07T05:00:00.000Z"),
      },
    );

    expect(message).toContain("價格變動\n找到 0 筆價格變動。\n沒有價格變動。");
    expect(message).toContain("新增商品\n找到 0 個新增商品。\n沒有新增商品。");
  });
});

describe("sendCrawlRunPriceChangeDiscordNotification", () => {
  it("skips without querying DB when the public webhook is missing", async () => {
    const client = {
      priceSnapshot: {
        findMany: vi.fn(),
      },
    } as unknown as PriceChangeDiscordClient;

    await expect(
      sendCrawlRunPriceChangeDiscordNotification({
        client,
        crawlRunId: "target-run",
        options: {
          publicWebhookUrl: null,
          publicBaseUrl: PUBLIC_BASE_URL,
          maxItems: 50,
        },
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "missing_webhook_url",
      changeCount: 0,
      listedCount: 0,
      messageCount: 0,
    });
    expect(client.priceSnapshot.findMany).not.toHaveBeenCalled();
  });

  it("sends one or more webhook messages for changed prices", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "old-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "old-run",
        price: 10000,
        capturedAt: "2026-06-07T01:00:00.000Z",
      }),
      snapshot({
        id: "new-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "target-run",
        price: 9000,
        capturedAt: "2026-06-07T02:00:00.000Z",
      }),
    ]);
    const sendDiscordWebhook = vi.fn<
      (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>
    >(async () => ({ status: "sent", httpStatus: 204 }));

    const result = await sendCrawlRunPriceChangeDiscordNotification({
      client,
      crawlRunId: "target-run",
      options: {
        publicWebhookUrl: WEBHOOK_URL,
        publicBaseUrl: PUBLIC_BASE_URL,
        maxItems: 50,
      },
      sendDiscordWebhook,
    });

    expect(result).toEqual({
      status: "sent",
      changeCount: 1,
      listedCount: 1,
      messageCount: 1,
      httpStatuses: [204],
    });
    expect(sendDiscordWebhook).toHaveBeenCalledWith({
      webhookUrl: WEBHOOK_URL,
      message: expect.objectContaining({
        content: expect.stringContaining("GPU A"),
      }),
    });
  });

  it("skips with diagnostics when snapshots exist but no previous price can be matched", async () => {
    const client = createPriceChangeClient([
      snapshot({
        id: "new-product-snapshot",
        productId: "product-1",
        productName: "First Seen RAM",
        crawlRunId: "target-run",
        price: 1990,
        capturedAt: "2026-06-07T02:00:00.000Z",
      }),
    ]);
    const sendDiscordWebhook = vi.fn<
      (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>
    >(async () => ({ status: "sent", httpStatus: 204 }));

    await expect(
      sendCrawlRunPriceChangeDiscordNotification({
        client,
        crawlRunId: "target-run",
        options: {
          publicWebhookUrl: WEBHOOK_URL,
          publicBaseUrl: PUBLIC_BASE_URL,
          maxItems: 50,
        },
        sendDiscordWebhook,
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "no_price_changes",
      changeCount: 0,
      listedCount: 0,
      messageCount: 0,
      snapshotCount: 1,
      unmatchedSnapshotCount: 1,
      unchangedSnapshotCount: 0,
      currencyMismatchCount: 0,
    });
    expect(sendDiscordWebhook).not.toHaveBeenCalled();
  });
});

interface TestSnapshot {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  currency: string;
  capturedAt: Date;
}

function snapshot({
  id,
  productId,
  productName,
  crawlRunId,
  price,
  capturedAt,
  currency = "TWD",
}: {
  id: string;
  productId: string;
  productName: string;
  crawlRunId: string;
  price: number;
  capturedAt: string;
  currency?: string;
}): TestSnapshot {
  return {
    id,
    productId,
    productName,
    crawlRunId,
    price,
    currency,
    capturedAt: new Date(capturedAt),
  };
}

function change({
  productId,
  productName,
  previousPrice = 10000,
  delta,
  changedAt = new Date("2026-06-07T02:00:00.000Z"),
}: {
  productId: string;
  productName: string;
  previousPrice?: number;
  delta: number;
  changedAt?: Date;
}): PriceChangeDiscordNotificationItem {
  return {
    productId,
    productName,
    previousPrice,
    currentPrice: previousPrice + delta,
    currency: "TWD",
    changedAt,
    delta,
  };
}

function createPriceChangeClient(snapshots: TestSnapshot[]): PriceChangeDiscordClient & {
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
} {
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;

    if (typeof where.crawlRunId === "string") {
      return snapshots
        .filter((snapshot) => snapshot.crawlRunId === where.crawlRunId)
        .sort(compareCapturedAtAsc)
        .map((snapshot) => ({
          id: snapshot.id,
          productId: snapshot.productId,
          price: snapshot.price,
          currency: snapshot.currency,
          capturedAt: snapshot.capturedAt,
          product: {
            id: snapshot.productId,
            name: snapshot.productName,
          },
        }));
    }

    if (
      !where.productId &&
      typeof where.capturedAt === "object" &&
      where.capturedAt !== null &&
      "gte" in where.capturedAt &&
      "lte" in where.capturedAt
    ) {
      const capturedAtFilter = where.capturedAt as { gte: Date; lte: Date };

      return snapshots
        .filter(
          (snapshot) =>
            snapshot.capturedAt.getTime() >= capturedAtFilter.gte.getTime() &&
            snapshot.capturedAt.getTime() <= capturedAtFilter.lte.getTime(),
        )
        .sort(compareCapturedAtAsc)
        .map((snapshot) => ({
          id: snapshot.id,
          productId: snapshot.productId,
          price: snapshot.price,
          currency: snapshot.currency,
          capturedAt: snapshot.capturedAt,
          product: {
            id: snapshot.productId,
            name: snapshot.productName,
          },
        }));
    }

    const productIdFilter = where.productId as { in: string[] };
    const crawlRunFilter = where.crawlRunId as { not: string } | undefined;
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
          (!crawlRunFilter || snapshot.crawlRunId !== crawlRunFilter.not) &&
          snapshot.capturedAt.getTime() < capturedAtFilter.lt.getTime(),
      )
      .sort(comparePreviousSnapshotOrder)
      .map((snapshot) => ({
        id: snapshot.id,
        productId: snapshot.productId,
        price: snapshot.price,
        currency: snapshot.currency,
        capturedAt: snapshot.capturedAt,
      }));
  });

  return {
    priceSnapshot: {
      findMany,
    },
  } as unknown as PriceChangeDiscordClient & {
    priceSnapshot: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
}

function compareCapturedAtAsc(left: TestSnapshot, right: TestSnapshot): number {
  return left.capturedAt.getTime() - right.capturedAt.getTime() || left.id.localeCompare(right.id);
}

function comparePreviousSnapshotOrder(left: TestSnapshot, right: TestSnapshot): number {
  return (
    left.productId.localeCompare(right.productId) ||
    right.capturedAt.getTime() - left.capturedAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}
