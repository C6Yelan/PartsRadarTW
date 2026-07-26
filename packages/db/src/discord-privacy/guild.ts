// packages/db/src/discord-privacy/guild.ts
// 盤點與刪除單一 Discord guild 及其可安全關聯的公開報告資料。

import type { Prisma, PrismaClient } from "@prisma/client";

export interface DiscordGuildDataSummary {
  publicReportSettings: number;
  publicReportDeliveries: number;
  unlinkedPublicReportDeliveries: number;
}

export interface DiscordGuildEraseResult extends DiscordGuildDataSummary {}

type DiscordGuildPrivacyClient = Pick<
  PrismaClient,
  "$transaction" | "discordPublicPriceReportDelivery" | "discordPublicPriceReportSetting"
>;

type DiscordGuildPrivacyTransactionClient = Pick<
  Prisma.TransactionClient,
  "discordPublicPriceReportDelivery" | "discordPublicPriceReportSetting"
>;

export async function inspectDiscordGuildData(
  client: DiscordGuildPrivacyClient | DiscordGuildPrivacyTransactionClient,
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
  client: DiscordGuildPrivacyClient,
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
