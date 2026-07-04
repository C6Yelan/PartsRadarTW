import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ProductionSmokeSummary,
  SmokeCheckResult,
  SmokeStatus,
} from "../../../src/scripts/ops/production-smoke";
import type { SmokeDiscordNotificationState } from "../../../src/scripts/ops/smoke-discord-notification";

export const WEBHOOK_URL = "https://discord.com/api/webhooks/1234567890/token_ABC.def-ghi";

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
  return {
    name,
    status,
    message,
  };
}

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
