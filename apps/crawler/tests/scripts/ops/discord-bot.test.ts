// apps/crawler/tests/scripts/ops/discord-bot.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  parseDiscordBotOptions,
  registerDiscordBotCommands,
  sendDiscordDirectMessages,
  sendDiscordInteractionMessages,
  sendPriceReportNow,
  type DiscordBotClient,
} from "../../../src/scripts/ops/discord-bot";

const TOKEN = "test_bot_token";
const APPLICATION_ID = "123456789012345678";
const GUILD_ID = "987654321098765432";
const API_BASE_URL = "https://discord.test/api/v10";
const PUBLIC_BASE_URL = "https://partsradar.test/";

describe("Discord bot options", () => {
  it("parses required bot settings and safe defaults", () => {
    expect(
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: APPLICATION_ID,
        DISCORD_GUILD_ID: GUILD_ID,
        PARTSRADAR_PUBLIC_BASE_URL: PUBLIC_BASE_URL,
      }),
    ).toMatchObject({
      token: TOKEN,
      applicationId: APPLICATION_ID,
      guildId: GUILD_ID,
      publicBaseUrl: "https://partsradar.test/",
      apiBaseUrl: "https://discord.com/api/v10",
      registerCommands: false,
      registerCommandsOnStart: true,
      priceReportMaxItems: 50,
      commandCooldownSeconds: 60,
    });
  });

  it("rejects missing token or invalid ids", () => {
    expect(() => parseDiscordBotOptions([], {})).toThrow("DISCORD_BOT_TOKEN is required");
    expect(() =>
      parseDiscordBotOptions([], {
        DISCORD_BOT_TOKEN: TOKEN,
        DISCORD_APPLICATION_ID: "not-an-id",
      }),
    ).toThrow("DISCORD_APPLICATION_ID must be a Discord snowflake id");
  });
});

