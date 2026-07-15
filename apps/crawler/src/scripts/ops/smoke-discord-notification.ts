// apps/crawler/src/scripts/ops/smoke-discord-notification.ts
// 解析 smoke 告警設定，並將 summary observation 與 Discord transport 決策解耦。

import {
  getStringArg,
  parseBoundedIntegerOption,
  resolveWorkspacePathArgument,
} from "../shared/script-utils";
import { type DiscordWebhookMessage, readDiscordWebhookUrl } from "./discord-webhook";
import type { ProductionSmokeSummary } from "./production-smoke";
import { createCheckNotificationMessage } from "./smoke-discord-notification/message";
import {
  applySmokeSummaryObservation,
  type SmokeAlertPolicyOptions,
  type SmokeNotificationCandidate,
} from "./smoke-discord-notification/policy";
import {
  createEmptySmokeDiscordNotificationState,
  type SmokeDiscordNotificationState,
} from "./smoke-discord-notification/state";

const DEFAULT_STATE_FILE = "storage/ops/smoke-discord-state.json";
const DEFAULT_WARN_REMINDER_SECONDS = 12 * 60 * 60;
const DEFAULT_FAIL_REMINDER_SECONDS = 60 * 60;
const DEFAULT_WARNING_PENDING_CYCLES = 2;
const DEFAULT_FILTER_QUALITY_PENDING_CYCLES = 3;
const DEFAULT_RECOVERY_GOOD_CYCLES = 2;

export {
  applyMonitorFailureObservation,
  applySmokeSummaryObservation,
  markSmokeNotificationSent,
} from "./smoke-discord-notification/policy";
export type {
  SmokeCheckAlertState,
  SmokeCycleOutcome,
  SmokeDiscordNotificationState,
} from "./smoke-discord-notification/state";
export {
  createEmptySmokeDiscordNotificationState,
  parseSmokeDiscordNotificationState,
  readSmokeDiscordNotificationState,
  writeSmokeDiscordNotificationState,
} from "./smoke-discord-notification/state";

export interface SmokeDiscordNotificationOptions extends SmokeAlertPolicyOptions {
  adminWebhookUrl: string | null;
  stateFilePath: string;
}

export interface SmokeNotificationDeliveryCandidate extends SmokeNotificationCandidate {
  message: DiscordWebhookMessage;
}

export interface SmokeDiscordNotificationDecision {
  nextState: SmokeDiscordNotificationState;
  notifications: SmokeNotificationDeliveryCandidate[];
}

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
    warnReminderSeconds: parseBoundedIntegerOption({
      args,
      env,
      argName: "--smoke-discord-cooldown-seconds",
      envName: "SMOKE_DISCORD_COOLDOWN_SECONDS",
      fallback: DEFAULT_WARN_REMINDER_SECONDS,
      min: DEFAULT_WARN_REMINDER_SECONDS,
      max: 7 * 24 * 60 * 60,
    }),
    failReminderSeconds: parseBoundedIntegerOption({
      args,
      env,
      argName: "--smoke-fail-reminder-seconds",
      envName: "SMOKE_FAIL_REMINDER_SECONDS",
      fallback: DEFAULT_FAIL_REMINDER_SECONDS,
      min: 60,
      max: 7 * 24 * 60 * 60,
    }),
    warningPendingCycles: parseBoundedIntegerOption({
      args,
      env,
      argName: "--smoke-warning-pending-cycles",
      envName: "SMOKE_WARNING_PENDING_CYCLES",
      fallback: DEFAULT_WARNING_PENDING_CYCLES,
      min: 1,
      max: 12,
    }),
    filterQualityPendingCycles: parseBoundedIntegerOption({
      args,
      env,
      argName: "--smoke-filter-quality-pending-cycles",
      envName: "SMOKE_FILTER_QUALITY_PENDING_CYCLES",
      fallback: DEFAULT_FILTER_QUALITY_PENDING_CYCLES,
      min: 1,
      max: 12,
    }),
    recoveryGoodCycles: parseBoundedIntegerOption({
      args,
      env,
      argName: "--smoke-recovery-good-cycles",
      envName: "SMOKE_RECOVERY_GOOD_CYCLES",
      fallback: DEFAULT_RECOVERY_GOOD_CYCLES,
      min: 1,
      max: 12,
    }),
  };
}

export function createSmokeDiscordNotificationDecision({
  summary,
  previousState,
  options,
}: {
  summary: ProductionSmokeSummary;
  previousState: SmokeDiscordNotificationState | null;
  options: SmokeAlertPolicyOptions;
}): SmokeDiscordNotificationDecision {
  const decision = applySmokeSummaryObservation({
    summary,
    previousState: previousState ?? createEmptySmokeDiscordNotificationState(),
    options,
  });

  return {
    nextState: decision.nextState,
    notifications: decision.notifications.map((notification) => ({
      ...notification,
      message: createCheckNotificationMessage(notification),
    })),
  };
}
