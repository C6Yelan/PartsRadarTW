// apps/crawler/src/scripts/ops/smoke-discord-notification/policy.ts
// 將 smoke summary 轉成 per-check pending、active、reminder 與 stable recovery 決策。

import type { ProductionSmokeSummary, SmokeCheckResult, SmokeStatus } from "../production-smoke";
import type {
  SmokeAlertClassification,
  SmokeCheckAlertState,
  SmokeCycleOutcome,
  SmokeDiscordNotificationKind,
  SmokeDiscordNotificationState,
} from "./state";

const FILTER_QUALITY_CHECK_NAME = "product filter quality";
const REPORT_CHECK_NAMES = new Set(["recent suspected blocks"]);
export const MONITOR_EXECUTION_STATE_KEY = "production smoke execution";

export interface SmokeAlertPolicyOptions {
  warningPendingCycles: number;
  filterQualityPendingCycles: number;
  recoveryGoodCycles: number;
  warnReminderSeconds: number;
  failReminderSeconds: number;
}

export interface SmokeNotificationCandidate {
  stateKey: string;
  kind: SmokeDiscordNotificationKind;
  checkName: string;
  classification: SmokeAlertClassification;
  fingerprint: string;
  firstObservedAt: string;
  observedAt: string;
  consecutiveCount: number;
  issue: string;
  previousStatus: Exclude<SmokeStatus, "OK"> | null;
}

export interface SmokeAlertObservationDecision {
  nextState: SmokeDiscordNotificationState;
  notifications: SmokeNotificationCandidate[];
}

// FAIL 是立即 PAGE；一般 WARN 屬 WARNING，低訊號歷史觀測依明確 check name 列為 REPORT。
export function classifySmokeCheck(check: SmokeCheckResult): SmokeAlertClassification {
  if (check.status === "FAIL") {
    return "PAGE";
  }

  if (REPORT_CHECK_NAMES.has(check.name)) {
    return "REPORT";
  }

  return "WARNING";
}

export function createSmokeFingerprint(
  checkName: string,
  status: Exclude<SmokeStatus, "OK">,
  classification: SmokeAlertClassification,
): string {
  return `${checkName}|${status}|${classification}`;
}

export function applySmokeSummaryObservation({
  summary,
  previousState,
  options,
}: {
  summary: ProductionSmokeSummary;
  previousState: SmokeDiscordNotificationState;
  options: SmokeAlertPolicyOptions;
}): SmokeAlertObservationDecision {
  const nextState: SmokeDiscordNotificationState = {
    ...previousState,
    checks: { ...previousState.checks },
  };
  const notifications: SmokeNotificationCandidate[] = [];
  if (previousState.checks[MONITOR_EXECUTION_STATE_KEY]) {
    const monitorRecovery = observeCheck({
      check: {
        name: MONITOR_EXECUTION_STATE_KEY,
        status: "OK",
        message: "production smoke completed",
      },
      previousCheck: previousState.checks[MONITOR_EXECUTION_STATE_KEY],
      observedAt: summary.checkedAt.toISOString(),
      options,
      stateKey: MONITOR_EXECUTION_STATE_KEY,
    });
    nextState.checks[MONITOR_EXECUTION_STATE_KEY] = monitorRecovery.nextCheck;
    if (monitorRecovery.notification) {
      notifications.push(monitorRecovery.notification);
    }
  }

  for (const check of summary.checks) {
    const stateKey = check.name;
    const previousCheck = previousState.checks[stateKey] ?? null;
    const decision = observeCheck({
      check,
      previousCheck,
      observedAt: summary.checkedAt.toISOString(),
      options,
      stateKey,
    });

    nextState.checks[stateKey] = decision.nextCheck;
    if (decision.notification) {
      notifications.push(decision.notification);
    }
  }

  return { nextState, notifications };
}

