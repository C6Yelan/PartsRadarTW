// apps/crawler/src/scripts/ops/discord-privacy/runner.ts
// 執行 verification、user/guild privacy domain 與 retention cleanup，輸出不含完整 Discord ID。

import type { PrismaClient } from "@partsradar/db";
import {
  cancelDiscordPrivacyVerification,
  cleanupDiscordRetention,
  createDiscordPrivacyVerification,
  eraseDiscordGuildData,
  eraseVerifiedDiscordUserData,
  inspectDiscordGuildData,
  inspectDiscordRetentionCandidates,
  inspectVerifiedDiscordUserData,
  readDiscordPrivacyVerificationStatus,
  verifyDiscordPrivacyCode,
} from "@partsradar/db/discord-privacy";
import type { DiscordBotMessage, DiscordMessageSendResult } from "../discord-bot/types";
import type { DiscordPrivacyCommand } from "./options";

type PrivacyClient = Pick<
  PrismaClient,
  | "$transaction"
  | "discordNotificationDelivery"
  | "discordPriceReportSetting"
  | "discordPrivacyVerificationRequest"
  | "discordPublicPriceReportDelivery"
  | "discordPublicPriceReportSetting"
  | "discordTargetPriceWatch"
>;

export async function runDiscordPrivacyCommand({
  client,
  command,
  code,
  now = new Date(),
  sendVerificationDm,
}: {
  client: PrivacyClient;
  command: DiscordPrivacyCommand;
  code?: string;
  now?: Date;
  sendVerificationDm?: (
    discordUserId: string,
    messages: DiscordBotMessage[],
  ) => Promise<DiscordMessageSendResult>;
}): Promise<Record<string, unknown>> {
  if (command.action === "create-verification") {
    if (!sendVerificationDm) {
      throw new Error("Discord verification DM transport is required.");
    }
    const verification = await createDiscordPrivacyVerification({
      client,
      requestType: command.requestType,
      discordUserId: command.subjectId,
      now,
    });
    let sendResult: DiscordMessageSendResult;

    try {
      sendResult = await sendVerificationDm(
        verification.discordUserId,
        createVerificationMessages(verification),
      );
    } catch {
      await cancelDiscordPrivacyVerification({
        client,
        requestId: verification.requestId,
        now,
      });
      throw new Error("Discord verification DM could not be delivered.");
    }

    if (sendResult.status !== "sent") {
      await cancelDiscordPrivacyVerification({
        client,
        requestId: verification.requestId,
        now,
      });
      throw new Error("Discord verification DM could not be delivered.");
    }

    return {
      action: command.action,
      requestId: verification.requestId,
      subject: maskDiscordId(verification.discordUserId),
      requestType: verification.requestType.toLowerCase(),
      status: "pending",
      expiresAt: verification.expiresAt,
    };
  }

  if (command.action === "verify-code") {
    if (!code || !/^\d{8}$/.test(code)) {
      throw new Error("Verification code must contain exactly 8 digits.");
    }
    return {
      action: command.action,
      requestId: command.requestId,
      ...(await verifyDiscordPrivacyCode({
        client,
        requestId: command.requestId,
        code,
        now,
      })),
    };
  }

  if (command.action === "cancel-verification") {
    return {
      action: command.action,
      requestId: command.requestId,
      cancelled: await cancelDiscordPrivacyVerification({
        client,
        requestId: command.requestId,
        now,
      }),
    };
  }

  if (command.action === "show-verification-status") {
    const status = await readDiscordPrivacyVerificationStatus({
      client,
      requestId: command.requestId,
      now,
    });

    return status
      ? {
          action: command.action,
          requestId: status.requestId,
          requestType: status.requestType.toLowerCase(),
          ...(status.discordUserId ? { subject: maskDiscordId(status.discordUserId) } : {}),
          status: status.status,
          expiresAt: status.expiresAt,
          attemptsRemaining: status.attemptsRemaining,
        }
      : { action: command.action, requestId: command.requestId, status: "not_found" };
  }

  if (command.action === "inspect-user") {
    const result = await inspectVerifiedDiscordUserData({
      client,
      requestId: command.requestId,
      now,
    });
    return {
      action: command.action,
      requestId: command.requestId,
      subject: maskDiscordId(result.discordUserId),
      counts: result.counts,
    };
  }

  if (command.action === "erase-user") {
    if (!command.execute) {
      return {
        action: command.action,
        requestId: command.requestId,
        dryRun: true,
        message: "No personal data was queried or deleted.",
      };
    }
    const result = await eraseVerifiedDiscordUserData({
      client,
      requestId: command.requestId,
      now,
    });
    return {
      action: command.action,
      requestId: command.requestId,
      subject: maskDiscordId(result.discordUserId),
      dryRun: false,
      counts: result.counts,
    };
  }

  if (command.action === "inspect-guild") {
    return {
      action: command.action,
      subject: maskDiscordId(command.subjectId),
      dryRun: true,
      counts: await inspectDiscordGuildData(client, command.subjectId),
    };
  }

  if (command.action === "erase-guild") {
    return {
      action: command.action,
      subject: maskDiscordId(command.subjectId),
      dryRun: !command.execute,
      counts: command.execute
        ? await eraseDiscordGuildData(client, command.subjectId)
        : await inspectDiscordGuildData(client, command.subjectId),
    };
  }

  return {
    action: command.action,
    dryRun: !command.execute,
    counts: command.execute
      ? await cleanupDiscordRetention(client, now)
      : await inspectDiscordRetentionCandidates(client, now),
  };
}

export function maskDiscordId(value: string): string {
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}

function createVerificationMessages({
  requestId,
  requestType,
  code,
  expiresAt,
}: {
  requestId: string;
  requestType: "INSPECT" | "ERASE";
  code: string;
  expiresAt: Date;
}): DiscordBotMessage[] {
  const requestLabel = requestType === "INSPECT" ? "資料查詢" : "資料刪除";

  return [
    {
      content: [
        `PartsRadarTW ${requestLabel}帳號控制權驗證`,
        `案件編號：${requestId}`,
        `驗證碼：${code}`,
        `到期時間：${expiresAt.toISOString()}`,
        "請在原 Email thread 回覆此驗證碼。若非本人提出申請，請忽略本訊息。",
      ].join("\n"),
    },
  ];
}
