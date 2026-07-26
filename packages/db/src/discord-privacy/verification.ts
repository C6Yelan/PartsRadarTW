// packages/db/src/discord-privacy/verification.ts
// 建立、驗證與取消短期一次性 Discord 帳號控制權驗證；DB 只保存 scrypt digest。

import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_CODE_DIGITS = 8;
const VERIFICATION_MAX_ATTEMPTS = 5;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export type DiscordPrivacyRequestType = "INSPECT" | "ERASE";

type VerificationClient = Pick<PrismaClient, "$transaction" | "discordPrivacyVerificationRequest">;

export interface CreatedDiscordPrivacyVerification {
  requestId: string;
  requestType: DiscordPrivacyRequestType;
  discordUserId: string;
  code: string;
  expiresAt: Date;
}

export async function createDiscordPrivacyVerification({
  client,
  requestType,
  discordUserId,
  now = new Date(),
}: {
  client: VerificationClient;
  requestType: DiscordPrivacyRequestType;
  discordUserId: string;
  now?: Date;
}): Promise<CreatedDiscordPrivacyVerification> {
  const code = randomInt(0, 10 ** VERIFICATION_CODE_DIGITS)
    .toString()
    .padStart(VERIFICATION_CODE_DIGITS, "0");
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS);
  const request = await client.discordPrivacyVerificationRequest.create({
    data: {
      requestType,
      discordUserId,
      codeDigest: digestVerificationCode(code),
      expiresAt,
      maxAttempts: VERIFICATION_MAX_ATTEMPTS,
    },
    select: { id: true },
  });

  return {
    requestId: request.id,
    requestType,
    discordUserId,
    code,
    expiresAt,
  };
}

export type VerifyDiscordPrivacyCodeResult =
  | { status: "verified"; requestType: DiscordPrivacyRequestType; expiresAt: Date }
  | {
      status:
        | "not_found"
        | "invalid"
        | "expired"
        | "cancelled"
        | "already_verified"
        | "already_consumed"
        | "attempts_exhausted";
      attemptsRemaining?: number;
    };

export async function verifyDiscordPrivacyCode({
  client,
  requestId,
  code,
  now = new Date(),
}: {
  client: VerificationClient;
  requestId: string;
  code: string;
  now?: Date;
}): Promise<VerifyDiscordPrivacyCodeResult> {
  return client.$transaction(
    async (transaction) => {
      const request = await transaction.discordPrivacyVerificationRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) {
        return { status: "not_found" };
      }
      if (request.consumedAt) {
        return { status: "already_consumed" };
      }
      if (request.cancelledAt) {
        return { status: "cancelled" };
      }
      if (request.verifiedAt) {
        return { status: "already_verified" };
      }
      if (request.attemptCount >= request.maxAttempts) {
        return { status: "attempts_exhausted" };
      }
      if (request.expiresAt.getTime() <= now.getTime()) {
        return { status: "expired" };
      }

      if (!verifyCodeDigest(code, request.codeDigest)) {
        const nextAttemptCount = request.attemptCount + 1;
        const exhausted = nextAttemptCount >= request.maxAttempts;
        await transaction.discordPrivacyVerificationRequest.update({
          where: { id: request.id },
          data: {
            attemptCount: nextAttemptCount,
            ...(exhausted ? { cancelledAt: now } : {}),
          },
        });

        return exhausted
          ? { status: "attempts_exhausted" }
          : {
              status: "invalid",
              attemptsRemaining: request.maxAttempts - nextAttemptCount,
            };
      }

      await transaction.discordPrivacyVerificationRequest.update({
        where: { id: request.id },
        data: { verifiedAt: now },
      });

      return {
        status: "verified",
        requestType: request.requestType,
        expiresAt: request.expiresAt,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function cancelDiscordPrivacyVerification({
  client,
  requestId,
  now = new Date(),
}: {
  client: VerificationClient;
  requestId: string;
  now?: Date;
}): Promise<boolean> {
  const result = await client.discordPrivacyVerificationRequest.updateMany({
    where: {
      id: requestId,
      verifiedAt: null,
      consumedAt: null,
      cancelledAt: null,
    },
    data: { cancelledAt: now },
  });

  return result.count > 0;
}

export async function readDiscordPrivacyVerificationStatus({
  client,
  requestId,
  now = new Date(),
}: {
  client: VerificationClient;
  requestId: string;
  now?: Date;
}): Promise<{
  requestId: string;
  requestType: DiscordPrivacyRequestType;
  discordUserId: string;
  status: "pending" | "verified" | "consumed" | "cancelled" | "expired";
  expiresAt: Date;
  attemptsRemaining: number;
} | null> {
  const request = await client.discordPrivacyVerificationRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    return null;
  }

  return {
    requestId: request.id,
    requestType: request.requestType,
    discordUserId: request.discordUserId,
    status: request.consumedAt
      ? "consumed"
      : request.cancelledAt
        ? "cancelled"
        : request.expiresAt.getTime() <= now.getTime()
          ? "expired"
          : request.verifiedAt
            ? "verified"
            : "pending",
    expiresAt: request.expiresAt,
    attemptsRemaining: Math.max(0, request.maxAttempts - request.attemptCount),
  };
}

function digestVerificationCode(code: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(code, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

function verifyCodeDigest(code: string, encodedDigest: string): boolean {
  const [algorithm, cost, blockSize, parallelization, saltText, digestText] =
    encodedDigest.split("$");

  if (
    algorithm !== "scrypt" ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !saltText ||
    !digestText
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(digestText, "base64url");
    const actual = scryptSync(code, Buffer.from(saltText, "base64url"), expected.length, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    });

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
