// packages/db/tests/discord-privacy/discord-privacy.integration.test.ts
// 以 disposable PostgreSQL 驗證 Discord user / guild erase 的隔離、idempotency 與 transaction rollback。

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupDiscordRetention,
  createDiscordPrivacyVerification,
  eraseDiscordGuildData,
  eraseDiscordUserData,
  eraseVerifiedDiscordUserData,
  inspectDiscordGuildData,
  inspectDiscordRetentionCandidates,
  inspectDiscordUserData,
  inspectVerifiedDiscordUserData,
  verifyDiscordPrivacyCode,
} from "../../src/discord-privacy";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL ?? testDatabaseUrl;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests.");
}

const USER_A = "810000000000000001";
const USER_B = "810000000000000002";
const GUILD_A = "820000000000000001";
const GUILD_B = "820000000000000002";
const CHANNEL_A = "830000000000000001";
const CHANNEL_B = "830000000000000002";
let client: PrismaClient;
let migrationClient: PrismaClient;
let categoryId: string;
let productId: string;
let crawlRunId: string;

beforeAll(async () => {
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
  migrationClient = new PrismaClient({
    adapter: new PrismaPg({ connectionString: migrationDatabaseUrl }),
  });
});

afterEach(async () => {
  await migrationClient.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "discord_privacy_rollback_test" ON "discord_price_report_settings"',
  );
  await migrationClient.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS "raise_discord_privacy_rollback_test"()',
  );
  await client.discordNotificationDelivery.deleteMany({
    where: { discordUserId: { in: [USER_A, USER_B] } },
  });
  await client.discordPrivacyVerificationRequest.deleteMany();
  await client.discordTargetPriceWatch.deleteMany({
    where: { discordUserId: { in: [USER_A, USER_B] } },
  });
  await client.discordPriceReportSetting.deleteMany({
    where: { discordUserId: { in: [USER_A, USER_B] } },
  });
  await client.discordPublicPriceReportDelivery.deleteMany({
    where: { channelId: { in: [CHANNEL_A, CHANNEL_B] } },
  });
  await client.discordPublicPriceReportSetting.deleteMany({
    where: { discordGuildId: { in: [GUILD_A, GUILD_B] } },
  });

  if (productId) {
    await client.product.deleteMany({ where: { id: productId } });
  }
  if (crawlRunId) {
    await client.crawlRun.deleteMany({ where: { id: crawlRunId } });
  }
  if (categoryId) {
    await client.sourceCategory.deleteMany({ where: { id: categoryId } });
  }
  categoryId = "";
  productId = "";
  crawlRunId = "";
});

afterAll(async () => {
  await client.$disconnect();
  await migrationClient.$disconnect();
});