describe("registerDiscordBotCommands", () => {
  it("registers the price-report command in the configured guild", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify([{ id: "command-1" }]), { status: 200 }),
    );

    await expect(
      registerDiscordBotCommands({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        guildId: GUILD_ID,
        apiBaseUrl: API_BASE_URL,
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      httpStatus: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(String(url)).toBe(
      `${API_BASE_URL}/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
    );
    expect(requestInit.method).toBe("PUT");
    expect(requestInit.headers).toMatchObject({
      authorization: `Bot ${TOKEN}`,
      "content-type": "application/json",
    });
    expect(String(requestInit.body)).toContain('"name":"price-report"');
    expect(String(requestInit.body)).toContain('"name":"now"');
  });
});

describe("sendDiscordDirectMessages", () => {
  it("creates a DM channel and posts all report messages with mentions disabled", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, requestInit) => {
      if (String(requestInit?.body).includes("recipient_id")) {
        return new Response(JSON.stringify({ id: "dm-channel" }), { status: 200 });
      }

      return new Response(JSON.stringify({ id: "message" }), { status: 200 });
    });

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        contents: ["Report 1", "Report 2 @everyone"],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 2,
      httpStatuses: [200, 200],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, secondRequest] = fetchMock.mock.calls[1] as [Parameters<typeof fetch>[0], RequestInit];
    expect(JSON.parse(String(secondRequest.body))).toMatchObject({
      content: "Report 1",
      allowed_mentions: {
        parse: [],
      },
    });
  });

  it("uses Discord JSON retry_after when rate limited without a Retry-After header", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ retry_after: 1.25, global: true }), {
          status: 429,
        }),
    );

    await expect(
      sendDiscordDirectMessages({
        token: TOKEN,
        apiBaseUrl: API_BASE_URL,
        userId: "111122223333444455",
        contents: ["Report"],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "rate_limited",
      messageCount: 1,
      sentMessageCount: 0,
      retryAfterMs: 1250,
      global: true,
    });
  });
});

describe("sendDiscordInteractionMessages", () => {
  it("edits the original command response and posts follow-up chunks", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "message" }), { status: 200 }),
    );

    await expect(
      sendDiscordInteractionMessages({
        token: TOKEN,
        applicationId: APPLICATION_ID,
        apiBaseUrl: API_BASE_URL,
        interaction: {
          id: "interaction-1",
          token: "interaction-token",
          type: 2,
        },
        contents: ["Report 1", "Report 2 @everyone"],
        fetchImpl: fetchMock as typeof fetch,
      }),
    ).resolves.toEqual({
      status: "sent",
      messageCount: 2,
      httpStatuses: [200, 200],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstRequest] = fetchMock.mock.calls[0] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    const [secondUrl, secondRequest] = fetchMock.mock.calls[1] as [
      Parameters<typeof fetch>[0],
      RequestInit,
    ];
    expect(String(firstUrl)).toBe(
      `${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token/messages/@original`,
    );
    expect(firstRequest.method).toBe("PATCH");
    expect(JSON.parse(String(firstRequest.body))).toEqual({
      content: "Report 1",
      allowed_mentions: {
        parse: [],
      },
    });
    expect(String(secondUrl)).toBe(`${API_BASE_URL}/webhooks/${APPLICATION_ID}/interaction-token`);
    expect(secondRequest.method).toBe("POST");
    expect(JSON.parse(String(secondRequest.body))).toEqual({
      content: "Report 2 @everyone",
      allowed_mentions: {
        parse: [],
      },
    });
  });
});

describe("sendPriceReportNow", () => {
  it("sends a recent price report in the command context and records the delivery", async () => {
    const client = createDiscordBotClient([
      snapshot({
        id: "old-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "old-run",
        price: 12000,
        capturedAt: "2026-06-06T01:00:00.000Z",
      }),
      snapshot({
        id: "new-1",
        productId: "product-1",
        productName: "GPU A",
        crawlRunId: "new-run",
        price: 10990,
        capturedAt: "2026-06-07T03:00:00.000Z",
      }),
      snapshot({
        id: "new-2",
        productId: "product-2",
        productName: "SSD B",
        crawlRunId: "new-run",
        price: 2490,
        capturedAt: "2026-06-07T04:00:00.000Z",
      }),
    ]);
    const sendReportMessages = vi.fn(async (_contents: string[]) => ({
      status: "sent" as const,
      messageCount: 1,
      httpStatuses: [200],
    }));

    await expect(
      sendPriceReportNow({
        client,
        discordUserId: "111122223333444455",
        windowHours: 24,
        maxItems: 50,
        publicBaseUrl: PUBLIC_BASE_URL,
        now: new Date("2026-06-07T05:00:00.000Z"),
        sendReportMessages,
      }),
    ).resolves.toEqual({
      status: "sent",
      changeCount: 1,
      newProductCount: 1,
      listedCount: 2,
      messageCount: 1,
    });

    expect(sendReportMessages).toHaveBeenCalledWith([
      expect.stringContaining("PartsRadarTW 價格報告 - 過去 24 小時"),
    ]);
    const reportContent = sendReportMessages.mock.calls[0]?.[0][0] ?? "";
    expect(reportContent).toContain("價格變動");
    expect(reportContent).toContain("GPU A");
    expect(reportContent).toContain("新增商品");
    expect(reportContent).toContain("SSD B");
    expect(client.discordNotificationDelivery.create).toHaveBeenCalledWith({
      data: {
        discordUserId: "111122223333444455",
        kind: "PRICE_REPORT_NOW",
        status: "SENT",
        itemCount: 2,
        messageCount: 1,
        deliveredAt: new Date("2026-06-07T05:00:00.000Z"),
        errorMessage: null,
      },
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

function createDiscordBotClient(snapshots: TestSnapshot[]): DiscordBotClient & {
  priceSnapshot: {
    findMany: ReturnType<typeof vi.fn>;
  };
  discordNotificationDelivery: {
    create: ReturnType<typeof vi.fn>;
  };
} {
  const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
    const where = args.where;

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
        .map(toPrismaSnapshotWithProduct);
    }

    const productIdFilter = where.productId as { in: string[] };
    const capturedAtFilter = where.capturedAt as { lt: Date };

    return snapshots
      .filter(
        (snapshot) =>
          productIdFilter.in.includes(snapshot.productId) &&
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
    discordNotificationDelivery: {
      create: vi.fn(async () => ({ id: "delivery-1" })),
    },
  } as unknown as DiscordBotClient & {
    priceSnapshot: {
      findMany: ReturnType<typeof vi.fn>;
    };
    discordNotificationDelivery: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function toPrismaSnapshotWithProduct(snapshot: TestSnapshot) {
  return {
    id: snapshot.id,
    productId: snapshot.productId,
    price: snapshot.price,
    currency: snapshot.currency,
    capturedAt: snapshot.capturedAt,
    product: {
      id: snapshot.productId,
      name: snapshot.productName,
    },
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
