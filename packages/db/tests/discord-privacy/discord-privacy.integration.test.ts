// packages/db/tests/discord-privacy/discord-privacy.integration.test.ts
// 以 disposable PostgreSQL 驗證 Discord user / guild erase 的隔離、idempotency 與 transaction rollback。

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  eraseDiscordGuildData,
  eraseDiscordUserData,
  inspectDiscordGuildData,
  inspectDiscordUserData,
} from "../../src/discord-privacy";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

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
let categoryId: string;
let productId: string;
let crawlRunId: string;

beforeAll(async () => {
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
});

afterEach(async () => {
  await client.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS "discord_privacy_rollback_test" ON "discord_price_report_settings"',
  );
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS "raise_discord_privacy_rollback_test"()');
  await client.discordNotificationDelivery.deleteMany({
    where: { discordUserId: { in: [USER_A, USER_B] } },
  });
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

    const before = await inspectDiscordUserData(client, USER_A);
    const erased = await eraseDiscordUserData(client, USER_A);

    expect(erased).toEqual(before);
    expect(await inspectDiscordUserData(client, USER_A)).toEqual({
      priceReportSettings: 0,
      targetPriceWatches: 0,
      notificationDeliveries: 0,
      publicSettingsCreatedByUser: 0,
      publicSettingsUpdatedByUser: 0,
    });
    expect(await inspectDiscordUserData(client, USER_B)).toMatchObject({
      priceReportSettings: 1,
      targetPriceWatches: 1,
      notificationDeliveries: 2,
    });
    expect(await client.product.count({ where: { id: productId } })).toBe(1);
    expect(await client.sourceCategory.count({ where: { id: categoryId } })).toBe(1);
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
    });
  });

  it("rolls back every earlier deletion when a later table delete fails", async () => {
    await seedSharedData();
    await seedUser(USER_A, productId);
    await client.$executeRawUnsafe(`
      CREATE FUNCTION "raise_discord_privacy_rollback_test"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'rollback test';
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.$executeRawUnsafe(`
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
