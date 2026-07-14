// apps/crawler/src/scripts/ops/production-smoke-daemon.ts
// 定期執行 production smoke，持久化 progress，並依 per-check policy 發送 admin 告警。

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@partsradar/db";
import {
  loadWorkspaceEnv,
  resolveWorkspaceRoot,
  toSafeCliErrorMessage,
} from "../shared/script-utils";
import {
  type DiscordWebhookSendOptions,
  type DiscordWebhookSendResult,
  sendDiscordWebhookMessage,
} from "./discord-webhook";
import type { ProductionSmokeSummary, SmokeStatus } from "./production-smoke";
import { runProductionSmoke } from "./production-smoke";
import {
  HELP_FLAG,
  type ProductionSmokeDaemonOptions,
  parseProductionSmokeDaemonOptions,
  printHelp,
} from "./production-smoke-daemon/options";
import {
  markSmokeCycleCompleted,
  markSmokeCycleFailed,
  markSmokeCycleStarted,
  sanitizeSmokeErrorKind,
} from "./production-smoke-daemon/progress";
import { createOpsLogger } from "./shared/logger";
import {
  applyMonitorFailureObservation,
  createEmptySmokeDiscordNotificationState,
  createSmokeDiscordNotificationDecision,
  markSmokeNotificationSent,
  readSmokeDiscordNotificationState,
  type SmokeDiscordNotificationOptions,
  type SmokeDiscordNotificationStateV2,
  writeSmokeDiscordNotificationState,
} from "./smoke-discord-notification";
import { createMonitorExecutionFailureMessage } from "./smoke-discord-notification/message";
import type { SmokeNotificationCandidate } from "./smoke-discord-notification/policy";

const logger = createOpsLogger();

export interface ShutdownController {
  readonly requested: boolean;
  sleep(ms: number): Promise<void>;
}

interface RunProductionSmokeDaemonOptions {
  client: PrismaClient;
  options: ProductionSmokeDaemonOptions;
  shutdown: ShutdownController;
  logMessage?: (message: string) => void;
  logWarning?: (message: string) => void;
  sendDiscordWebhook?: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
  runSmoke?: typeof runProductionSmoke;
  now?: () => Date;
  createRunId?: () => string;
  runWithTimeout?: <T>(task: Promise<T>, timeoutMs: number) => Promise<T>;
}