export function applyMonitorFailureObservation({
  previousState,
  outcome,
  errorKind,
  observedAt,
  options,
}: {
  previousState: SmokeDiscordNotificationState;
  outcome: Extract<SmokeCycleOutcome, "ERROR" | "TIMEOUT">;
  errorKind: string;
  observedAt: Date;
  options: SmokeAlertPolicyOptions;
}): SmokeAlertObservationDecision {
  const observedAtIso = observedAt.toISOString();
  const fingerprint = `${MONITOR_EXECUTION_STATE_KEY}|FAIL|PAGE|${outcome}`;
  const decision = observeAbnormalCheck({
    stateKey: MONITOR_EXECUTION_STATE_KEY,
    checkName: MONITOR_EXECUTION_STATE_KEY,
    status: "FAIL",
    classification: "PAGE",
    fingerprint,
    issue: errorKind,
    previousCheck: previousState.checks[MONITOR_EXECUTION_STATE_KEY] ?? null,
    observedAt: observedAtIso,
    notificationThreshold: 1,
    notificationHistoryKinds: ["FAIL"],
    options,
  });

  return {
    nextState: {
      ...previousState,
      checks: {
        ...previousState.checks,
        [MONITOR_EXECUTION_STATE_KEY]: decision.nextCheck,
      },
    },
    notifications: decision.notification ? [decision.notification] : [],
  };
}

export function markSmokeNotificationSent({
  state,
  notification,
  sentAt,
}: {
  state: SmokeDiscordNotificationState;
  notification: SmokeNotificationCandidate;
  sentAt: Date;
}): SmokeDiscordNotificationState {
  const current = state.checks[notification.stateKey];
  if (!current) {
    return state;
  }

  const sentAtIso = sentAt.toISOString();
  const recovered = notification.kind === "RECOVERED";

  return {
    ...state,
    checks: {
      ...state.checks,
      [notification.stateKey]: {
        ...current,
        activeSince: recovered ? null : (current.activeSince ?? notification.firstObservedAt),
        pendingSince: null,
        consecutiveGood: recovered ? 0 : current.consecutiveGood,
        lastNotificationKind: notification.kind,
        lastNotificationAt: sentAtIso,
        lastNotifiedFingerprint: notification.fingerprint,
      },
    },
  };
}

function observeCheck({
  check,
  previousCheck,
  observedAt,
  options,
  stateKey,
}: {
  check: SmokeCheckResult;
  previousCheck: SmokeCheckAlertState | null;
  observedAt: string;
  options: SmokeAlertPolicyOptions;
  stateKey: string;
}): { nextCheck: SmokeCheckAlertState; notification: SmokeNotificationCandidate | null } {
  const classification = classifySmokeCheck(check);

  if (check.status === "OK") {
    return observeGoodCheck({
      check,
      previousCheck,
      observedAt,
      classification,
      options,
      stateKey,
    });
  }

  const fingerprint = createSmokeFingerprint(check.name, check.status, classification);
  return observeAbnormalCheck({
    stateKey,
    checkName: check.name,
    status: check.status,
    classification,
    fingerprint,
    issue: check.message,
    previousCheck,
    observedAt,
    notificationThreshold: classification === "REPORT" ? null : getPendingThreshold(check, options),
    notificationHistoryKinds: ["WARN", "FAIL"],
    options,
  });
}

function observeAbnormalCheck({
  stateKey,
  checkName,
  status,
  classification,
  fingerprint,
  issue,
  previousCheck,
  observedAt,
  notificationThreshold,
  notificationHistoryKinds,
  options,
}: {
  stateKey: string;
  checkName: string;
  status: Exclude<SmokeStatus, "OK">;
  classification: SmokeAlertClassification;
  fingerprint: string;
  issue: string;
  previousCheck: SmokeCheckAlertState | null;
  observedAt: string;
  notificationThreshold: number | null;
  notificationHistoryKinds: readonly Exclude<SmokeDiscordNotificationKind, "RECOVERED">[];
  options: SmokeAlertPolicyOptions;
}): { nextCheck: SmokeCheckAlertState; notification: SmokeNotificationCandidate | null } {
  const sameIncident = previousCheck?.currentFingerprint === fingerprint;
  const consecutiveBad = sameIncident ? previousCheck.consecutiveBad + 1 : 1;
  const incidentSince = sameIncident
    ? (previousCheck.activeSince ?? previousCheck.pendingSince ?? observedAt)
    : observedAt;
  const pendingSince = sameIncident && previousCheck.activeSince ? null : incidentSince;
  const nextCheck: SmokeCheckAlertState = {
    checkName,
    classification,
    lastObservedStatus: status,
    lastObservedAt: observedAt,
    currentFingerprint: fingerprint,
    pendingSince,
    activeSince: sameIncident ? (previousCheck?.activeSince ?? null) : null,
    consecutiveBad,
    consecutiveGood: 0,
    lastNotificationKind: sameIncident ? (previousCheck?.lastNotificationKind ?? null) : null,
    lastNotificationAt: sameIncident ? (previousCheck?.lastNotificationAt ?? null) : null,
    lastNotifiedFingerprint: sameIncident ? (previousCheck?.lastNotifiedFingerprint ?? null) : null,
  };

  if (notificationThreshold === null || consecutiveBad < notificationThreshold) {
    return { nextCheck, notification: null };
  }

  const lastNotificationKind = nextCheck.lastNotificationKind;
  const alreadyNotified =
    nextCheck.lastNotifiedFingerprint === fingerprint &&
    lastNotificationKind !== null &&
    lastNotificationKind !== "RECOVERED" &&
    notificationHistoryKinds.includes(lastNotificationKind);
  if (alreadyNotified && !isReminderDue(nextCheck, status, observedAt, options)) {
    return { nextCheck, notification: null };
  }

  return {
    nextCheck,
    notification: {
      stateKey,
      kind: status,
      checkName,
      classification,
      fingerprint,
      firstObservedAt: nextCheck.activeSince ?? pendingSince ?? observedAt,
      observedAt,
      consecutiveCount: consecutiveBad,
      issue,
      previousStatus: null,
    },
  };
}

