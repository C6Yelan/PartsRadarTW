// apps/crawler/tests/scripts/ops/smoke-discord-notification/smoke-discord-notification-support.ts
// 提供 smoke Discord notification 測試共用的 webhook、summary、check 與 state fixture。

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ProductionSmokeSummary,
  SmokeCheckResult,
  SmokeStatus,
} from "../../../../src/scripts/ops/production-smoke";
import type { SmokeDiscordNotificationState } from "../../../../src/scripts/ops/smoke-discord-notification";

export const WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";

// 建立隔離 workspace，供 state file 測試寫入暫存告警狀態。
export async function createWorkspace() {
  return mkdtemp(join(tmpdir(), "partsradar-smoke-discord-"));
}

// 建立 production smoke summary fixture，預設依狀態產生最小 check 集合。
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

// 建立單一 smoke check fixture，讓 notification decision 測試可精準控制 key 與狀態。
export function check(
  name: string,
  status: SmokeStatus,
  message = `${name} ${status}`,
): SmokeCheckResult {
  return {
    name,
    status,
    message,
  };
}

// 建立 smoke Discord notification state fixture，集中維持 state file schema。
export function state({
  status,
  lastObservedAt = "2026-06-06T11:00:00.000Z",
  lastNotificationKind = null,
  lastNotificationKey = null,
  lastNotificationAt = null,
}: {
  status: SmokeStatus;
  lastObservedAt?: string;
  lastNotificationKind?: SmokeDiscordNotificationState["lastNotificationKind"];
  lastNotificationKey?: string | null;
  lastNotificationAt?: string | null;
}): SmokeDiscordNotificationState {
  return {
    version: 1,
    lastObservedStatus: status,
    lastObservedAt,
    lastNotificationKind,
    lastNotificationKey,
    lastNotificationAt,
  };
}
