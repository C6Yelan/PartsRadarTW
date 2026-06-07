// apps/crawler/tests/scripts/ops/price-change-discord-notification.test.ts
import { describe, expect, it, vi } from "vitest";
import type {
  DiscordWebhookSendOptions,
  DiscordWebhookSendResult,
} from "../../../src/scripts/ops/discord-webhook";
import {
  createPriceChangeDiscordMessages,
  parsePriceChangeDiscordNotificationOptions,
  readCrawlRunPriceChanges,
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
      parsePriceChangeDiscordNotificationOptions(
        ["--price-change-discord-max-items", "75"],
        {
          DISCORD_PUBLIC_WEBHOOK_URL: WEBHOOK_URL,
          PARTSRADAR_PUBLIC_BASE_URL: "https://partsradar.test/app/",
          PRICE_CHANGE_DISCORD_MAX_ITEMS: "25",
        },
      ),
    ).toEqual({
      publicWebhookUrl: WEBHOOK_URL,
      publicBaseUrl: "https://partsradar.test/app",
      maxItems: 75,
    });
  });

  it("rejects unsafe option values", () => {
    expect(() =>
      parsePriceChangeDiscordNotificationOptions(
        ["--price-change-discord-max-items", "0"],
        {},
      ),
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

    const productIdFilter = where.productId as { in: string[] };
    const crawlRunFilter = where.crawlRunId as { not: string };
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
          snapshot.crawlRunId !== crawlRunFilter.not &&
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
