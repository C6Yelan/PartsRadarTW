// packages/db/src/discord-privacy/user.ts
// 盤點與刪除單一 Discord user 資料，保留既有 transaction 執行順序。

import type { Prisma, PrismaClient } from "@prisma/client";

export interface DiscordUserDataSummary {
  priceReportSettings: number;
  targetPriceWatches: number;
  notificationDeliveries: number;
  publicSettingsCreatedByUser: number;
  publicSettingsUpdatedByUser: number;
  verificationRequests: {
    total: number;
    pending: number;
    verified: number;
    consumed: number;
    cancelled: number;
    expired: number;
  };
}

export interface DiscordUserEraseResult extends DiscordUserDataSummary {}

export type DiscordUserPrivacyClient = Pick<
  PrismaClient,
  | "$transaction"
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
  | "discordPrivacyVerificationRequest"
>;

export type DiscordUserPrivacyTransactionClient = Pick<
  Prisma.TransactionClient,
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
  | "discordPrivacyVerificationRequest"
>;

export async function inspectDiscordUserData(
  client: DiscordUserPrivacyClient | DiscordUserPrivacyTransactionClient,
  discordUserId: string,
  now = new Date(),
): Promise<DiscordUserDataSummary> {
  const [
    priceReportSettings,
    targetPriceWatches,
    notificationDeliveries,
    publicSettingsCreatedByUser,
    publicSettingsUpdatedByUser,
    verificationRows,
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
    client.discordPrivacyVerificationRequest.findMany({
      where: { discordUserId },
      select: {
        expiresAt: true,
        verifiedAt: true,
        consumedAt: true,
        cancelledAt: true,
      },
    }),
  ]);

  const nowMs = now.getTime();
  return {
    priceReportSettings,
    targetPriceWatches,
    notificationDeliveries,
    publicSettingsCreatedByUser,
    publicSettingsUpdatedByUser,
    verificationRequests: {
      total: verificationRows.length,
      pending: verificationRows.filter(
        (request) =>
          !request.verifiedAt &&
          !request.consumedAt &&
          !request.cancelledAt &&
          request.expiresAt.getTime() > nowMs,
      ).length,
      verified: verificationRows.filter(
        (request) =>
          request.verifiedAt &&
          !request.consumedAt &&
          !request.cancelledAt &&
          request.expiresAt.getTime() > nowMs,
      ).length,
      consumed: verificationRows.filter((request) => request.consumedAt).length,
      cancelled: verificationRows.filter((request) => !request.consumedAt && request.cancelledAt)
        .length,
      expired: verificationRows.filter(
        (request) =>
          !request.consumedAt && !request.cancelledAt && request.expiresAt.getTime() <= nowMs,
      ).length,
    },
  };
}

export async function eraseDiscordUserData(
  client: DiscordUserPrivacyClient,
  discordUserId: string,
  now = new Date(),
): Promise<DiscordUserEraseResult> {
  return client.$transaction(async (transaction) => {
    const before = await inspectDiscordUserData(transaction, discordUserId, now);
    await eraseDiscordUserDataInTransaction(transaction, discordUserId);
    await cancelUserVerificationRequests(transaction, discordUserId, now);

    return before;
  });
}

export async function cancelUserVerificationRequests(
  transaction: DiscordUserPrivacyTransactionClient,
  discordUserId: string,
  now: Date,
  exceptRequestId?: string,
): Promise<void> {
  await transaction.discordPrivacyVerificationRequest.updateMany({
    where: {
      discordUserId,
      ...(exceptRequestId ? { id: { not: exceptRequestId } } : {}),
    },
    data: {
      discordUserId: null,
      codeDigest: null,
      cancelledAt: now,
    },
  });
}

export async function eraseDiscordUserDataInTransaction(
  transaction: DiscordUserPrivacyTransactionClient,
  discordUserId: string,
): Promise<void> {
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
}
