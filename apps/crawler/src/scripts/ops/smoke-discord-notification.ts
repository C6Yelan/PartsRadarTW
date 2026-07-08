// apps/crawler/src/scripts/ops/smoke-discord-notification.ts
// 決定 production smoke admin Discord 告警是否發送，並管理 webhook 設定與通知去重狀態。

import type { ProductionSmokeSummary } from "./production-smoke";
import { type DiscordWebhookMessage, readDiscordWebhookUrl } from "./discord-webhook";
import { getStringArg, resolveWorkspacePathArgument } from "../shared/script-utils";
import {
  createAbnormalMessage,
  createRecoveredMessage,
} from "./smoke-discord-notification/message";
import {
  SMOKE_DISCORD_NOTIFICATION_STATE_VERSION,
  type SmokeDiscordNotificationKind,
  type SmokeDiscordNotificationState,
} from "./smoke-discord-notification/state";

const DEFAULT_STATE_FILE = "storage/ops/smoke-discord-state.json";
const DEFAULT_COOLDOWN_SECONDS = 3600;
const MAX_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

export {
  readSmokeDiscordNotificationState,
  writeSmokeDiscordNotificationState,
} from "./smoke-discord-notification/state";
export type {
  SmokeDiscordNotificationKind,
  SmokeDiscordNotificationState,
} from "./smoke-discord-notification/state";

// smoke Discord 告警設定；state file 用來避免相同異常在 cooldown 內重複通知。
export interface SmokeDiscordNotificationOptions {
  adminWebhookUrl: string | null;
  stateFilePath: string;
  cooldownSeconds: number;
}

// 不發送 Discord 告警時的明確原因，供 daemon log 與測試判斷。
export type SmokeDiscordNotificationSkipReason =
  | "missing_webhook_url"
  | "status_ok_without_previous_alert"
  | "unchanged_within_cooldown";

// Discord 告警決策結果；send 會附帶 message 與下一份 state，skip 只更新必要觀測狀態。
export type SmokeDiscordNotificationDecision =
  | {
      action: "send";
      kind: SmokeDiscordNotificationKind;
      notificationKey: string;
      message: DiscordWebhookMessage;
      nextState: SmokeDiscordNotificationState;
    }
  | {
      action: "skip";
      reason: SmokeDiscordNotificationSkipReason;
      nextState: SmokeDiscordNotificationState | null;
    };

// 解析 smoke Discord 告警相關 CLI/env 設定，包含 webhook、state file 與重複通知 cooldown。
export function parseSmokeDiscordNotificationOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
): SmokeDiscordNotificationOptions {
  return {
    adminWebhookUrl: readDiscordWebhookUrl(env, "DISCORD_ADMIN_WEBHOOK_URL"),
    stateFilePath: resolveWorkspacePathArgument(
      workspaceRoot,
      getStringArg(args, "--smoke-discord-state-file") ??
        env.SMOKE_DISCORD_STATE_FILE ??
        DEFAULT_STATE_FILE,
    ),
    cooldownSeconds: parseIntegerOption({
      args,
      env,
      argName: "--smoke-discord-cooldown-seconds",
      envName: "SMOKE_DISCORD_COOLDOWN_SECONDS",
      fallback: DEFAULT_COOLDOWN_SECONDS,
      min: 0,
      max: MAX_COOLDOWN_SECONDS,
    }),
  };
}

// 根據本輪 smoke summary、前次 state 與 cooldown 規則決定是否送出 WARN/FAIL/RECOVERED。
export function createSmokeDiscordNotificationDecision({
  summary,
  previousState,
  options,
  now = summary.checkedAt,
}: {
  summary: ProductionSmokeSummary;
  previousState: SmokeDiscordNotificationState | null;
  options: Pick<SmokeDiscordNotificationOptions, "adminWebhookUrl" | "cooldownSeconds">;
  now?: Date;
}): SmokeDiscordNotificationDecision {
  if (!options.adminWebhookUrl) {
    return {
      action: "skip",
      reason: "missing_webhook_url",
      nextState: previousState,
    };
  }

  if (summary.status === "OK") {
    if (previousState && previousState.lastObservedStatus !== "OK") {
      const notificationKey = `RECOVERED:${previousState.lastObservedStatus}->OK`;

      return createSendDecision({
        kind: "RECOVERED",
        notificationKey,
        message: createRecoveredMessage(summary, previousState.lastObservedStatus),
        previousState,
        summary,
        now,
      });
    }

    return {
      action: "skip",
      reason: "status_ok_without_previous_alert",
      nextState: createNextState({
        previousState,
        summary,
        now,
      }),
    };
  }

  const notificationKey = createAbnormalNotificationKey(summary);
  const shouldSend = shouldSendAbnormalNotification({
    notificationKey,
    previousState,
    summary,
    cooldownSeconds: options.cooldownSeconds,
    now,
  });

  if (!shouldSend) {
    return {
      action: "skip",
      reason: "unchanged_within_cooldown",
      nextState: createNextState({
        previousState,
        summary,
        now,
      }),
    };
  }

  return createSendDecision({
    kind: summary.status,
    notificationKey,
    message: createAbnormalMessage(summary),
    previousState,
    summary,
    now,
  });
}