describe("Discord privacy PostgreSQL domain", () => {
  it("erases only one user while preserving shared data and nulling guild actor metadata", async () => {
    await seedSharedData();
    await seedUser(USER_A, productId);
    await seedUser(USER_B, productId);
    const publicSetting = await client.discordPublicPriceReportSetting.create({
      data: {
        discordGuildId: GUILD_A,
        channelId: CHANNEL_A,
        createdByDiscordUserId: USER_A,
        updatedByDiscordUserId: USER_A,
      },
    });
    await client.discordPublicPriceReportDelivery.create({
      data: {
        crawlRunId,
        channelId: CHANNEL_A,
        publicPriceReportSettingId: publicSetting.id,
        status: "SENT",
      },
    });
    const userARequest = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_A,
    });
    const userBRequest = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_B,
    });

    const before = await inspectDiscordUserData(client, USER_A);
    const erased = await eraseDiscordUserData(client, USER_A);

    expect(erased).toEqual(before);
    expect(await inspectDiscordUserData(client, USER_A)).toEqual({
      priceReportSettings: 0,
      targetPriceWatches: 0,
      notificationDeliveries: 0,
      publicSettingsCreatedByUser: 0,
      publicSettingsUpdatedByUser: 0,
      verificationRequests: {
        total: 0,
        pending: 0,
        verified: 0,
        consumed: 0,
        cancelled: 0,
        expired: 0,
      },
    });
    expect(await inspectDiscordUserData(client, USER_B)).toMatchObject({
      priceReportSettings: 1,
      targetPriceWatches: 1,
      notificationDeliveries: 2,
    });
    expect(await client.product.count({ where: { id: productId } })).toBe(1);
    expect(await client.sourceCategory.count({ where: { id: categoryId } })).toBe(1);
    expect(
      await client.discordPrivacyVerificationRequest.findUniqueOrThrow({
        where: { id: userARequest.requestId },
        select: { discordUserId: true, codeDigest: true, cancelledAt: true },
      }),
    ).toMatchObject({
      discordUserId: null,
      codeDigest: null,
      cancelledAt: expect.any(Date),
    });
    expect(
      await client.discordPrivacyVerificationRequest.findUniqueOrThrow({
        where: { id: userBRequest.requestId },
        select: { discordUserId: true, codeDigest: true, cancelledAt: true },
      }),
    ).toEqual({
      discordUserId: USER_B,
      codeDigest: expect.any(String),
      cancelledAt: null,
    });
    expect(
      await client.discordPublicPriceReportSetting.findUnique({
        where: { discordGuildId: GUILD_A },
        select: { createdByDiscordUserId: true, updatedByDiscordUserId: true },
      }),
    ).toEqual({ createdByDiscordUserId: null, updatedByDiscordUserId: null });
    expect(await eraseDiscordUserData(client, USER_A)).toEqual({
      priceReportSettings: 0,
      targetPriceWatches: 0,
      notificationDeliveries: 0,
      publicSettingsCreatedByUser: 0,
      publicSettingsUpdatedByUser: 0,
      verificationRequests: {
        total: 0,
        pending: 0,
        verified: 0,
        consumed: 0,
        cancelled: 0,
        expired: 0,
      },
    });
  });

  it("rolls back every earlier deletion when a later table delete fails", async () => {
    await seedSharedData();
    await seedUser(USER_A, productId);
    await migrationClient.$executeRawUnsafe(`
      CREATE FUNCTION "raise_discord_privacy_rollback_test"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'rollback test';
      END;
      $$ LANGUAGE plpgsql
    `);
    await migrationClient.$executeRawUnsafe(`
      CREATE TRIGGER "discord_privacy_rollback_test"
      BEFORE DELETE ON "discord_price_report_settings"
      FOR EACH ROW
      WHEN (OLD."discord_user_id" = '${USER_A}')
      EXECUTE FUNCTION "raise_discord_privacy_rollback_test"()
    `);

    const before = await inspectDiscordUserData(client, USER_A);
    await expect(eraseDiscordUserData(client, USER_A)).rejects.toThrow();
    expect(await inspectDiscordUserData(client, USER_A)).toEqual(before);
  });

  it("erases one guild and its explicitly linked deliveries without touching another guild", async () => {
    await seedSharedData();
    const settingA = await seedGuild(GUILD_A, CHANNEL_A, USER_A);
    const settingB = await seedGuild(GUILD_B, CHANNEL_B, USER_B);
    await client.discordPublicPriceReportDelivery.createMany({
      data: [
        {
          crawlRunId,
          channelId: CHANNEL_A,
          publicPriceReportSettingId: settingA.id,
          status: "SENT",
        },
        {
          crawlRunId,
          channelId: CHANNEL_B,
          publicPriceReportSettingId: settingB.id,
          status: "FAILED",
        },
      ],
    });

    expect(await inspectDiscordGuildData(client, GUILD_A)).toEqual({
      publicReportSettings: 1,
      publicReportDeliveries: 1,
      unlinkedPublicReportDeliveries: 0,
    });
    await eraseDiscordGuildData(client, GUILD_A);

    expect(await inspectDiscordGuildData(client, GUILD_A)).toEqual({
      publicReportSettings: 0,
      publicReportDeliveries: 0,
      unlinkedPublicReportDeliveries: 0,
    });
    expect(await inspectDiscordGuildData(client, GUILD_B)).toEqual({
      publicReportSettings: 1,
      publicReportDeliveries: 1,
      unlinkedPublicReportDeliveries: 0,
    });
    expect(await eraseDiscordGuildData(client, GUILD_A)).toMatchObject({
      publicReportSettings: 0,
      publicReportDeliveries: 0,
    });
  });

  it("refuses guild erase when matching legacy delivery metadata is not linked", async () => {
    await seedSharedData();
    await seedGuild(GUILD_A, CHANNEL_A, USER_A);
    await client.discordPublicPriceReportDelivery.create({
      data: {
        crawlRunId,
        channelId: CHANNEL_A,
        status: "SENT",
      },
    });

    await expect(eraseDiscordGuildData(client, GUILD_A)).rejects.toThrow(
      "legacy delivery metadata cannot be linked safely",
    );
    expect(
      await client.discordPublicPriceReportSetting.count({ where: { discordGuildId: GUILD_A } }),
    ).toBe(1);
  });

  it("requires a matching verified request, consumes it once and never stores the plaintext code", async () => {
    await seedSharedData();
    await seedUser(USER_A, productId);
    const inspectRequest = await createDiscordPrivacyVerification({
      client,
      requestType: "INSPECT",
      discordUserId: USER_A,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const stored = await client.discordPrivacyVerificationRequest.findUniqueOrThrow({
      where: { id: inspectRequest.requestId },
      select: { codeDigest: true },
    });

    expect(stored.codeDigest).not.toContain(inspectRequest.code);
    await expect(
      inspectVerifiedDiscordUserData({
        client,
        requestId: inspectRequest.requestId,
        now: new Date("2030-01-01T00:01:00.000Z"),
      }),
    ).rejects.toThrow("verified privacy request is required");
    expect(
      await verifyDiscordPrivacyCode({
        client,
        requestId: inspectRequest.requestId,
        code: inspectRequest.code,
        now: new Date("2030-01-01T00:01:00.000Z"),
      }),
    ).toMatchObject({ status: "verified", requestType: "INSPECT" });
    expect(
      await inspectVerifiedDiscordUserData({
        client,
        requestId: inspectRequest.requestId,
        now: new Date("2030-01-01T00:02:00.000Z"),
      }),
    ).toMatchObject({
      discordUserId: USER_A,
      counts: {
        priceReportSettings: 1,
        targetPriceWatches: 1,
        notificationDeliveries: 2,
        verificationRequests: {
          total: 1,
          pending: 0,
          verified: 1,
          consumed: 0,
          cancelled: 0,
          expired: 0,
        },
      },
    });
    expect(
      await client.discordPrivacyVerificationRequest.findUniqueOrThrow({
        where: { id: inspectRequest.requestId },
        select: { discordUserId: true, codeDigest: true, consumedAt: true },
      }),
    ).toEqual({
      discordUserId: null,
      codeDigest: null,
      consumedAt: new Date("2030-01-01T00:02:00.000Z"),
    });
    await expect(
      inspectVerifiedDiscordUserData({
        client,
        requestId: inspectRequest.requestId,
        now: new Date("2030-01-01T00:03:00.000Z"),
      }),
    ).rejects.toThrow("verified privacy request is required");
  });

  it("rejects wrong, cross-request, expired and replayed verification codes", async () => {
    const requestA = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_A,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const requestB = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_B,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(
      await verifyDiscordPrivacyCode({
        client,
        requestId: requestB.requestId,
        code: requestA.code,
        now: new Date("2030-01-01T00:01:00.000Z"),
      }),
    ).toMatchObject({ status: "invalid", attemptsRemaining: 4 });
    expect(
      await verifyDiscordPrivacyCode({
        client,
        requestId: requestA.requestId,
        code: requestA.code,
        now: new Date("2030-01-01T00:30:00.000Z"),
      }),
    ).toEqual({ status: "expired" });
    expect(
      await client.discordPrivacyVerificationRequest.findUniqueOrThrow({
        where: { id: requestA.requestId },
        select: { discordUserId: true, codeDigest: true },
      }),
    ).toEqual({ discordUserId: null, codeDigest: null });
    expect(
      await verifyDiscordPrivacyCode({
        client,
        requestId: requestB.requestId,
        code: requestB.code,
        now: new Date("2030-01-01T00:02:00.000Z"),
      }),
    ).toMatchObject({ status: "verified" });
    expect(
      await verifyDiscordPrivacyCode({
        client,
        requestId: requestB.requestId,
        code: requestB.code,
        now: new Date("2030-01-01T00:03:00.000Z"),
      }),
    ).toEqual({ status: "already_verified" });

    const exhaustedRequest = await createDiscordPrivacyVerification({
      client,
      requestType: "INSPECT",
      discordUserId: USER_A,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const wrongCode = exhaustedRequest.code === "00000000" ? "00000001" : "00000000";
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await verifyDiscordPrivacyCode({
        client,
        requestId: exhaustedRequest.requestId,
        code: wrongCode,
        now: new Date("2030-01-01T00:05:00.000Z"),
      });
      expect(result.status).toBe(attempt === 5 ? "attempts_exhausted" : "invalid");
    }
    expect(
      await verifyDiscordPrivacyCode({
        client,
        requestId: exhaustedRequest.requestId,
        code: exhaustedRequest.code,
        now: new Date("2030-01-01T00:06:00.000Z"),
      }),
    ).toEqual({ status: "cancelled" });

    await cleanupDiscordRetention(client, new Date("2030-01-08T00:30:00.000Z"));
    expect(
      await client.discordPrivacyVerificationRequest.count({
        where: { id: requestA.requestId },
      }),
    ).toBe(0);
  });

  it("authorizes erase only for an ERASE request and removes the subject atomically", async () => {
    await seedSharedData();
    await seedUser(USER_A, productId);
    const request = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_A,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    await verifyDiscordPrivacyCode({
      client,
      requestId: request.requestId,
      code: request.code,
      now: new Date("2030-01-01T00:01:00.000Z"),
    });
    const pendingRequest = await createDiscordPrivacyVerification({
      client,
      requestType: "INSPECT",
      discordUserId: USER_A,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const verifiedRequest = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_A,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    await verifyDiscordPrivacyCode({
      client,
      requestId: verifiedRequest.requestId,
      code: verifiedRequest.code,
      now: new Date("2030-01-01T00:01:00.000Z"),
    });
    const otherUserRequest = await createDiscordPrivacyVerification({
      client,
      requestType: "ERASE",
      discordUserId: USER_B,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    const expiredRequest = await client.discordPrivacyVerificationRequest.create({
      data: {
        requestType: "INSPECT",
        discordUserId: USER_A,
        codeDigest: "expired-request-digest",
        expiresAt: new Date("2030-01-01T00:01:00.000Z"),
      },
      select: { id: true },
    });

    await expect(
      inspectVerifiedDiscordUserData({
        client,
        requestId: request.requestId,
        now: new Date("2030-01-01T00:02:00.000Z"),
      }),
    ).rejects.toThrow("verified privacy request is required");
    expect(
      await eraseVerifiedDiscordUserData({
        client,
        requestId: request.requestId,
        now: new Date("2030-01-01T00:02:00.000Z"),
      }),
    ).toMatchObject({
      discordUserId: USER_A,
      counts: {
        priceReportSettings: 1,
        targetPriceWatches: 1,
        notificationDeliveries: 2,
        verificationRequests: {
          total: 4,
          pending: 1,
          verified: 2,
          consumed: 0,
          cancelled: 0,
          expired: 1,
        },
      },
    });
    expect(
      await inspectDiscordUserData(client, USER_A, new Date("2030-01-01T00:03:00.000Z")),
    ).toMatchObject({
      priceReportSettings: 0,
      targetPriceWatches: 0,
      notificationDeliveries: 0,
      verificationRequests: {
        total: 0,
        pending: 0,
        verified: 0,
        consumed: 0,
        cancelled: 0,
        expired: 0,
      },
    });
    expect(
      await client.discordPrivacyVerificationRequest.findMany({
        where: {
          id: {
            in: [
              request.requestId,
              pendingRequest.requestId,
              verifiedRequest.requestId,
              expiredRequest.id,
            ],
          },
        },
        select: {
          id: true,
          discordUserId: true,
          codeDigest: true,
          consumedAt: true,
          cancelledAt: true,
        },
        orderBy: { id: "asc" },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: request.requestId,
          discordUserId: null,
          codeDigest: null,
          consumedAt: new Date("2030-01-01T00:02:00.000Z"),
          cancelledAt: null,
        }),
        expect.objectContaining({
          id: pendingRequest.requestId,
          discordUserId: null,
          codeDigest: null,
          consumedAt: null,
          cancelledAt: new Date("2030-01-01T00:02:00.000Z"),
        }),
        expect.objectContaining({
          id: verifiedRequest.requestId,
          discordUserId: null,
          codeDigest: null,
          consumedAt: null,
          cancelledAt: new Date("2030-01-01T00:02:00.000Z"),
        }),
        expect.objectContaining({
          id: expiredRequest.id,
          discordUserId: null,
          codeDigest: null,
          consumedAt: null,
          cancelledAt: new Date("2030-01-01T00:02:00.000Z"),
        }),
      ]),
    );
    expect(
      await client.discordPrivacyVerificationRequest.findUniqueOrThrow({
        where: { id: otherUserRequest.requestId },
        select: { discordUserId: true, codeDigest: true, cancelledAt: true },
      }),
    ).toEqual({
      discordUserId: USER_B,
      codeDigest: expect.any(String),
      cancelledAt: null,
    });

    expect(
      await inspectDiscordRetentionCandidates(client, new Date("2030-01-08T00:02:00.000Z")),
    ).toMatchObject({ verificationRequests: 4 });
    await cleanupDiscordRetention(client, new Date("2030-01-08T00:02:00.000Z"));
    expect(
      await client.discordPrivacyVerificationRequest.count({
        where: {
          id: {
            in: [
              request.requestId,
              pendingRequest.requestId,
              verifiedRequest.requestId,
              expiredRequest.id,
            ],
          },
        },
      }),
    ).toBe(0);
    expect(
      await client.discordPrivacyVerificationRequest.count({
        where: { id: otherUserRequest.requestId },
      }),
    ).toBe(1);
  });

  it("applies exact retention boundaries and leaves newer or active rows intact", async () => {
    await seedSharedData();
    const now = new Date("2030-03-31T00:00:00.000Z");
    const atThirtyDays = new Date("2030-03-01T00:00:00.000Z");
    const newerThanThirtyDays = new Date("2030-03-01T00:00:00.001Z");
    await client.discordPriceReportSetting.createMany({
      data: [
        {
          discordUserId: USER_A,
          interval: "DAILY",
          window: "HOURS_24",
          enabled: false,
          disabledAt: atThirtyDays,
        },
        {
          discordUserId: USER_B,
          interval: "DAILY",
          window: "HOURS_24",
          enabled: false,
          disabledAt: newerThanThirtyDays,
        },
      ],
    });
    await client.discordTargetPriceWatch.createMany({
      data: [
        {
          discordUserId: USER_A,
          productId,
          targetPrice: 10_000,
          enabled: false,
          disabledAt: atThirtyDays,
        },
        {
          discordUserId: USER_B,
          productId,
          targetPrice: 11_000,
          enabled: false,
          disabledAt: newerThanThirtyDays,
        },
      ],
    });
    await client.discordPublicPriceReportSetting.create({
      data: {
        discordGuildId: GUILD_A,
        channelId: CHANNEL_A,
        createdByDiscordUserId: USER_A,
        updatedByDiscordUserId: USER_A,
        enabled: false,
        accessStatus: "DISABLED_BOT_REMOVED",
        disabledAt: new Date("2030-01-31T00:00:00.000Z"),
        purgeAfter: now,
      },
    });
    await client.discordPublicPriceReportSetting.create({
      data: {
        discordGuildId: GUILD_B,
        channelId: CHANNEL_B,
        createdByDiscordUserId: USER_B,
        updatedByDiscordUserId: USER_B,
        enabled: false,
        accessStatus: "ACTIVE",
      },
    });
    await client.discordNotificationDelivery.create({
      data: {
        discordUserId: USER_A,
        kind: "PRICE_REPORT_NOW",
        status: "SENT",
        createdAt: atThirtyDays,
      },
    });
    await client.discordPublicPriceReportDelivery.create({
      data: {
        crawlRunId,
        channelId: CHANNEL_A,
        status: "SENT",
        createdAt: newerThanThirtyDays,
      },
    });
    await client.discordPrivacyVerificationRequest.create({
      data: {
        requestType: "INSPECT",
        discordUserId: USER_A,
        codeDigest: "expired-test-digest",
        expiresAt: new Date("2030-03-24T00:00:00.000Z"),
      },
    });

    expect(await inspectDiscordRetentionCandidates(client, now)).toMatchObject({
      personalDeliveries: 1,
      publicDeliveries: 0,
      disabledPriceReportSettings: 1,
      disabledTargetPriceWatches: 1,
      expiredPublicReportSettings: 1,
      verificationRequests: 1,
    });
    await cleanupDiscordRetention(client, now);

    expect(
      await client.discordPriceReportSetting.findMany({
        select: { discordUserId: true },
        orderBy: { discordUserId: "asc" },
      }),
    ).toEqual([{ discordUserId: USER_B }]);
    expect(
      await client.discordTargetPriceWatch.findMany({
        select: { discordUserId: true },
        orderBy: { discordUserId: "asc" },
      }),
    ).toEqual([{ discordUserId: USER_B }]);
    expect(
      await client.discordPublicPriceReportSetting.count({ where: { discordGuildId: GUILD_A } }),
    ).toBe(0);
    expect(
      await client.discordPublicPriceReportSetting.findUnique({
        where: { discordGuildId: GUILD_B },
        select: { enabled: true, accessStatus: true, purgeAfter: true },
      }),
    ).toEqual({
      enabled: false,
      accessStatus: "ACTIVE",
      purgeAfter: null,
    });
    expect(
      await client.discordPublicPriceReportDelivery.count({ where: { channelId: CHANNEL_A } }),
    ).toBe(1);
    expect(
      await client.discordPrivacyVerificationRequest.count({ where: { discordUserId: USER_A } }),
    ).toBe(0);
  });
});

async function seedSharedData(): Promise<void> {
  categoryId = randomUUID();
  productId = randomUUID();
  crawlRunId = randomUUID();
  await client.sourceCategory.create({
    data: {
      id: categoryId,
      igrp: 9_000_000 + Math.floor(Math.random() * 100_000),
      sourceName: `privacy-${categoryId}`,
      displayName: "Privacy integration",
    },
  });
  await client.product.create({
    data: {
      id: productId,
      sourceCategoryId: categoryId,
      ibuyToken: `privacy-${productId}`,
      name: "Privacy integration product",
      normalizedName: "privacy integration product",
      sourceUrl: "https://example.invalid/privacy",
      firstSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
  await client.crawlRun.create({
    data: {
      id: crawlRunId,
      triggerType: "SCHEDULED",
      status: "SUCCESS_CHANGED",
      finishedAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
}

async function seedUser(discordUserId: string, seededProductId: string): Promise<void> {
  const setting = await client.discordPriceReportSetting.create({
    data: {
      discordUserId,
      interval: "DAILY",
      window: "HOURS_24",
    },
  });
  const watch = await client.discordTargetPriceWatch.create({
    data: {
      discordUserId,
      productId: seededProductId,
      targetPrice: 10_000,
    },
  });
  await client.discordNotificationDelivery.createMany({
    data: [
      {
        discordUserId,
        kind: "SCHEDULED_PRICE_REPORT",
        status: "SENT",
        priceReportSettingId: setting.id,
      },
      {
        discordUserId,
        kind: "TARGET_PRICE",
        status: "FAILED",
        targetPriceWatchId: watch.id,
      },
    ],
  });
}

async function seedGuild(discordGuildId: string, channelId: string, actorId: string) {
  return client.discordPublicPriceReportSetting.create({
    data: {
      discordGuildId,
      channelId,
      createdByDiscordUserId: actorId,
      updatedByDiscordUserId: actorId,
    },
  });
}
