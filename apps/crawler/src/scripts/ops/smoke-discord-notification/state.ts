// apps/crawler/src/scripts/ops/smoke-discord-notification/state.ts
// 讀寫 production smoke 的 durable progress 與 per-check 告警狀態，並安全升級既有 v1 檔案。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SmokeStatus } from "../production-smoke";

export const SMOKE_DISCORD_NOTIFICATION_STATE_VERSION = 2;

export type SmokeDiscordNotificationKind = "WARN" | "FAIL" | "RECOVERED";
export type SmokeAlertClassification = "PAGE" | "WARNING" | "REPORT";
export type SmokeCycleOutcome = SmokeStatus | "ERROR" | "TIMEOUT";

export interface SmokeDaemonProgressState {
  lastCycleStartedAt: string | null;
  lastCycleCompletedAt: string | null;
  lastCycleDurationMs: number | null;
  lastCycleOutcome: SmokeCycleOutcome | null;
  lastCycleErrorKind: string | null;
  consecutiveCycleErrors: number;
}

export interface SmokeCheckAlertState {
  checkName: string;
  classification: SmokeAlertClassification;
  lastObservedStatus: SmokeStatus;
  lastObservedAt: string;
  currentFingerprint: string | null;
  pendingSince: string | null;
  activeSince: string | null;
  consecutiveBad: number;
  consecutiveGood: number;
  lastNotificationKind: SmokeDiscordNotificationKind | null;
  lastNotificationAt: string | null;
  lastNotifiedFingerprint: string | null;
}

export interface LegacySmokeNotificationState {
  lastObservedStatus: SmokeStatus;
  lastObservedAt: string;
  lastNotificationKind: SmokeDiscordNotificationKind | null;
  lastNotificationAt: string | null;
  lastNotificationKey: string | null;
}

export interface SmokeDiscordNotificationStateV2 {
  version: 2;
  progress: SmokeDaemonProgressState;
  checks: Record<string, SmokeCheckAlertState>;
  legacyNotification: LegacySmokeNotificationState | null;
}

export interface SmokeDiscordNotificationStateV1 extends LegacySmokeNotificationState {
  version: 1;
}

export type SmokeDiscordNotificationState = SmokeDiscordNotificationStateV2;

export function createEmptySmokeDiscordNotificationState(): SmokeDiscordNotificationStateV2 {
  return {
    version: SMOKE_DISCORD_NOTIFICATION_STATE_VERSION,
    progress: {
      lastCycleStartedAt: null,
      lastCycleCompletedAt: null,
      lastCycleDurationMs: null,
      lastCycleOutcome: null,
      lastCycleErrorKind: null,
      consecutiveCycleErrors: 0,
    },
    checks: {},
    legacyNotification: null,
  };
}

// 讀取單一 smoke state file；v1 會在記憶體中遷移，首次成功寫入後自然成為 v2。
export async function readSmokeDiscordNotificationState(
  path: string,
): Promise<SmokeDiscordNotificationStateV2 | null> {
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  return parseSmokeDiscordNotificationState(JSON.parse(raw));
}

// 嚴格驗證 v1/v2 schema；不可信內容由 caller 決定採安全空 state 繼續。
export function parseSmokeDiscordNotificationState(
  value: unknown,
): SmokeDiscordNotificationStateV2 {
  if (!isRecord(value)) {
    throw invalidStateError();
  }

  if (value.version === 1) {
    return migrateSmokeNotificationStateV1(parseStateV1(value));
  }

  if (value.version !== SMOKE_DISCORD_NOTIFICATION_STATE_VERSION) {
    throw invalidStateError();
  }

  const progress = parseProgressState(value.progress);
  if (!isRecord(value.checks)) {
    throw invalidStateError();
  }

  const checks = Object.fromEntries(
    Object.entries(value.checks).map(([key, check]) => {
      if (!key || !isRecord(check)) {
        throw invalidStateError();
      }
      return [key, parseCheckState(check)];
    }),
  );

  return {
    version: SMOKE_DISCORD_NOTIFICATION_STATE_VERSION,
    progress,
    checks,
    legacyNotification:
      value.legacyNotification === null
        ? null
        : parseLegacyNotificationState(value.legacyNotification),
  };
}

export function migrateSmokeNotificationStateV1(
  state: SmokeDiscordNotificationStateV1,
): SmokeDiscordNotificationStateV2 {
  return {
    ...createEmptySmokeDiscordNotificationState(),
    legacyNotification: {
      lastObservedStatus: state.lastObservedStatus,
      lastObservedAt: state.lastObservedAt,
      lastNotificationKind: state.lastNotificationKind,
      lastNotificationAt: state.lastNotificationAt,
      lastNotificationKey: state.lastNotificationKey,
    },
  };
}

