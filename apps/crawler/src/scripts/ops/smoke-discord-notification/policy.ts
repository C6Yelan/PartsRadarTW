// apps/crawler/src/scripts/ops/smoke-discord-notification/policy.ts
// 將 smoke summary 轉成 per-check pending、active、reminder 與 stable recovery 決策。

import type { ProductionSmokeSummary, SmokeCheckResult, SmokeStatus } from "../production-smoke";
import type {
  SmokeAlertClassification,
  SmokeCheckAlertState,
  SmokeCycleOutcome,
  SmokeDiscordNotificationKind,
  SmokeDiscordNotificationStateV2,
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
  nextState: SmokeDiscordNotificationStateV2;
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
  previousState: SmokeDiscordNotificationStateV2;
  options: SmokeAlertPolicyOptions;
}): SmokeAlertObservationDecision {
  const nextState: SmokeDiscordNotificationStateV2 = {
    ...previousState,
    checks: { ...previousState.checks },
    legacyNotification: null,
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
    const previousCheck =
      previousState.checks[stateKey] ?? reconcileLegacyCheck(previousState, check, options);
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
  previousState: SmokeDiscordNotificationStateV2;
  outcome: Extract<SmokeCycleOutcome, "ERROR" | "TIMEOUT">;
  errorKind: string;
  observedAt: Date;
  options: SmokeAlertPolicyOptions;
}): SmokeAlertObservationDecision {
  const observedAtIso = observedAt.toISOString();
  const fingerprint = `${MONITOR_EXECUTION_STATE_KEY}|FAIL|PAGE|${outcome}`;
  const previousCheck = previousState.checks[MONITOR_EXECUTION_STATE_KEY];
  const sameIncident = previousCheck?.currentFingerprint === fingerprint;
  const consecutiveBad = sameIncident ? previousCheck.consecutiveBad + 1 : 1;
  const incidentSince = sameIncident
    ? (previousCheck.activeSince ?? previousCheck.pendingSince ?? observedAtIso)
    : observedAtIso;
  const pendingSince = sameIncident && previousCheck.activeSince ? null : incidentSince;
  const nextCheck: SmokeCheckAlertState = {
    checkName: MONITOR_EXECUTION_STATE_KEY,
    classification: "PAGE",
    lastObservedStatus: "FAIL",
    lastObservedAt: observedAtIso,
    currentFingerprint: fingerprint,
    pendingSince,
    activeSince: sameIncident ? (previousCheck?.activeSince ?? null) : null,
    consecutiveBad,
    consecutiveGood: 0,
    lastNotificationKind: sameIncident ? (previousCheck?.lastNotificationKind ?? null) : null,
    lastNotificationAt: sameIncident ? (previousCheck?.lastNotificationAt ?? null) : null,
    lastNotifiedFingerprint: sameIncident ? (previousCheck?.lastNotifiedFingerprint ?? null) : null,
  };

  const alreadyNotified =
    nextCheck.lastNotifiedFingerprint === fingerprint && nextCheck.lastNotificationKind === "FAIL";
  const shouldNotify = !alreadyNotified || isReminderDue(nextCheck, "FAIL", observedAtIso, options);

  return {
    nextState: {
      ...previousState,
      checks: { ...previousState.checks, [MONITOR_EXECUTION_STATE_KEY]: nextCheck },
      legacyNotification: null,
    },
    notifications: shouldNotify
      ? [
          {
            stateKey: MONITOR_EXECUTION_STATE_KEY,
            kind: "FAIL",
            checkName: MONITOR_EXECUTION_STATE_KEY,
            classification: "PAGE",
            fingerprint,
            firstObservedAt: nextCheck.activeSince ?? pendingSince ?? observedAtIso,
            observedAt: observedAtIso,
            consecutiveCount: consecutiveBad,
            issue: errorKind,
            previousStatus: null,
          },
        ]
      : [],
  };
}

export function markSmokeNotificationSent({
  state,
  notification,
  sentAt,
}: {
  state: SmokeDiscordNotificationStateV2;
  notification: SmokeNotificationCandidate;
  sentAt: Date;
}): SmokeDiscordNotificationStateV2 {
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
  const sameIncident = previousCheck?.currentFingerprint === fingerprint;
  const consecutiveBad = sameIncident ? previousCheck.consecutiveBad + 1 : 1;
  const incidentSince = sameIncident
    ? (previousCheck.activeSince ?? previousCheck.pendingSince ?? observedAt)
    : observedAt;
  const pendingSince = sameIncident && previousCheck.activeSince ? null : incidentSince;
  const nextCheck: SmokeCheckAlertState = {
    checkName: check.name,
    classification,
    lastObservedStatus: check.status,
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

  if (classification === "REPORT") {
    return { nextCheck, notification: null };
  }

  const threshold = getPendingThreshold(check, options);
  if (consecutiveBad < threshold) {
    return { nextCheck, notification: null };
  }

  const alreadyNotified =
    nextCheck.lastNotifiedFingerprint === fingerprint &&
    (nextCheck.lastNotificationKind === "WARN" || nextCheck.lastNotificationKind === "FAIL");
  if (alreadyNotified && !isReminderDue(nextCheck, check.status, observedAt, options)) {
    return { nextCheck, notification: null };
  }

  return {
    nextCheck,
    notification: {
      stateKey,
      kind: check.status,
      checkName: check.name,
      classification,
      fingerprint,
      firstObservedAt: nextCheck.activeSince ?? pendingSince ?? observedAt,
      observedAt,
      consecutiveCount: consecutiveBad,
      issue: check.message,
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

function reconcileLegacyCheck(
  state: SmokeDiscordNotificationStateV2,
  check: SmokeCheckResult,
  options: SmokeAlertPolicyOptions,
): SmokeCheckAlertState | null {
  const legacy = state.legacyNotification;
  if (!legacy || check.status === "OK" || legacy.lastObservedStatus !== check.status) {
    return null;
  }

  const keyMatches =
    legacy.lastNotificationKey?.includes(`:${check.status}:${check.name}`) ?? false;
  const hasStructuredKey =
    legacy.lastNotificationKey?.startsWith(`${legacy.lastObservedStatus}:`) ?? false;
  if (hasStructuredKey && !keyMatches) {
    return null;
  }

  const classification = classifySmokeCheck(check);
  const fingerprint = createSmokeFingerprint(check.name, check.status, classification);
  const wasNotified =
    legacy.lastNotificationAt !== null &&
    (legacy.lastNotificationKind === "WARN" || legacy.lastNotificationKind === "FAIL");

  return {
    checkName: check.name,
    classification,
    lastObservedStatus: check.status,
    lastObservedAt: legacy.lastObservedAt,
    currentFingerprint: fingerprint,
    pendingSince: wasNotified ? null : legacy.lastObservedAt,
    activeSince: wasNotified ? legacy.lastObservedAt : null,
    consecutiveBad: wasNotified ? getPendingThreshold(check, options) : 0,
    consecutiveGood: 0,
    lastNotificationKind: legacy.lastNotificationKind,
    lastNotificationAt: legacy.lastNotificationAt,
    lastNotifiedFingerprint: wasNotified ? fingerprint : null,
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
