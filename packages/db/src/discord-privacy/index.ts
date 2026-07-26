// packages/db/src/discord-privacy/index.ts
// 集中盤點與刪除 Discord user / guild 資料，讓 ops 工具共用同一個 transaction contract。

import type { Prisma, PrismaClient } from "@prisma/client";

export interface DiscordUserDataSummary {
  priceReportSettings: number;
  targetPriceWatches: number;
  notificationDeliveries: number;
  publicSettingsCreatedByUser: number;
  publicSettingsUpdatedByUser: number;
}

export interface DiscordGuildDataSummary {
  publicReportSettings: number;
  publicReportDeliveries: number;
  unlinkedPublicReportDeliveries: number;
}

export interface DiscordUserEraseResult extends DiscordUserDataSummary {}
export interface DiscordGuildEraseResult extends DiscordGuildDataSummary {}

type PrivacyClient = Pick<
  PrismaClient,
  | "$transaction"
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportDelivery"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

type PrivacyTransactionClient = Pick<
  Prisma.TransactionClient,
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportDelivery"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

export async function inspectDiscordUserData(
  client: PrivacyClient | PrivacyTransactionClient,
  discordUserId: string,
): Promise<DiscordUserDataSummary> {
  const [
    priceReportSettings,
    targetPriceWatches,
    notificationDeliveries,
    publicSettingsCreatedByUser,
    publicSettingsUpdatedByUser,
  ] = await Promise.all([
    client.discordPriceReportSetting.count({ where: { discordUserId } }),
    client.discordTargetPriceWatch.count({ where: { discordUserId } }),
    client.discordNotificationDelivery.count({ where: { discordUserId } }),
    client.discordPublicPriceReportSetting.count({
      where: { createdByDiscordUserId: discordUserId },
    }),
    client.discordPublicPriceReportSetting.count({
      where: { updatedByDiscordUserId: discordUserId },
    }),
  ]);

  return {
    priceReportSettings,
    targetPriceWatches,
    notificationDeliveries,
    publicSettingsCreatedByUser,
    publicSettingsUpdatedByUser,
  };
}

export async function eraseDiscordUserData(
  client: PrivacyClient,
  discordUserId: string,
): Promise<DiscordUserEraseResult> {
  return client.$transaction(async (transaction) => {
    const before = await inspectDiscordUserData(transaction, discordUserId);

    await transaction.discordNotificationDelivery.deleteMany({ where: { discordUserId } });
    await transaction.discordTargetPriceWatch.deleteMany({ where: { discordUserId } });
    await transaction.discordPriceReportSetting.deleteMany({ where: { discordUserId } });
    await transaction.discordPublicPriceReportSetting.updateMany({
      where: { createdByDiscordUserId: discordUserId },
      data: { createdByDiscordUserId: null },
    });
    await transaction.discordPublicPriceReportSetting.updateMany({
      where: { updatedByDiscordUserId: discordUserId },
      data: { updatedByDiscordUserId: null },
    });

    return before;
  });
}

export async function inspectDiscordGuildData(
  client: PrivacyClient | PrivacyTransactionClient,
  discordGuildId: string,
): Promise<DiscordGuildDataSummary> {
  const settings = await client.discordPublicPriceReportSetting.findMany({
    where: { discordGuildId },
    select: { id: true, channelId: true },
  });
  const settingIds = settings.map(({ id }) => id);
  const channelIds = settings.map(({ channelId }) => channelId);
  const [publicReportDeliveries, unlinkedPublicReportDeliveries] =
    settingIds.length === 0
      ? [0, 0]
      : await Promise.all([
          client.discordPublicPriceReportDelivery.count({
            where: { publicPriceReportSettingId: { in: settingIds } },
          }),
          client.discordPublicPriceReportDelivery.count({
            where: {
              publicPriceReportSettingId: null,
              channelId: { in: channelIds },
            },
          }),
        ]);

  return {
    publicReportSettings: settings.length,
    publicReportDeliveries,
    unlinkedPublicReportDeliveries,
  };
}

export async function eraseDiscordGuildData(
  client: PrivacyClient,
  discordGuildId: string,
): Promise<DiscordGuildEraseResult> {
  return client.$transaction(async (transaction) => {
    const before = await inspectDiscordGuildData(transaction, discordGuildId);

    if (before.unlinkedPublicReportDeliveries > 0) {
      throw new Error(
        "Guild erase refused because legacy delivery metadata cannot be linked safely.",
      );
    }

    const settings = await transaction.discordPublicPriceReportSetting.findMany({
      where: { discordGuildId },
      select: { id: true },
    });
    const settingIds = settings.map(({ id }) => id);

    if (settingIds.length > 0) {
      await transaction.discordPublicPriceReportDelivery.deleteMany({
        where: { publicPriceReportSettingId: { in: settingIds } },
      });
    }
    await transaction.discordPublicPriceReportSetting.deleteMany({ where: { discordGuildId } });

    return before;
  });
}