// 以臨時檔加 rename 原子寫入，避免 daemon 中斷留下半套 JSON。
export async function writeSmokeDiscordNotificationState(
  path: string,
  state: SmokeDiscordNotificationStateV2,
): Promise<void> {
  const validatedState = parseSmokeDiscordNotificationState(state);
  const directory = dirname(path);
  const tempPath = join(directory, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);

  await mkdir(directory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(validatedState, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

function parseStateV1(value: Record<string, unknown>): SmokeDiscordNotificationStateV1 {
  const legacy = parseLegacyNotificationState(value);
  return { version: 1, ...legacy };
}

function parseProgressState(value: unknown): SmokeDaemonProgressState {
  if (!isRecord(value)) {
    throw invalidStateError();
  }

  if (
    !isNullableIsoDate(value.lastCycleStartedAt) ||
    !isNullableIsoDate(value.lastCycleCompletedAt) ||
    !isNullableNonNegativeInteger(value.lastCycleDurationMs) ||
    !isNullableCycleOutcome(value.lastCycleOutcome) ||
    !isNullableSafeString(value.lastCycleErrorKind) ||
    !isNonNegativeInteger(value.consecutiveCycleErrors)
  ) {
    throw invalidStateError();
  }

  return {
    lastCycleStartedAt: value.lastCycleStartedAt,
    lastCycleCompletedAt: value.lastCycleCompletedAt,
    lastCycleDurationMs: value.lastCycleDurationMs,
    lastCycleOutcome: value.lastCycleOutcome,
    lastCycleErrorKind: value.lastCycleErrorKind,
    consecutiveCycleErrors: value.consecutiveCycleErrors,
  };
}

function parseCheckState(value: Record<string, unknown>): SmokeCheckAlertState {
  if (
    typeof value.checkName !== "string" ||
    value.checkName.length === 0 ||
    !isAlertClassification(value.classification) ||
    !isSmokeStatus(value.lastObservedStatus) ||
    !isIsoDate(value.lastObservedAt) ||
    !isNullableSafeString(value.currentFingerprint) ||
    !isNullableIsoDate(value.pendingSince) ||
    !isNullableIsoDate(value.activeSince) ||
    !isNonNegativeInteger(value.consecutiveBad) ||
    !isNonNegativeInteger(value.consecutiveGood) ||
    !isNullableNotificationKind(value.lastNotificationKind) ||
    !isNullableIsoDate(value.lastNotificationAt) ||
    !isNullableSafeString(value.lastNotifiedFingerprint)
  ) {
    throw invalidStateError();
  }

  return {
    checkName: value.checkName,
    classification: value.classification,
    lastObservedStatus: value.lastObservedStatus,
    lastObservedAt: value.lastObservedAt,
    currentFingerprint: value.currentFingerprint,
    pendingSince: value.pendingSince,
    activeSince: value.activeSince,
    consecutiveBad: value.consecutiveBad,
    consecutiveGood: value.consecutiveGood,
    lastNotificationKind: value.lastNotificationKind,
    lastNotificationAt: value.lastNotificationAt,
    lastNotifiedFingerprint: value.lastNotifiedFingerprint,
  };
}

function parseLegacyNotificationState(value: unknown): LegacySmokeNotificationState {
  if (!isRecord(value)) {
    throw invalidStateError();
  }
  if (
    !isSmokeStatus(value.lastObservedStatus) ||
    !isIsoDate(value.lastObservedAt) ||
    !isNullableNotificationKind(value.lastNotificationKind) ||
    !isNullableIsoDate(value.lastNotificationAt) ||
    !isNullableSafeString(value.lastNotificationKey)
  ) {
    throw invalidStateError();
  }

  return {
    lastObservedStatus: value.lastObservedStatus,
    lastObservedAt: value.lastObservedAt,
    lastNotificationKind: value.lastNotificationKind,
    lastNotificationAt: value.lastNotificationAt,
    lastNotificationKey: value.lastNotificationKey,
  };
}

function isSmokeStatus(value: unknown): value is SmokeStatus {
  return value === "OK" || value === "WARN" || value === "FAIL";
}

function isAlertClassification(value: unknown): value is SmokeAlertClassification {
  return value === "PAGE" || value === "WARNING" || value === "REPORT";
}

function isNullableCycleOutcome(value: unknown): value is SmokeCycleOutcome | null {
  return value === null || isSmokeStatus(value) || value === "ERROR" || value === "TIMEOUT";
}

function isNullableNotificationKind(value: unknown): value is SmokeDiscordNotificationKind | null {
  return value === null || value === "WARN" || value === "FAIL" || value === "RECOVERED";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isNullableIsoDate(value: unknown): value is string | null {
  return value === null || isIsoDate(value);
}

function isNullableSafeString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 500);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidStateError(): Error {
  return new Error("Invalid production smoke state file.");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
