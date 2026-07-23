// 將公開報告 Discord 發送失敗與唯讀 access probe 結果收斂成停用或退避決策。

import type { DiscordPublicReportAccessStatus } from "@partsradar/db";
import type {
  DiscordDeliveryFailureMetadata,
  DiscordMessageSendResult,
  DiscordRestResult,
} from "../types";

const TRANSIENT_BACKOFF_MINUTES = [5, 15, 45, 120, 360] as const;

export type PublicReportDisabledAccessStatus = Exclude<DiscordPublicReportAccessStatus, "ACTIVE">;

export type DiscordPublicReportAccessProbeResult =
  | { status: "accessible" }
  | {
      status: "unavailable";
      resource: "guild" | "channel";
      result: Exclude<DiscordRestResult<unknown>, { status: "ok" }>;
    };

export type PublicReportAccessFailureDecision =
  | {
      kind: "disable";
      accessStatus: PublicReportDisabledAccessStatus;
      providerErrorCode: number | null;
    }
  | {
      kind: "retry";
      retryNotBefore: Date;
      providerErrorCode: number | null;
    }
  | {
      kind: "abort";
      providerErrorCode: number | null;
    };

export async function classifyPublicReportAccessFailure({
  result,
  settingFailureCount,
  now,
  probeAccess,
}: {
  result: Exclude<DiscordMessageSendResult, { status: "sent" }>;
  settingFailureCount: number;
  now: Date;
  probeAccess: () => Promise<DiscordPublicReportAccessProbeResult>;
}): Promise<PublicReportAccessFailureDecision> {
  if (result.status === "rate_limited") {
    return retryDecision(result, now, result.retryAfterMs);
  }

  if (result.httpStatus === 401 || result.providerErrorCode === 50014) {
    return {
      kind: "abort",
      providerErrorCode: result.providerErrorCode,
    };
  }

  if (result.providerErrorCode === 10003) {
    return disableDecision("DISABLED_CHANNEL_GONE", result.providerErrorCode);
  }

  if (result.providerErrorCode === 10004) {
    return disableDecision("DISABLED_BOT_REMOVED", result.providerErrorCode);
  }

  if (result.providerErrorCode === 50001 || result.providerErrorCode === 50013) {
    const probe = await probeAccess();

    if (probe.status === "accessible") {
      return disableDecision("PAUSED_PERMISSION", result.providerErrorCode);
    }

    if (probe.resource === "guild" && probe.result.providerErrorCode === 10004) {
      return disableDecision("DISABLED_BOT_REMOVED", probe.result.providerErrorCode);
    }

    if (probe.resource === "channel" && probe.result.providerErrorCode === 10003) {
      return disableDecision("DISABLED_CHANNEL_GONE", probe.result.providerErrorCode);
    }

    if (
      probe.resource === "channel" &&
      (probe.result.providerErrorCode === 50001 || probe.result.providerErrorCode === 50013)
    ) {
      return disableDecision("PAUSED_PERMISSION", probe.result.providerErrorCode);
    }

    if (probe.result.status === "rate_limited") {
      return retryDecision(probe.result, now, probe.result.retryAfterMs);
    }

    return retryDecision(probe.result, now, calculateTransientBackoffMs(settingFailureCount));
  }

  return retryDecision(result, now, calculateTransientBackoffMs(settingFailureCount));
}

function calculateTransientBackoffMs(currentFailureCount: number): number {
  const index = Math.min(Math.max(0, currentFailureCount), TRANSIENT_BACKOFF_MINUTES.length - 1);

  return TRANSIENT_BACKOFF_MINUTES[index] * 60_000;
}

function disableDecision(
  accessStatus: PublicReportDisabledAccessStatus,
  providerErrorCode: number | null,
): PublicReportAccessFailureDecision {
  return {
    kind: "disable",
    accessStatus,
    providerErrorCode,
  };
}

function retryDecision(
  failure: DiscordDeliveryFailureMetadata,
  now: Date,
  retryAfterMs: number,
): PublicReportAccessFailureDecision {
  return {
    kind: "retry",
    retryNotBefore: new Date(now.getTime() + Math.max(0, retryAfterMs)),
    providerErrorCode: failure.providerErrorCode,
  };
}