// 建立 send decision，並同步產生對應的下一份去重 state。
function createSendDecision({
  kind,
  notificationKey,
  message,
  previousState,
  summary,
  now,
}: {
  kind: SmokeDiscordNotificationKind;
  notificationKey: string;
  message: DiscordWebhookMessage;
  previousState: SmokeDiscordNotificationState | null;
  summary: ProductionSmokeSummary;
  now: Date;
}): SmokeDiscordNotificationDecision {
  return {
    action: "send",
    kind,
    notificationKey,
    message,
    nextState: createNextState({
      previousState,
      summary,
      now,
      notificationKind: kind,
      notificationKey,
    }),
  };
}

// 建立下一份通知狀態；即使不發送通知，也會記錄最後觀測到的 smoke 狀態。
function createNextState({
  previousState,
  summary,
  now,
  notificationKind,
  notificationKey,
}: {
  previousState: SmokeDiscordNotificationState | null;
  summary: ProductionSmokeSummary;
  now: Date;
  notificationKind?: SmokeDiscordNotificationKind;
  notificationKey?: string;
}): SmokeDiscordNotificationState {
  return {
    version: SMOKE_DISCORD_NOTIFICATION_STATE_VERSION,
    lastObservedStatus: summary.status,
    lastObservedAt: now.toISOString(),
    lastNotificationKind: notificationKind ?? previousState?.lastNotificationKind ?? null,
    lastNotificationKey: notificationKey ?? previousState?.lastNotificationKey ?? null,
    lastNotificationAt:
      notificationKind && notificationKey
        ? now.toISOString()
        : (previousState?.lastNotificationAt ?? null),
  };
}

// 判斷同一組異常是否已在 cooldown 內通知過，避免 Discord admin webhook 被重複洗版。
function shouldSendAbnormalNotification({
  notificationKey,
  previousState,
  summary,
  cooldownSeconds,
  now,
}: {
  notificationKey: string;
  previousState: SmokeDiscordNotificationState | null;
  summary: ProductionSmokeSummary;
  cooldownSeconds: number;
  now: Date;
}): boolean {
  if (!previousState || previousState.lastObservedStatus === "OK") {
    return true;
  }

  if (previousState.lastObservedStatus !== summary.status) {
    return true;
  }

  if (previousState.lastNotificationKey !== notificationKey) {
    return true;
  }

  if (!previousState.lastNotificationAt) {
    return true;
  }

  return (
    now.getTime() - new Date(previousState.lastNotificationAt).getTime() >= cooldownSeconds * 1000
  );
}

// 將目前所有非 OK check 組成穩定 key，用來判斷異常組合是否真的改變。
function createAbnormalNotificationKey(summary: ProductionSmokeSummary): string {
  const abnormalChecks = summary.checks
    .filter((check) => check.status !== "OK")
    .map((check) => `${check.status}:${check.name}`)
    .sort();

  return `${summary.status}:${abnormalChecks.join("|")}`;
}

// 解析整數型 notification option，避免錯字或超出範圍的 env 靜默套用預設值。
function parseIntegerOption({
  args,
  env,
  argName,
  envName,
  fallback,
  min,
  max,
}: {
  args: string[];
  env: NodeJS.ProcessEnv;
  argName: string;
  envName: string;
  fallback: number;
  min: number;
  max: number;
}): number {
  const raw = getStringArg(args, argName) ?? env[envName] ?? String(fallback);
  const message = `${argName}/${envName} must be an integer between ${min} and ${max}.`;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(message);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(message);
  }

  return value;
}
