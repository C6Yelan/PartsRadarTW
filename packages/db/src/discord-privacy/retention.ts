// packages/db/src/discord-privacy/retention.ts
// Discord privacy retention 的單一工程預設與可重複 dry-run / cleanup contract。

import type { Prisma, PrismaClient } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DISCORD_RETENTION_POLICY = {
  disabledPersonalSettingMs: 30 * DAY_MS,
  disabledPublicPermissionMs: 30 * DAY_MS,
  disabledPublicResourceMs: 60 * DAY_MS,
  deliveryMetadataMs: 30 * DAY_MS,
  completedVerificationMs: 7 * DAY_MS,
} as const;

export interface DiscordRetentionSummary {
  personalDeliveries: number;
  publicDeliveries: number;
  disabledPriceReportSettings: number;
  disabledTargetPriceWatches: number;
  expiredPublicReportSettings: number;
  verificationRequests: number;
}

type RetentionClient = Pick<
  PrismaClient | Prisma.TransactionClient,
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPrivacyVerificationRequest"
  | "discordPublicPriceReportDelivery"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

export async function inspectDiscordRetentionCandidates(
  client: RetentionClient,
  now = new Date(),
): Promise<DiscordRetentionSummary> {
  const personalCutoff = new Date(
    now.getTime() - DISCORD_RETENTION_POLICY.disabledPersonalSettingMs,
  );
  const deliveryCutoff = new Date(now.getTime() - DISCORD_RETENTION_POLICY.deliveryMetadataMs);
  const verificationCutoff = new Date(
    now.getTime() - DISCORD_RETENTION_POLICY.completedVerificationMs,
  );
  const [
    personalDeliveries,
    publicDeliveries,
    disabledPriceReportSettings,
    disabledTargetPriceWatches,
    expiredPublicReportSettings,
    verificationRequests,
  ] = await Promise.all([
    client.discordNotificationDelivery.count({ where: { createdAt: { lte: deliveryCutoff } } }),
    client.discordPublicPriceReportDelivery.count({
      where: { createdAt: { lte: deliveryCutoff } },
    }),
    client.discordPriceReportSetting.count({
      where: { enabled: false, disabledAt: { lte: personalCutoff } },
    }),
    client.discordTargetPriceWatch.count({
      where: { enabled: false, disabledAt: { lte: personalCutoff } },
    }),
    client.discordPublicPriceReportSetting.count({ where: { purgeAfter: { lte: now } } }),
    client.discordPrivacyVerificationRequest.count({
      where: {
        OR: [
          { consumedAt: { lte: verificationCutoff } },
          { cancelledAt: { lte: verificationCutoff } },
          { expiresAt: { lte: verificationCutoff } },
        ],
      },
    }),
  ]);

  return {
    personalDeliveries,
    publicDeliveries,
    disabledPriceReportSettings,
    disabledTargetPriceWatches,
    expiredPublicReportSettings,
    verificationRequests,
  };
}

export async function cleanupDiscordRetention(
  client: Pick<PrismaClient, "$transaction">,
  now = new Date(),
): Promise<DiscordRetentionSummary> {
  return client.$transaction(async (transaction) => {
    const candidates = await inspectDiscordRetentionCandidates(transaction, now);
    const personalCutoff = new Date(
      now.getTime() - DISCORD_RETENTION_POLICY.disabledPersonalSettingMs,
    );
    const deliveryCutoff = new Date(now.getTime() - DISCORD_RETENTION_POLICY.deliveryMetadataMs);
    const verificationCutoff = new Date(
      now.getTime() - DISCORD_RETENTION_POLICY.completedVerificationMs,
    );

    await transaction.discordNotificationDelivery.deleteMany({
      where: { createdAt: { lte: deliveryCutoff } },
    });
    await transaction.discordPublicPriceReportDelivery.deleteMany({
      where: { createdAt: { lte: deliveryCutoff } },
    });
    await transaction.discordTargetPriceWatch.deleteMany({
      where: { enabled: false, disabledAt: { lte: personalCutoff } },
    });
    await transaction.discordPriceReportSetting.deleteMany({
      where: { enabled: false, disabledAt: { lte: personalCutoff } },
    });
    await transaction.discordPublicPriceReportSetting.deleteMany({
      where: { purgeAfter: { lte: now } },
    });
    await transaction.discordPrivacyVerificationRequest.deleteMany({
      where: {
        OR: [
          { consumedAt: { lte: verificationCutoff } },
          { cancelledAt: { lte: verificationCutoff } },
          { expiresAt: { lte: verificationCutoff } },
        ],
      },
    });

    return candidates;
  });
}

export function resolveDiscordPublicReportPurgeAfter({
  accessStatus,
  disabledAt,
}: {
  accessStatus: "PAUSED_PERMISSION" | "DISABLED_CHANNEL_GONE" | "DISABLED_BOT_REMOVED";
  disabledAt: Date;
}): Date {
  const retentionMs =
    accessStatus === "PAUSED_PERMISSION"
      ? DISCORD_RETENTION_POLICY.disabledPublicPermissionMs
      : DISCORD_RETENTION_POLICY.disabledPublicResourceMs;

  return new Date(disabledAt.getTime() + retentionMs);
}
