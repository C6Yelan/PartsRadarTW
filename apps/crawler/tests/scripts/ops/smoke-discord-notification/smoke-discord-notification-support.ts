// apps/crawler/tests/scripts/ops/smoke-discord-notification/smoke-discord-notification-support.ts
// 提供 smoke v2 policy 測試共用的 summary、check、state 與 policy fixtures。

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ProductionSmokeSummary,
  SmokeCheckResult,
  SmokeStatus,
} from "../../../../src/scripts/ops/production-smoke";
import {
  createEmptySmokeDiscordNotificationState,
  type SmokeCheckAlertState,
  type SmokeDiscordNotificationState,
} from "../../../../src/scripts/ops/smoke-discord-notification";
import type { SmokeAlertPolicyOptions } from "../../../../src/scripts/ops/smoke-discord-notification/policy";

export const WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";
export const POLICY_OPTIONS: SmokeAlertPolicyOptions = {
  warningPendingCycles: 2,
  filterQualityPendingCycles: 3,
  recoveryGoodCycles: 2,
  warnReminderSeconds: 43_200,
  failReminderSeconds: 3_600,
};

export async function createWorkspace() {
  return mkdtemp(join(tmpdir(), "partsradar-smoke-discord-"));
}

export function summary({
  status,
  checkedAt = new Date("2026-06-06T12:00:00.000Z"),
  checks,
}: {
  status: SmokeStatus;
  checkedAt?: Date;
  checks?: SmokeCheckResult[];
}): ProductionSmokeSummary {
  return {
    checkedAt,
    status,
    checks:
      checks ?? (status === "OK" ? [check("homepage", "OK")] : [check("source freshness", status)]),
  };
}

export function check(
  name: string,
  status: SmokeStatus,
  message = `${name} ${status}`,
): SmokeCheckResult {
  return { name, status, message };
}

export function state(
  overrides: Partial<SmokeDiscordNotificationState> = {},
): SmokeDiscordNotificationState {
  return { ...createEmptySmokeDiscordNotificationState(), ...overrides };
}

export function checkState(
  overrides: Partial<SmokeCheckAlertState> & Pick<SmokeCheckAlertState, "checkName">,
): SmokeCheckAlertState {
  return {
    classification: "WARNING",
    lastObservedStatus: "OK",
    lastObservedAt: "2026-06-06T11:00:00.000Z",
    currentFingerprint: null,
    pendingSince: null,
    activeSince: null,
    consecutiveBad: 0,
    consecutiveGood: 0,
    lastNotificationKind: null,
    lastNotificationAt: null,
    lastNotifiedFingerprint: null,
    ...overrides,
  };
}
