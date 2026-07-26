// packages/db/src/discord-privacy/verified-user.ts
// 以已驗證 request 授權 user inspect／erase，並在同一 transaction consume 或取消案件。

import type {
  DiscordUserDataSummary,
  DiscordUserEraseResult,
  DiscordUserPrivacyClient,
  DiscordUserPrivacyTransactionClient,
} from "./user";
import {
  cancelUserVerificationRequests,
  eraseDiscordUserDataInTransaction,
  inspectDiscordUserData,
} from "./user";

export async function inspectVerifiedDiscordUserData({
  client,
  requestId,
  now = new Date(),
}: {
  client: DiscordUserPrivacyClient;
  requestId: string;
  now?: Date;
}): Promise<{ discordUserId: string; counts: DiscordUserDataSummary }> {
  return client.$transaction(async (transaction) => {
    const request = await readAuthorizedRequest(transaction, requestId, "INSPECT", now);
    const counts = await inspectDiscordUserData(transaction, request.discordUserId, now);
    await consumeAuthorizedRequest(transaction, request.id, now);
    return { discordUserId: request.discordUserId, counts };
  });
}

export async function eraseVerifiedDiscordUserData({
  client,
  requestId,
  now = new Date(),
}: {
  client: DiscordUserPrivacyClient;
  requestId: string;
  now?: Date;
}): Promise<{ discordUserId: string; counts: DiscordUserEraseResult }> {
  return client.$transaction(async (transaction) => {
    const request = await readAuthorizedRequest(transaction, requestId, "ERASE", now);
    const counts = await inspectDiscordUserData(transaction, request.discordUserId, now);
    await eraseDiscordUserDataInTransaction(transaction, request.discordUserId);
    await cancelUserVerificationRequests(transaction, request.discordUserId, now, request.id);
    await consumeAuthorizedRequest(transaction, request.id, now);
    return { discordUserId: request.discordUserId, counts };
  });
}

async function readAuthorizedRequest(
  transaction: DiscordUserPrivacyTransactionClient,
  requestId: string,
  requestType: "INSPECT" | "ERASE",
  now: Date,
) {
  const request = await transaction.discordPrivacyVerificationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      requestType: true,
      discordUserId: true,
      expiresAt: true,
      verifiedAt: true,
      consumedAt: true,
      cancelledAt: true,
    },
  });
  const discordUserId = request?.discordUserId;

  if (
    !request ||
    !discordUserId ||
    request.requestType !== requestType ||
    !request.verifiedAt ||
    request.consumedAt ||
    request.cancelledAt ||
    request.expiresAt.getTime() <= now.getTime()
  ) {
    throw new Error("A matching unexpired verified privacy request is required.");
  }

  return { ...request, discordUserId };
}

async function consumeAuthorizedRequest(
  transaction: DiscordUserPrivacyTransactionClient,
  requestId: string,
  now: Date,
): Promise<void> {
  const result = await transaction.discordPrivacyVerificationRequest.updateMany({
    where: {
      id: requestId,
      verifiedAt: { not: null },
      consumedAt: null,
      cancelledAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
      discordUserId: null,
      codeDigest: null,
    },
  });

  if (result.count !== 1) {
    throw new Error("The verified privacy request could not be consumed.");
  }
}