export class SmokeCycleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Production smoke cycle exceeded ${timeoutMs}ms.`);
    this.name = "SmokeCycleTimeoutError";
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes(HELP_FLAG)) {
    printHelp();
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  await loadWorkspaceEnv(workspaceRoot);
  const options = parseProductionSmokeDaemonOptions(args);
  let client: PrismaClient | null = null;
  const shutdown = createShutdownController();

  try {
    const db = await import("@partsradar/db");
    client = db.prisma;
    log(
      `Production smoke daemon started. interval=${options.intervalSeconds}s initialDelay=${options.initialDelaySeconds}s cycleTimeoutMs=${options.cycleTimeoutMs} runOnce=${options.runOnce ? "yes" : "no"} baseUrl=${toSafeCliErrorMessage(options.baseUrl)}`,
    );
    await runProductionSmokeDaemon({ client, options, shutdown });
  } finally {
    await client?.$disconnect();
    log("Production smoke daemon stopped.");
  }
}

export async function runProductionSmokeDaemon({
  client,
  options,
  shutdown,
  logMessage = log,
  logWarning = warnLog,
  sendDiscordWebhook = sendDiscordWebhookMessage,
  runSmoke = runProductionSmoke,
  now = () => new Date(),
  createRunId = randomUUID,
  runWithTimeout = withSmokeCycleTimeout,
}: RunProductionSmokeDaemonOptions): Promise<void> {
  if (!options.runOnce && options.initialDelaySeconds > 0) {
    logMessage(`Waiting ${options.initialDelaySeconds}s before first production smoke check.`);
    await shutdown.sleep(options.initialDelaySeconds * 1000);
  }

  do {
    const runId = createRunId();
    const startedAt = now();
    let state = await readStateSafely(options.smokeDiscordNotification.stateFilePath, logWarning);
    state = markSmokeCycleStarted(state, startedAt);
    await writeStateSafely(options.smokeDiscordNotification.stateFilePath, state, logMessage);
    logMessage(`Production smoke cycle start. runId=${runId} startedAt=${startedAt.toISOString()}`);

    try {
      const summary = await runWithTimeout(runSmoke(client, options), options.cycleTimeoutMs);
      const completedAt = now();
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
      const decision = createSmokeDiscordNotificationDecision({
        summary,
        previousState: state,
        options: options.smokeDiscordNotification,
      });
      state = markSmokeCycleCompleted(decision.nextState, {
        completedAt,
        durationMs,
        outcome: summary.status,
      });
      const observationPersisted = await writeStateSafely(
        options.smokeDiscordNotification.stateFilePath,
        state,
        logMessage,
      );
      const delivery = observationPersisted
        ? await deliverNotifications({
            state,
            notifications: decision.notifications,
            options: options.smokeDiscordNotification,
            sendDiscordWebhook,
            logMessage,
            sentAt: completedAt,
          })
        : { state, action: "state_write_failed" };
      state = delivery.state;
      const counts = countChecksByStatus(summary);
      logMessage(
        `Production smoke cycle finish. runId=${runId} startedAt=${startedAt.toISOString()} durationMs=${durationMs} outcome=${summary.status} ok=${counts.OK} warn=${counts.WARN} fail=${counts.FAIL} notification=${delivery.action}`,
      );
      logProductionSmokeIssues(summary, logMessage);
    } catch (error) {
      const completedAt = now();
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
      const outcome = error instanceof SmokeCycleTimeoutError ? "TIMEOUT" : "ERROR";
      const errorKind = sanitizeSmokeErrorKind(error);
      const failureDecision = applyMonitorFailureObservation({
        previousState: state,
        outcome,
        errorKind,
        observedAt: completedAt,
        options: options.smokeDiscordNotification,
      });
      state = markSmokeCycleFailed(failureDecision.nextState, {
        completedAt,
        durationMs,
        outcome,
        errorKind,
      });
      const observationPersisted = await writeStateSafely(
        options.smokeDiscordNotification.stateFilePath,
        state,
        logMessage,
      );
      const notification = failureDecision.notifications[0];
      let notificationAction = observationPersisted ? "none" : "state_write_failed";
      if (observationPersisted && notification) {
        const delivery = await deliverNotifications({
          state,
          notifications: [
            {
              ...notification,
              message: createMonitorExecutionFailureMessage({
                outcome,
                occurredAt: completedAt,
                errorKind,
              }),
            },
          ],
          options: options.smokeDiscordNotification,
          sendDiscordWebhook,
          logMessage,
          sentAt: completedAt,
        });
        state = delivery.state;
        notificationAction = delivery.action;
      }
      logMessage(
        `Production smoke cycle finish. runId=${runId} startedAt=${startedAt.toISOString()} durationMs=${durationMs} outcome=${outcome} ok=0 warn=0 fail=0 notification=${notificationAction} errorKind=${errorKind}`,
      );
      throw error;
    }

    if (options.runOnce || shutdown.requested) {
      break;
    }

    const nextRunAt = new Date(now().getTime() + options.intervalSeconds * 1000).toISOString();
    logMessage(`Next production smoke check at ${nextRunAt} (${options.intervalSeconds}s).`);
    await shutdown.sleep(options.intervalSeconds * 1000);
  } while (!shutdown.requested);
}

export function logProductionSmokeDaemonSummary(
  summary: ProductionSmokeSummary,
  logMessage: (message: string) => void,
): void {
  const counts = countChecksByStatus(summary);
  logMessage(
    `Production smoke finished. status=${summary.status} ok=${counts.OK} warn=${counts.WARN} fail=${counts.FAIL}`,
  );
  logProductionSmokeIssues(summary, logMessage);
}

export function withSmokeCycleTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new SmokeCycleTimeoutError(timeoutMs)), timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function logProductionSmokeIssues(
  summary: ProductionSmokeSummary,
  logMessage: (message: string) => void,
): void {
  for (const check of summary.checks) {
    if (check.status !== "OK") {
      logMessage(
        `Production smoke issue. status=${check.status} check=${check.name} message=${toSafeCliErrorMessage(check.message)}`,
      );
    }
  }
}

function countChecksByStatus(summary: ProductionSmokeSummary): Record<SmokeStatus, number> {
  const counts: Record<SmokeStatus, number> = { OK: 0, WARN: 0, FAIL: 0 };
  for (const check of summary.checks) {
    counts[check.status] += 1;
  }
  return counts;
}

async function readStateSafely(
  path: string,
  logMessage: (message: string) => void,
): Promise<SmokeDiscordNotificationStateV2> {
  try {
    return (
      (await readSmokeDiscordNotificationState(path)) ?? createEmptySmokeDiscordNotificationState()
    );
  } catch {
    logMessage(
      "Production smoke state is invalid; using an empty state without deleting the file.",
    );
    return createEmptySmokeDiscordNotificationState();
  }
}

async function writeStateSafely(
  path: string,
  state: SmokeDiscordNotificationStateV2,
  logMessage: (message: string) => void,
): Promise<boolean> {
  try {
    await writeSmokeDiscordNotificationState(path, state);
    return true;
  } catch (error) {
    logMessage(`Production smoke state could not be written: ${toSafeCliErrorMessage(error)}`);
    return false;
  }
}

async function deliverNotifications({
  state,
  notifications,
  options,
  sendDiscordWebhook,
  logMessage,
  sentAt,
}: {
  state: SmokeDiscordNotificationStateV2;
  notifications: Array<
    SmokeNotificationCandidate & { message: DiscordWebhookSendOptions["message"] }
  >;
  options: SmokeDiscordNotificationOptions;
  sendDiscordWebhook: (options: DiscordWebhookSendOptions) => Promise<DiscordWebhookSendResult>;
  logMessage: (message: string) => void;
  sentAt: Date;
}): Promise<{ state: SmokeDiscordNotificationStateV2; action: string }> {
  if (notifications.length === 0) {
    return { state, action: "none" };
  }
  if (!options.adminWebhookUrl) {
    return { state, action: "missing_webhook" };
  }

  let nextState = state;
  const actions: string[] = [];
  for (const notification of notifications) {
    let result: DiscordWebhookSendResult;
    try {
      result = await sendDiscordWebhook({
        webhookUrl: options.adminWebhookUrl,
        message: notification.message,
      });
    } catch (error) {
      logMessage(`Smoke Discord notification failed. message=${toSafeCliErrorMessage(error)}`);
      actions.push("failed");
      continue;
    }

    if (result.status !== "sent") {
      logDiscordDeliveryFailure(result, logMessage);
      actions.push(result.status);
      continue;
    }

    const notifiedState = markSmokeNotificationSent({
      state: nextState,
      notification,
      sentAt,
    });
    if (await writeStateSafely(options.stateFilePath, notifiedState, logMessage)) {
      nextState = notifiedState;
      actions.push(`sent_${notification.kind.toLowerCase()}`);
      logMessage(
        `Smoke Discord notification sent. kind=${notification.kind} httpStatus=${result.httpStatus}`,
      );
    } else {
      actions.push("sent_state_write_failed");
    }
  }

  return { state: nextState, action: actions.join(",") || "none" };
}

function logDiscordDeliveryFailure(
  result: Exclude<DiscordWebhookSendResult, { status: "sent" }>,
  logMessage: (message: string) => void,
): void {
  if (result.status === "rate_limited") {
    logMessage(
      `Smoke Discord notification rate limited. retryAfterMs=${result.retryAfterMs} global=${result.global ? "yes" : "no"}`,
    );
  } else if (result.status === "failed") {
    logMessage(
      `Smoke Discord notification failed. httpStatus=${result.httpStatus ?? "none"} message=${toSafeCliErrorMessage(result.message)}`,
    );
  } else {
    logMessage(`Smoke Discord notification skipped by sender. reason=${result.reason}`);
  }
}

function createShutdownController(): ShutdownController {
  let stopRequested = false;
  let wakeSleeper: (() => void) | null = null;
  const requestStop = (signal: NodeJS.Signals): void => {
    if (!stopRequested) {
      log(`Received ${signal}; stopping after the current smoke check.`);
    }
    stopRequested = true;
    wakeSleeper?.();
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  return {
    get requested() {
      return stopRequested;
    },
    sleep(ms: number) {
      return new Promise((resolve) => {
        if (stopRequested) {
          resolve();
          return;
        }
        const timeoutId = setTimeout(() => {
          wakeSleeper = null;
          resolve();
        }, ms);
        wakeSleeper = () => {
          clearTimeout(timeoutId);
          wakeSleeper = null;
          resolve();
        };
      });
    },
  };
}

function log(message: string): void {
  logger.info(message);
}

function warnLog(message: string): void {
  logger.warn(message);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(toSafeCliErrorMessage(error));
    process.exitCode = 1;
  });
}