function observeGoodCheck({
  check,
  previousCheck,
  observedAt,
  classification,
  options,
  stateKey,
}: {
  check: SmokeCheckResult;
  previousCheck: SmokeCheckAlertState | null;
  observedAt: string;
  classification: SmokeAlertClassification;
  options: SmokeAlertPolicyOptions;
  stateKey: string;
}): { nextCheck: SmokeCheckAlertState; notification: SmokeNotificationCandidate | null } {
  const wasNotified = Boolean(
    previousCheck?.activeSince &&
      (previousCheck.lastNotificationKind === "WARN" ||
        previousCheck.lastNotificationKind === "FAIL"),
  );
  const consecutiveGood = wasNotified ? (previousCheck?.consecutiveGood ?? 0) + 1 : 0;
  const nextCheck: SmokeCheckAlertState = {
    checkName: check.name,
    classification,
    lastObservedStatus: "OK",
    lastObservedAt: observedAt,
    currentFingerprint: null,
    pendingSince: null,
    activeSince: wasNotified ? (previousCheck?.activeSince ?? null) : null,
    consecutiveBad: 0,
    consecutiveGood,
    lastNotificationKind: previousCheck?.lastNotificationKind ?? null,
    lastNotificationAt: previousCheck?.lastNotificationAt ?? null,
    lastNotifiedFingerprint: previousCheck?.lastNotifiedFingerprint ?? null,
  };

  if (!wasNotified || consecutiveGood < options.recoveryGoodCycles) {
    return { nextCheck, notification: null };
  }

  const previousStatus = previousCheck?.lastNotificationKind === "FAIL" ? "FAIL" : "WARN";
  return {
    nextCheck,
    notification: {
      stateKey,
      kind: "RECOVERED",
      checkName: check.name,
      classification,
      fingerprint: previousCheck?.lastNotifiedFingerprint ?? `${check.name}|${previousStatus}`,
      firstObservedAt: previousCheck?.activeSince ?? observedAt,
      observedAt,
      consecutiveCount: consecutiveGood,
      issue: check.message,
      previousStatus,
    },
  };
}

function getPendingThreshold(check: SmokeCheckResult, options: SmokeAlertPolicyOptions): number {
  if (check.status === "FAIL") {
    return 1;
  }
  return check.name === FILTER_QUALITY_CHECK_NAME
    ? options.filterQualityPendingCycles
    : options.warningPendingCycles;
}

function isReminderDue(
  state: SmokeCheckAlertState,
  status: Exclude<SmokeStatus, "OK">,
  observedAt: string,
  options: SmokeAlertPolicyOptions,
): boolean {
  if (!state.lastNotificationAt) {
    return true;
  }
  const seconds = status === "FAIL" ? options.failReminderSeconds : options.warnReminderSeconds;
  return Date.parse(observedAt) - Date.parse(state.lastNotificationAt) >= seconds * 1000;
}
