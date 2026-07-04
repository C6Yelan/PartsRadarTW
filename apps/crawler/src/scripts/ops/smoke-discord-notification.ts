// apps/crawler/src/scripts/ops/smoke-discord-notification.ts
import type { ProductionSmokeSummary } from "./production-smoke";
import { type DiscordWebhookMessage, readDiscordWebhookUrl } from "./discord-webhook";
import { getStringArg, resolveRelativeToWorkspace } from "../shared/script-utils";
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

export interface SmokeDiscordNotificationOptions {
  adminWebhookUrl: string | null;
  stateFilePath: string;
  cooldownSeconds: number;
}

export type SmokeDiscordNotificationSkipReason =
  | "missing_webhook_url"
  | "status_ok_without_previous_alert"
  | "unchanged_within_cooldown";

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

export function parseSmokeDiscordNotificationOptions(
  args: string[],
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
): SmokeDiscordNotificationOptions {
  return {
    adminWebhookUrl: readDiscordWebhookUrl(env, "DISCORD_ADMIN_WEBHOOK_URL"),
    stateFilePath: resolveRelativeToWorkspace(
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

function createAbnormalNotificationKey(summary: ProductionSmokeSummary): string {
  const abnormalChecks = summary.checks
    .filter((check) => check.status !== "OK")
    .map((check) => `${check.status}:${check.name}`)
    .sort();

  return `${summary.status}:${abnormalChecks.join("|")}`;
}

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
